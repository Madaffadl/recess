-- ============================================================
-- Recess — Host-controlled Game Start
--
-- Adds game_start(p_session uuid), called exclusively by the room host.
-- This is the server-side enforcement for the "Start Game" button that
-- appears in place of the Ready button when isHost=true.
--
-- Contract:
--   • Caller must be the room's host (room.host_id = auth.uid()).
--     host_id is resolved by joining room on slug = session.room_key.
--   • Session must be 'waiting'.
--   • Every non-host game seat must be filled and ready.
--     The host's own seat is identified by uid; the host is not
--     required to have marked themselves ready.
--   • Calls _<game_id>_initial_state() to generate the game payload,
--     then sets status='active'.
--
-- Concurrency: SELECT … FOR UPDATE serialises simultaneous calls so
-- exactly one caller can observe 'waiting' and flip the session.
--
-- Run AFTER 0017_game_ready.sql.
-- ============================================================

create or replace function public.game_start(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  s           record;
  v_room_host uuid;
  v_host_seat text;
  v_init_fn   text;
  v_game      jsonb;
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

  if s.status <> 'waiting' then
    raise exception 'game is not waiting';
  end if;

  -- Verify caller is the room host.
  select host_id into v_room_host
  from public.room
  where slug = s.room_key;

  if v_room_host is null or v_room_host <> v_uid then
    raise exception 'only the room host can start the game';
  end if;

  -- Identify which game seat the host occupies (may be null if spectating).
  if (s.state->'players'->'1'->>'id') = v_uid::text then
    v_host_seat := '1';
  elsif (s.state->'players'->'2'->>'id') = v_uid::text then
    v_host_seat := '2';
  else
    v_host_seat := null;
  end if;

  -- Every non-host seat must be filled and ready.
  if v_host_seat = '1' then
    if (s.state->'players'->'2'->>'id') is null then
      raise exception 'seat 2 is not filled';
    end if;
    if not coalesce((s.state->'ready'->>'2')::boolean, false) then
      raise exception 'player 2 is not ready';
    end if;
  elsif v_host_seat = '2' then
    if (s.state->'players'->'1'->>'id') is null then
      raise exception 'seat 1 is not filled';
    end if;
    if not coalesce((s.state->'ready'->>'1')::boolean, false) then
      raise exception 'player 1 is not ready';
    end if;
  else
    -- Host is spectating — all seats must be filled and ready.
    if (s.state->'players'->'1'->>'id') is null
       or (s.state->'players'->'2'->>'id') is null then
      raise exception 'not all seats are filled';
    end if;
    if not coalesce((s.state->'ready'->>'1')::boolean, false)
       or not coalesce((s.state->'ready'->>'2')::boolean, false) then
      raise exception 'not all players are ready';
    end if;
  end if;

  -- Dispatch to the per-game initial-state function.
  v_init_fn := '_' || replace(s.game_id, '-', '_') || '_initial_state';
  if to_regprocedure(format('%I()', v_init_fn)) is null then
    raise exception 'unknown game: %', s.game_id;
  end if;
  execute format('select %I()', v_init_fn) into v_game;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'ready',     jsonb_build_object('1', false, '2', false),
                'turn',      (s.state->>'startTurn')::int,
                'startTurn', s.state->'startTurn',
                'winner',    null,
                'moveCount', 0,
                'game',      v_game
              ),
      status = 'active'
  where id = p_session;
end;
$$;

grant execute on function public.game_start(uuid) to authenticated, anon;
