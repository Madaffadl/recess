-- ============================================================
-- Recess — Game Core  (generic, game-agnostic)
--
-- One set of RPCs for ALL games. They own the generic envelope
-- (seating, turn order, winner, status) and dispatch the game-specific
-- parts to per-game functions by convention:
--
--   _<game_id>_initial_state()                       -> jsonb   (empty payload)
--   _<game_id>_apply_move(game jsonb, action jsonb,
--                         player int)                -> jsonb
--        returns { "result": "continue"|"win"|"draw"|"illegal",
--                  "game": <new game payload> }
--
-- where <game_id> has hyphens replaced by underscores
-- (e.g. "connect-four" -> _connect_four_initial_state).
--
-- Adding a game = a new 000N_<game>.sql defining those two functions.
-- No changes here, and no new client wiring.
--
-- Clients cannot write game_session directly (no RLS write policy); these
-- SECURITY DEFINER functions are the only path, and they validate auth.uid()
-- against the seated player. Run AFTER 0001_initial.sql.
--
-- state envelope shape
--   {
--     "players":  { "1": {"id","handle"}, "2": {...}|null },
--     "turn": 1|2, "startTurn": 1|2, "winner": null|0|1|2,
--     "moveCount": int,
--     "game": <game-specific payload>
--   }
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- game_join — create a game / take the open seat / (if full) spectate.
-- Returns the session id.
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_join(
  p_room_key text,
  p_game_id  text,
  p_handle   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  s            record;
  v_session_id uuid;
  v_initial    jsonb;
  v_init_fn    text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_handle is null or length(trim(p_handle)) = 0 then
    raise exception 'handle required';
  end if;

  -- The game must be registered: its initial-state function must exist.
  -- (Also constrains the dynamic dispatch below to real, matching functions.)
  v_init_fn := '_' || replace(p_game_id, '-', '_') || '_initial_state';
  if to_regprocedure(format('%I()', v_init_fn)) is null then
    raise exception 'unknown game: %', p_game_id;
  end if;

  select * into s
  from public.game_session
  where room_key = p_room_key
    and game_id  = p_game_id
    and status in ('waiting', 'active')
  order by created_at desc
  limit 1
  for update;

  if found then
    -- Already seated → just return it.
    if (s.state->'players'->'1'->>'id') = v_uid::text
       or (s.state->'players'->'2'->>'id') = v_uid::text then
      return s.id;
    end if;

    -- Open second seat on a waiting game → take it and start.
    if s.status = 'waiting'
       and (s.state->'players'->'2'->>'id') is null then
      update public.game_session
      set state = jsonb_set(
                    jsonb_set(
                      state,
                      '{players,2}',
                      jsonb_build_object('id', v_uid::text, 'handle', p_handle)
                    ),
                    '{turn}',
                    to_jsonb((state->>'startTurn')::int)
                  ),
          status = 'active'
      where id = s.id;
      return s.id;
    end if;

    -- Full/active → spectate.
    return s.id;
  end if;

  -- No game yet: build the empty payload, seat caller as player 1, wait.
  execute format('select %I()', v_init_fn) into v_initial;

  insert into public.game_session (room_key, game_id, state, status)
  values (
    p_room_key,
    p_game_id,
    jsonb_build_object(
      'players',   jsonb_build_object(
                     '1', jsonb_build_object('id', v_uid::text, 'handle', p_handle),
                     '2', null
                   ),
      'turn',      1,
      'startTurn', 1,
      'winner',    null,
      'moveCount', 0,
      'game',      v_initial
    ),
    'waiting'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- game_move — validate turn, dispatch to the game's apply function,
-- then update the generic envelope (turn/winner/status).
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_move(
  p_session uuid,
  p_action  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  s          record;
  v_turn     int;
  v_apply_fn text;
  v_res      jsonb;
  v_result   text;
  v_win      boolean;
  v_draw     boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into s
  from public.game_session
  where id = p_session
  for update;

  if not found then
    raise exception 'session not found';
  end if;
  if s.status <> 'active' then
    raise exception 'game is not active';
  end if;

  v_turn := (s.state->>'turn')::int;
  if (s.state->'players'->(v_turn::text)->>'id') <> v_uid::text then
    raise exception 'not your turn';
  end if;

  v_apply_fn := '_' || replace(s.game_id, '-', '_') || '_apply_move';
  if to_regprocedure(format('%I(jsonb,jsonb,integer)', v_apply_fn)) is null then
    raise exception 'unknown game: %', s.game_id;
  end if;

  execute format('select %I($1,$2,$3)', v_apply_fn)
    into v_res
    using (s.state->'game'), p_action, v_turn;

  v_result := v_res->>'result';
  if v_result = 'illegal' then
    raise exception 'illegal move';
  end if;

  v_win  := v_result = 'win';
  v_draw := v_result = 'draw';

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      case when v_win or v_draw then v_turn else 3 - v_turn end,
                'startTurn', s.state->'startTurn',
                'winner',    case when v_win then v_turn when v_draw then 0 else null end,
                'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                'game',      v_res->'game'
              ),
      status = case when v_win or v_draw then 'finished' else 'active' end
  where id = p_session;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- game_rematch — reset a finished game; previous non-starter goes first.
-- Only a seated player may call it.
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_rematch(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  s            record;
  v_next_start int;
  v_initial    jsonb;
  v_init_fn    text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into s
  from public.game_session
  where id = p_session
  for update;

  if not found then
    raise exception 'session not found';
  end if;
  if s.status <> 'finished' then
    raise exception 'game is not finished';
  end if;
  if (s.state->'players'->'1'->>'id') <> v_uid::text
     and (s.state->'players'->'2'->>'id') <> v_uid::text then
    raise exception 'only players can rematch';
  end if;

  v_init_fn := '_' || replace(s.game_id, '-', '_') || '_initial_state';
  execute format('select %I()', v_init_fn) into v_initial;

  v_next_start := case when (s.state->>'startTurn')::int = 1 then 2 else 1 end;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      v_next_start,
                'startTurn', v_next_start,
                'winner',    null,
                'moveCount', 0,
                'game',      v_initial
              ),
      status = 'active'
  where id = p_session;

  return p_session;
end;
$$;

-- Signed-in (incl. anonymous) users may call the generic RPCs.
grant execute on function public.game_join(text, text, text) to authenticated, anon;
grant execute on function public.game_move(uuid, jsonb)       to authenticated, anon;
grant execute on function public.game_rematch(uuid)           to authenticated, anon;
