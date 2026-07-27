-- ============================================================
-- Recess — Generic Ready flow  (engine-level, game-agnostic)
--
-- Changes the generic multiplayer lifecycle so a game no longer
-- auto-starts when the second player joins. Instead both seated
-- players must mark themselves Ready; only then is the per-game
-- deck/board generated and the game set active.
--
-- Redefines game_join + game_rematch and adds a new RPC game_ready.
-- game_move (0002_game_core.sql) is intentionally untouched.
--
-- ── State envelope (additions) ───────────────────────────────
--   {
--     "players":   { "1": {id,handle}|null, "2": {...}|null },   -- identity only
--     "ready":     { "1": false, "2": false },                   -- runtime flags
--     "turn": 1|2, "startTurn": 1|2, "winner": null|0|1|2,
--     "moveCount": int,
--     "game": null | <game payload>     -- null until both Ready
--   }
--
-- `ready` is deliberately a SEPARATE top-level object (identity in
-- `players`, runtime state in `ready`). `game` is null (never {})
-- while uninitialised, so clients can test it explicitly.
--
-- ── Lifecycle ────────────────────────────────────────────────
--   game_join p1  -> create, status 'waiting', game null, ready all false
--   game_join p2  -> seat 2, status STAYS 'waiting'
--   game_ready    -> set ready[seat]; when BOTH seated AND both ready,
--                    run _<game>_initial_state(), set turn=startTurn,
--                    status='active'. Accepts p_ready=false to cancel.
--   game_rematch  -> reset to 'waiting', game null, ready cleared,
--                    startTurn swapped (both must Ready again).
--
-- ── FRONTEND CONTRACT (implemented in the next phase) ────────
--   • RPC: game_ready(p_session uuid, p_ready boolean default true)
--       setReady()      -> rpc('game_ready', { p_session })
--       cancelReady()   -> rpc('game_ready', { p_session, p_ready: false })
--   • state.game is null while waiting — boards must treat null as
--     "not initialised" and render the Ready panel instead of the board.
--
-- Run AFTER 0002_game_core.sql.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- game_join — create a game / take the open seat / (if full) spectate.
--
-- Change vs 0002: the game payload is NOT initialised here, and the
-- second joiner no longer flips the game to 'active'. Both happen in
-- game_ready once both players are ready.
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
  v_init_fn    text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_handle is null or length(trim(p_handle)) = 0 then
    raise exception 'handle required';
  end if;

  -- The game must be registered: its initial-state function must exist.
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

    -- Open second seat on a waiting game → take it, STAY waiting.
    if s.status = 'waiting'
       and (s.state->'players'->'2'->>'id') is null then
      update public.game_session
      set state = jsonb_set(
                    state,
                    '{players,2}',
                    jsonb_build_object('id', v_uid::text, 'handle', p_handle)
                  )
      where id = s.id;
      return s.id;
    end if;

    -- Full/active → spectate.
    return s.id;
  end if;

  -- No game yet: seat caller as player 1, wait. Game payload stays null
  -- until both players are ready (game_ready).
  insert into public.game_session (room_key, game_id, state, status)
  values (
    p_room_key,
    p_game_id,
    jsonb_build_object(
      'players',   jsonb_build_object(
                     '1', jsonb_build_object('id', v_uid::text, 'handle', p_handle),
                     '2', null
                   ),
      'ready',     jsonb_build_object('1', false, '2', false),
      'turn',      1,
      'startTurn', 1,
      'winner',    null,
      'moveCount', 0,
      'game',      null
    ),
    'waiting'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- game_ready — mark (or unmark) the calling player ready.
--
-- When both seats are filled and both players are ready, generate the
-- per-game initial state and start the game. p_ready=false cancels a
-- prior ready (only meaningful while status = 'waiting').
--
-- Concurrency: SELECT ... FOR UPDATE serialises simultaneous readies on
-- the session row, so exactly one call observes "both ready" and runs
-- initial_state — no double-deal.
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_ready(
  p_session uuid,
  p_ready   boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  s         record;
  v_seat    text;
  v_state   jsonb;
  v_init_fn text;
  v_game    jsonb;
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

  -- Ready only applies while waiting; ignore once live or finished.
  if s.status <> 'waiting' then
    return;
  end if;

  -- Caller must occupy a seat.
  if (s.state->'players'->'1'->>'id') = v_uid::text then
    v_seat := '1';
  elsif (s.state->'players'->'2'->>'id') = v_uid::text then
    v_seat := '2';
  else
    raise exception 'not a seated player';
  end if;

  -- Ensure the ready object exists (older sessions predate this field),
  -- then set this seat's flag.
  v_state := s.state;
  if v_state->'ready' is null then
    v_state := jsonb_set(v_state, '{ready}', jsonb_build_object('1', false, '2', false));
  end if;
  v_state := jsonb_set(v_state, array['ready', v_seat], to_jsonb(coalesce(p_ready, true)));

  -- Both seated and both ready → initialise and start.
  if coalesce(p_ready, true)
     and (v_state->'players'->'2'->>'id') is not null
     and coalesce((v_state->'ready'->>'1')::boolean, false)
     and coalesce((v_state->'ready'->>'2')::boolean, false)
  then
    v_init_fn := '_' || replace(s.game_id, '-', '_') || '_initial_state';
    if to_regprocedure(format('%I()', v_init_fn)) is null then
      raise exception 'unknown game: %', s.game_id;
    end if;
    execute format('select %I()', v_init_fn) into v_game;

    v_state := jsonb_set(v_state, '{game}', v_game);
    v_state := jsonb_set(v_state, '{turn}', to_jsonb((v_state->>'startTurn')::int));

    update public.game_session
    set state = v_state, status = 'active'
    where id = p_session;
  else
    update public.game_session
    set state = v_state
    where id = p_session;
  end if;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- game_rematch — reset a finished game back to the Ready lobby.
--
-- Change vs 0002: goes to 'waiting' (not 'active') with game=null and
-- ready cleared, so both players must Ready again. Previous non-starter
-- goes first.
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

  v_next_start := case when (s.state->>'startTurn')::int = 1 then 2 else 1 end;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'ready',     jsonb_build_object('1', false, '2', false),
                'turn',      v_next_start,
                'startTurn', v_next_start,
                'winner',    null,
                'moveCount', 0,
                'game',      null
              ),
      status = 'waiting'
  where id = p_session;

  return p_session;
end;
$$;


-- Signed-in (incl. anonymous) users may call the generic RPCs.
grant execute on function public.game_join(text, text, text) to authenticated, anon;
grant execute on function public.game_ready(uuid, boolean)   to authenticated, anon;
grant execute on function public.game_rematch(uuid)          to authenticated, anon;
