-- ─────────────────────────────────────────────────────────────────────────────
-- Word Snake — Host-configurable turn duration
--
-- Adds a `turnSeconds` field (int, 10–20) to the game state so the host can
-- choose how long each player has per turn before a life is lost.
--
-- Changes:
--   word_snake_start  — accepts p_turn_seconds int default 10
--   word_snake_submit — uses state.turnSeconds for scoring calc + next timer
--   word_snake_rematch — preserves turnSeconds across rematches
-- ─────────────────────────────────────────────────────────────────────────────


-- ── word_snake_start (updated) ───────────────────────────────────────────────
create or replace function word_snake_start(
  p_session_id   uuid,
  p_target_score int  default null,
  p_language     text default 'en',
  p_turn_seconds int  default 10
)
returns void
language plpgsql
security definer
as $$
declare
  v_uid  uuid := auth.uid();
  v_sess record;
  v_seed text;
begin
  select * into v_sess
    from public.game_session
   where id      = p_session_id
     and game_id  = 'word-snake'
     and status   = 'waiting'
   for update;

  if v_sess is null then
    raise exception 'Session not found or already started';
  end if;

  if v_sess.state ->> 'hostId' <> v_uid::text then
    raise exception 'Only the host can start the game';
  end if;

  if jsonb_array_length(v_sess.state -> 'players') < 2 then
    raise exception 'Need at least 2 players to start';
  end if;

  -- Sanitise inputs
  if p_language not in ('en', 'id') then p_language := 'en'; end if;
  if p_turn_seconds < 10 then p_turn_seconds := 10; end if;
  if p_turn_seconds > 20 then p_turn_seconds := 20; end if;

  v_seed := (array[
    'ocean', 'table', 'crane', 'flame', 'grape', 'piano', 'storm', 'light',
    'dance', 'frame', 'brush', 'clock', 'dream', 'earth', 'music', 'night',
    'plant', 'radio', 'slide', 'tiger', 'whale', 'cloud', 'fancy', 'river',
    'stone'
  ])[floor(random() * 25 + 1)::int];

  update public.game_session
     set state = state
           || jsonb_build_object(
                'chain',         to_jsonb(array[v_seed]),
                'turnExpiresAt', floor(extract(epoch from now()) * 1000)::bigint
                                   + (p_turn_seconds * 1000),
                'turnIndex',     0,
                'targetScore',   p_target_score,
                'language',      p_language,
                'turnSeconds',   p_turn_seconds
              ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function word_snake_start(uuid, int, text, int) to authenticated, anon;


-- ── word_snake_submit (updated) ──────────────────────────────────────────────
create or replace function word_snake_submit(
  p_session_id uuid,
  p_word       text
)
returns void
language plpgsql
security definer
as $$
declare
  v_uid           uuid := auth.uid();
  v_sess          record;
  v_players       jsonb;
  v_turn_idx      int;
  v_cur_player    jsonb;
  v_chain         text[];
  v_last_word     text;
  v_prompt_ltr    text;
  v_word          text;
  v_lives         int;
  v_score         int;
  v_is_valid      bool;
  v_total         int;
  v_new_idx       int;
  v_iter          int;
  v_active_cnt    int;
  v_winner_id     text;
  v_new_state     jsonb;
  -- time-based scoring
  v_turn_secs     int;
  v_turn_start_ms bigint;
  v_elapsed_s     numeric;
  v_points        int;
  -- target score
  v_target_score  int;
begin
  select * into v_sess
    from public.game_session
   where id      = p_session_id
     and game_id  = 'word-snake'
     and status   = 'active'
   for update;

  if v_sess is null then
    raise exception 'Game not active';
  end if;

  v_players      := v_sess.state -> 'players';
  v_turn_idx     := (v_sess.state ->> 'turnIndex')::int;
  v_cur_player   := v_players -> v_turn_idx;
  v_target_score := (v_sess.state ->> 'targetScore')::int; -- null if not set
  v_turn_secs    := coalesce((v_sess.state ->> 'turnSeconds')::int, 10);

  if v_cur_player ->> 'id' <> v_uid::text then
    raise exception 'Not your turn';
  end if;

  -- Extract chain
  select array_agg(elem order by ord)
    into v_chain
    from jsonb_array_elements_text(v_sess.state -> 'chain')
         with ordinality as t(elem, ord);

  v_word       := lower(trim(p_word));
  v_last_word  := v_chain[array_length(v_chain, 1)];
  v_prompt_ltr := upper(right(v_last_word, 1));
  v_lives      := (v_cur_player ->> 'lives')::int;
  v_score      := (v_cur_player ->> 'score')::int;

  -- Structural validation (dictionary checked client-side)
  v_is_valid := (
    length(v_word) >= 3
    and upper(left(v_word, 1)) = v_prompt_ltr
    and not exists (
      select 1
        from unnest(v_chain) as cw
       where lower(cw) = v_word
    )
  );

  v_winner_id := null;

  if v_is_valid then
    v_chain := v_chain || v_word;

    -- Time-based scoring: turn started (turnSeconds * 1000) ms before turnExpiresAt
    v_turn_start_ms := (v_sess.state ->> 'turnExpiresAt')::bigint - (v_turn_secs * 1000);
    v_elapsed_s     := (floor(extract(epoch from now()) * 1000) - v_turn_start_ms) / 1000.0;

    v_points := case
      when v_elapsed_s < 3 then 3  -- fast
      when v_elapsed_s < 7 then 2  -- medium
      else 1                        -- slow
    end;

    v_score   := v_score + v_points;
    v_players := jsonb_set(v_players,
                   array[v_turn_idx::text, 'score'],
                   to_jsonb(v_score));

    -- Win by target score
    if v_target_score is not null and v_score >= v_target_score then
      v_winner_id := v_uid::text;
    end if;
  else
    v_lives   := v_lives - 1;
    v_players := jsonb_set(v_players,
                   array[v_turn_idx::text, 'lives'],
                   to_jsonb(v_lives));
    if v_lives <= 0 then
      v_players := jsonb_set(v_players,
                     array[v_turn_idx::text, 'eliminated'],
                     'true'::jsonb);
    end if;
  end if;

  -- Win by last player standing (checked only if target score not yet met)
  if v_winner_id is null then
    select count(*) into v_active_cnt
      from jsonb_array_elements(v_players) as p
     where not coalesce((p ->> 'eliminated')::boolean, false);

    if v_active_cnt = 1 then
      select p ->> 'id' into v_winner_id
        from jsonb_array_elements(v_players) as p
       where not coalesce((p ->> 'eliminated')::boolean, false)
       limit 1;
    end if;
  end if;

  -- Advance turn to next non-eliminated player
  v_total   := jsonb_array_length(v_players);
  v_new_idx := v_turn_idx;
  v_iter    := 0;
  if v_winner_id is null then
    loop
      v_new_idx := (v_new_idx + 1) % v_total;
      v_iter    := v_iter + 1;
      exit when not coalesce((v_players -> v_new_idx ->> 'eliminated')::boolean, false);
      exit when v_iter >= v_total;
    end loop;
  end if;

  -- Rebuild state
  v_new_state := v_sess.state;
  v_new_state := jsonb_set(v_new_state, '{players}',   v_players);
  v_new_state := jsonb_set(v_new_state, '{chain}',
    (select jsonb_agg(w) from unnest(v_chain) as w));
  v_new_state := jsonb_set(v_new_state, '{turnIndex}',  to_jsonb(v_new_idx));
  v_new_state := jsonb_set(v_new_state, '{moveCount}',
    to_jsonb(coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1));
  v_new_state := jsonb_set(v_new_state, '{turnExpiresAt}',
    to_jsonb(floor(extract(epoch from now()) * 1000)::bigint + (v_turn_secs * 1000)));

  if v_winner_id is not null then
    v_new_state := jsonb_set(v_new_state, '{winner}', to_jsonb(v_winner_id));
    update public.game_session
       set state = v_new_state, status = 'finished'
     where id = p_session_id;
  else
    update public.game_session
       set state = v_new_state
     where id = p_session_id;
  end if;
end;
$$;

grant execute on function word_snake_submit(uuid, text) to authenticated, anon;


-- ── word_snake_rematch (updated) ─────────────────────────────────────────────
create or replace function word_snake_rematch(
  p_session_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_uid         uuid := auth.uid();
  v_sess        record;
  v_seed        text;
  v_new_players jsonb;
  v_turn_secs   int;
begin
  select * into v_sess
    from public.game_session
   where id      = p_session_id
     and game_id  = 'word-snake'
     and status   = 'finished'
   for update;

  if v_sess is null then
    raise exception 'Game not finished';
  end if;

  if not exists (
    select 1
      from jsonb_array_elements(v_sess.state -> 'players') as p
     where p ->> 'id' = v_uid::text
  ) then
    raise exception 'Not a player in this game';
  end if;

  v_turn_secs := coalesce((v_sess.state ->> 'turnSeconds')::int, 10);

  select jsonb_agg(
    jsonb_build_object(
      'id',         p ->> 'id',
      'handle',     p ->> 'handle',
      'lives',      3,
      'score',      0,
      'eliminated', false
    )
  )
  into v_new_players
  from jsonb_array_elements(v_sess.state -> 'players') as p;

  v_seed := (array[
    'ocean', 'table', 'crane', 'flame', 'grape', 'piano', 'storm', 'light',
    'dance', 'frame', 'brush', 'clock', 'dream', 'earth', 'music', 'night',
    'plant', 'radio', 'slide', 'tiger', 'whale', 'cloud', 'fancy', 'river',
    'stone'
  ])[floor(random() * 25 + 1)::int];

  update public.game_session
     set state = jsonb_build_object(
           'players',       v_new_players,
           'hostId',        v_sess.state ->> 'hostId',
           'turnIndex',     0,
           'winner',        null,
           'moveCount',     0,
           'chain',         to_jsonb(array[v_seed]),
           'turnExpiresAt', floor(extract(epoch from now()) * 1000)::bigint
                              + (v_turn_secs * 1000),
           'targetScore',   v_sess.state -> 'targetScore',
           'language',      coalesce(v_sess.state -> 'language', '"en"'::jsonb),
           'turnSeconds',   v_turn_secs
         ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function word_snake_rematch(uuid) to authenticated, anon;
