-- ─────────────────────────────────────────────────────────────────────────────
-- Word Snake — Multiplayer (2–8 players) custom RPCs
--
-- The generic game_core dispatcher only supports 2 seats.  Word Snake bypasses
-- it entirely and manages its own state inside game_session.state.
--
-- State schema (game_session.state JSONB for game_id = 'word-snake'):
-- {
--   "players": [
--     { "id": "<auth uid>", "handle": "<name>", "lives": 3, "score": 0, "eliminated": false }
--   ],
--   "hostId":       "<uid>",
--   "turnIndex":    0,           -- index into players[]
--   "winner":       null | "<uid>",
--   "moveCount":    0,
--   "chain":        ["ocean"],
--   "turnExpiresAt": <epoch-ms> | null   -- null while waiting
-- }
--
-- All mutations go through SECURITY DEFINER RPCs; the RLS on game_session
-- blocks direct client writes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the now-unused 2-player dispatcher helpers from migration 0009.
drop function if exists _word_snake_initial_state();
drop function if exists _word_snake_apply_move(jsonb, jsonb, int);


-- ── word_snake_join ─────────────────────────────────────────────────────────
-- Creates a session (caller becomes host) or joins an existing waiting session.
-- Returns the session UUID.
create or replace function word_snake_join(
  p_room_key text,
  p_handle   text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_uid     uuid := auth.uid();
  v_sess    record;
  v_sess_id uuid;
  v_players jsonb;
begin
  -- Find the most recent waiting session for this room
  select * into v_sess
    from public.game_session
   where room_key = p_room_key
     and game_id  = 'word-snake'
     and status   = 'waiting'
   order by created_at desc
   limit 1
   for update;

  if v_sess is null then
    -- No session yet — create one; caller is the host
    insert into public.game_session (room_key, game_id, state, status)
    values (
      p_room_key,
      'word-snake',
      jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object(
            'id',         v_uid::text,
            'handle',     p_handle,
            'lives',      3,
            'score',      0,
            'eliminated', false
          )
        ),
        'hostId',        v_uid::text,
        'turnIndex',     0,
        'winner',        null,
        'moveCount',     0,
        'chain',         '[]'::jsonb,
        'turnExpiresAt', null
      ),
      'waiting'
    )
    returning id into v_sess_id;
    return v_sess_id;
  end if;

  -- Already in this session?
  if exists (
    select 1
      from jsonb_array_elements(v_sess.state -> 'players') as p
     where p ->> 'id' = v_uid::text
  ) then
    return v_sess.id;
  end if;

  -- Room full?
  if jsonb_array_length(v_sess.state -> 'players') >= 8 then
    raise exception 'Room is full';
  end if;

  -- Append player
  v_players := v_sess.state -> 'players' || jsonb_build_object(
    'id',         v_uid::text,
    'handle',     p_handle,
    'lives',      3,
    'score',      0,
    'eliminated', false
  );

  update public.game_session
     set state = jsonb_set(state, '{players}', v_players)
   where id = v_sess.id;

  return v_sess.id;
end;
$$;

grant execute on function word_snake_join(text, text) to authenticated, anon;


-- ── word_snake_start ────────────────────────────────────────────────────────
-- Host starts the game. Requires ≥ 2 players.
create or replace function word_snake_start(
  p_session_id uuid
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

  v_seed := (array[
    'ocean', 'table', 'crane', 'flame', 'grape', 'piano', 'storm', 'light',
    'dance', 'frame', 'brush', 'clock', 'dream', 'earth', 'music', 'night',
    'plant', 'radio', 'slide', 'tiger', 'whale', 'cloud', 'fancy', 'river',
    'stone'
  ])[floor(random() * 25 + 1)::int];

  update public.game_session
     set state = jsonb_set(
           jsonb_set(
             jsonb_set(state, '{chain}', to_jsonb(array[v_seed])),
             '{turnExpiresAt}',
             to_jsonb(floor(extract(epoch from now() + interval '10 seconds') * 1000)::bigint)
           ),
           '{turnIndex}', '0'::jsonb
         ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function word_snake_start(uuid) to authenticated, anon;


-- ── word_snake_submit ───────────────────────────────────────────────────────
-- The active-turn player submits a word.
-- Dictionary validation happens client-side (/api/word-snake/validate).
-- This function re-validates structural rules server-side.
create or replace function word_snake_submit(
  p_session_id uuid,
  p_word       text
)
returns void
language plpgsql
security definer
as $$
declare
  v_uid        uuid := auth.uid();
  v_sess       record;
  v_players    jsonb;
  v_turn_idx   int;
  v_cur_player jsonb;
  v_chain      text[];
  v_last_word  text;
  v_prompt_ltr text;
  v_word       text;
  v_lives      int;
  v_score      int;
  v_is_valid   bool;
  v_total      int;
  v_new_idx    int;
  v_iter       int;
  v_active_cnt int;
  v_winner_id  text;
  v_new_state  jsonb;
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

  v_players    := v_sess.state -> 'players';
  v_turn_idx   := (v_sess.state ->> 'turnIndex')::int;
  v_cur_player := v_players -> v_turn_idx;

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

  -- Structural validation (dictionary already checked client-side)
  v_is_valid := (
    length(v_word) >= 3
    and upper(left(v_word, 1)) = v_prompt_ltr
    and not exists (
      select 1
        from unnest(v_chain) as cw
       where lower(cw) = v_word
    )
  );

  if v_is_valid then
    v_chain    := v_chain || v_word;
    v_score    := v_score + 1 + greatest(0, length(v_word) - 4);
    v_players  := jsonb_set(v_players,
                    array[v_turn_idx::text, 'score'],
                    to_jsonb(v_score));
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

  -- How many players still have lives?
  select count(*) into v_active_cnt
    from jsonb_array_elements(v_players) as p
   where not coalesce((p ->> 'eliminated')::boolean, false);

  v_winner_id := null;
  if v_active_cnt = 1 then
    select p ->> 'id' into v_winner_id
      from jsonb_array_elements(v_players) as p
     where not coalesce((p ->> 'eliminated')::boolean, false)
     limit 1;
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
  v_new_state := jsonb_set(v_new_state, '{players}',    v_players);
  v_new_state := jsonb_set(v_new_state, '{chain}',
    (select jsonb_agg(w) from unnest(v_chain) as w));
  v_new_state := jsonb_set(v_new_state, '{turnIndex}',  to_jsonb(v_new_idx));
  v_new_state := jsonb_set(v_new_state, '{moveCount}',
    to_jsonb(coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1));
  v_new_state := jsonb_set(v_new_state, '{turnExpiresAt}',
    to_jsonb(floor(extract(epoch from now() + interval '10 seconds') * 1000)::bigint));

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


-- ── word_snake_timeout ──────────────────────────────────────────────────────
-- Called by the client when the active player's turn timer reaches zero.
-- Delegates to word_snake_submit with an empty string (fails all structural
-- checks → the player loses a life, turn advances).
create or replace function word_snake_timeout(
  p_session_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  perform word_snake_submit(p_session_id, '');
exception when others then
  -- Silently ignore: the turn may have already advanced (race is harmless).
  null;
end;
$$;

grant execute on function word_snake_timeout(uuid) to authenticated, anon;


-- ── word_snake_rematch ──────────────────────────────────────────────────────
-- Any player in a finished game can trigger a rematch.
-- All players are restored to full lives/zero score; a new seed word is picked.
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

  -- Reset each player
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
           'turnExpiresAt', floor(extract(epoch from now() + interval '10 seconds') * 1000)::bigint
         ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function word_snake_rematch(uuid) to authenticated, anon;
