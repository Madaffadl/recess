-- ─────────────────────────────────────────────────────────────────────────────
-- Word Snake — Host-configurable game language
--
-- Adds a `language` field ("en" | "id") to the game state.
-- Dictionary validation is client-side; this field tells the client which
-- dictionary endpoint to call (/api/word-snake/validate?lang=en|id).
--
-- Changes:
--   word_snake_start   — accepts p_language text default 'en'
--   word_snake_rematch — preserves language across rematches
-- ─────────────────────────────────────────────────────────────────────────────


-- ── word_snake_start (updated) ───────────────────────────────────────────────
create or replace function word_snake_start(
  p_session_id   uuid,
  p_target_score int  default null,
  p_language     text default 'en'
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

  -- Sanitise language input
  if p_language not in ('en', 'id') then
    p_language := 'en';
  end if;

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
                'turnExpiresAt', floor(extract(epoch from now() + interval '10 seconds') * 1000)::bigint,
                'turnIndex',     0,
                'targetScore',   p_target_score,
                'language',      p_language
              ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function word_snake_start(uuid, int, text) to authenticated, anon;


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
           'turnExpiresAt', floor(extract(epoch from now() + interval '10 seconds') * 1000)::bigint,
           'targetScore',   v_sess.state -> 'targetScore',
           'language',      coalesce(v_sess.state -> 'language', '"en"'::jsonb)
         ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function word_snake_rematch(uuid) to authenticated, anon;
