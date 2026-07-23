-- ─────────────────────────────────────────────────────────────────────────────
-- Ludo — Multiplayer (2–4 players) custom RPCs
--
-- The generic game_core dispatcher only supports 2 seats and a single move per
-- turn. Ludo needs 2–4 seats, server-authoritative DICE, and a two-phase turn
-- (roll → move). So it bypasses game_core entirely and manages its own state
-- inside game_session.state, mirroring the Word Snake approach.
--
-- Position model (per token, integer `p`) — must match src/games/ludo/logic.ts:
--   p = 0        → in base yard
--   p = 1..51    → on shared ring; abs index = (start[color] + p-1) % 52
--   p = 52..57   → private home column (6 cells)
--   p = 57       → finished (needs an EXACT roll; overshoots are illegal)
--
-- State schema (game_session.state JSONB for game_id = 'ludo'):
-- {
--   "players": [
--     { "id": "<uid>", "handle": "<name>", "color": 0..3,
--       "tokens": [p,p,p,p], "finished": false }
--   ],
--   "hostId":    "<uid>",
--   "turnIndex": 0,             -- index into players[]
--   "dice":      null | 1..6,   -- pending roll awaiting a move; null = must roll
--   "winner":    null | "<uid>",
--   "moveCount": 0,
--   "lastEvent": null | 'rolled'|'six'|'nomove'|'captured'|'home'|'win',
--   "lastMove":  null | [playerIndex, tokenIndex]
-- }
--
-- All mutations go through SECURITY DEFINER RPCs; RLS on game_session blocks
-- direct client writes. Run AFTER 0001_initial.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── pure helpers (private; only called by the RPCs below) ────────────────────

-- Where a token lands given a die, or -1 if illegal.
create or replace function public._ludo_token_target(p int, dice int)
returns int
language sql
immutable
as $$
  select case
    when p = 0            then case when dice = 6 then 1 else -1 end
    when p between 1 and 56 then case when p + dice <= 57 then p + dice else -1 end
    else -1                                    -- p = 57 (finished) or invalid
  end;
$$;

-- Absolute ring index (0..51) for a token on the ring, else -1.
create or replace function public._ludo_abs(color int, p int)
returns int
language sql
immutable
as $$
  select case
    when p between 1 and 51
    then ((array[0, 13, 26, 39])[color + 1] + p - 1) % 52
    else -1
  end;
$$;

-- Safe ring cells: the four entries + the four star cells 8 ahead.
create or replace function public._ludo_is_safe(abs int)
returns boolean
language sql
immutable
as $$
  select abs in (0, 8, 13, 21, 26, 34, 39, 47);
$$;


-- ── ludo_join ────────────────────────────────────────────────────────────────
-- Creates a session (caller becomes host / red) or takes the next open seat on a
-- waiting session. An active/full session → spectate. Returns the session UUID.
create or replace function public.ludo_join(
  p_room_key text,
  p_handle   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_sess    record;
  v_sess_id uuid;
  v_count   int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_handle is null or length(trim(p_handle)) = 0 then
    raise exception 'handle required';
  end if;

  select * into v_sess
    from public.game_session
   where room_key = p_room_key
     and game_id  = 'ludo'
     and status in ('waiting', 'active')
   order by created_at desc
   limit 1
   for update;

  if v_sess is null then
    insert into public.game_session (room_key, game_id, state, status)
    values (
      p_room_key,
      'ludo',
      jsonb_build_object(
        'players', jsonb_build_array(
          jsonb_build_object(
            'id', v_uid::text, 'handle', p_handle, 'color', 0,
            'tokens', jsonb_build_array(0, 0, 0, 0), 'finished', false
          )
        ),
        'hostId',    v_uid::text,
        'turnIndex', 0,
        'dice',      null::int,
        'winner',    null::text,
        'moveCount', 0,
        'lastEvent', null::text,
        'lastMove',  null::jsonb
      ),
      'waiting'
    )
    returning id into v_sess_id;
    return v_sess_id;
  end if;

  -- Already seated?
  if exists (
    select 1 from jsonb_array_elements(v_sess.state -> 'players') p
     where p ->> 'id' = v_uid::text
  ) then
    return v_sess.id;
  end if;

  v_count := jsonb_array_length(v_sess.state -> 'players');

  -- Open seat on a waiting game → take it (colour = join order).
  if v_sess.status = 'waiting' and v_count < 4 then
    update public.game_session
       set state = jsonb_set(
             state, '{players}',
             (state -> 'players') || jsonb_build_object(
               'id', v_uid::text, 'handle', p_handle, 'color', v_count,
               'tokens', jsonb_build_array(0, 0, 0, 0), 'finished', false
             )
           )
     where id = v_sess.id;
    return v_sess.id;
  end if;

  -- Active or full → spectate.
  return v_sess.id;
end;
$$;

grant execute on function public.ludo_join(text, text) to authenticated, anon;


-- ── ludo_start ───────────────────────────────────────────────────────────────
-- Host starts the game. Requires ≥ 2 seated players.
create or replace function public.ludo_start(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_sess record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_sess
    from public.game_session
   where id = p_session_id and game_id = 'ludo' and status = 'waiting'
   for update;

  if v_sess is null then raise exception 'session not found or already started'; end if;
  if v_sess.state ->> 'hostId' <> v_uid::text then
    raise exception 'only the host can start the game';
  end if;
  if jsonb_array_length(v_sess.state -> 'players') < 2 then
    raise exception 'need at least 2 players to start';
  end if;

  update public.game_session
     set state = jsonb_set(
           jsonb_set(
             jsonb_set(state, '{turnIndex}', '0'::jsonb),
             '{dice}', 'null'::jsonb
           ),
           '{lastEvent}', 'null'::jsonb
         ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function public.ludo_start(uuid) to authenticated, anon;


-- ── ludo_roll ────────────────────────────────────────────────────────────────
-- The active player rolls the die (server-side RNG). If they have any legal
-- move the die is stored and we await ludo_move; otherwise the turn passes.
create or replace function public.ludo_roll(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_sess    record;
  v_turn    int;
  v_cur     jsonb;
  v_dice    int;
  v_movable boolean := false;
  v_p       int;
  v_n       int;
  v_next    int;
  ti        int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_sess
    from public.game_session
   where id = p_session_id and game_id = 'ludo' and status = 'active'
   for update;
  if v_sess is null then raise exception 'game not active'; end if;

  v_turn := (v_sess.state ->> 'turnIndex')::int;
  v_cur  := v_sess.state -> 'players' -> v_turn;
  if v_cur ->> 'id' <> v_uid::text then raise exception 'not your turn'; end if;
  if coalesce(jsonb_typeof(v_sess.state -> 'dice'), 'null') <> 'null' then
    raise exception 'already rolled — move a token';
  end if;

  v_dice := floor(random() * 6) + 1;

  for ti in 0 .. 3 loop
    v_p := (v_cur -> 'tokens' ->> ti)::int;
    if public._ludo_token_target(v_p, v_dice) >= 0 then
      v_movable := true;
      exit;
    end if;
  end loop;

  if v_movable then
    update public.game_session
       set state = jsonb_set(
             jsonb_set(state, '{dice}', to_jsonb(v_dice)),
             '{lastEvent}', to_jsonb('rolled'::text)
           )
     where id = p_session_id;
  else
    -- No legal move with this roll → turn passes to the next player.
    v_n    := jsonb_array_length(v_sess.state -> 'players');
    v_next := (v_turn + 1) % v_n;
    update public.game_session
       set state = jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(state, '{dice}', 'null'::jsonb),
                 '{turnIndex}', to_jsonb(v_next)
               ),
               '{lastEvent}', to_jsonb('nomove'::text)
             ),
             '{moveCount}', to_jsonb(coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1)
           )
     where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.ludo_roll(uuid) to authenticated, anon;


-- ── ludo_move ────────────────────────────────────────────────────────────────
-- The active player moves token p_token (0..3) by the pending die. Handles
-- captures, home entry, win detection, and turn advance (a 6 grants another roll).
create or replace function public.ludo_move(p_session_id uuid, p_token int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_sess     record;
  v_turn     int;
  v_players  jsonb;
  v_cur      jsonb;
  v_color    int;
  v_dice     int;
  v_p        int;
  v_target   int;
  v_abs      int;
  v_captured boolean := false;
  v_home     boolean := false;
  v_allhome  boolean;
  v_winner   text := null;
  v_event    text;
  v_n        int;
  v_next     int;
  pi         int;
  ti         int;
  v_pcolor   int;
  v_q        int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_token is null or p_token < 0 or p_token > 3 then
    raise exception 'invalid token';
  end if;

  select * into v_sess
    from public.game_session
   where id = p_session_id and game_id = 'ludo' and status = 'active'
   for update;
  if v_sess is null then raise exception 'game not active'; end if;

  v_turn    := (v_sess.state ->> 'turnIndex')::int;
  v_players := v_sess.state -> 'players';
  v_cur     := v_players -> v_turn;
  if v_cur ->> 'id' <> v_uid::text then raise exception 'not your turn'; end if;
  if coalesce(jsonb_typeof(v_sess.state -> 'dice'), 'null') = 'null' then
    raise exception 'roll first';
  end if;

  v_dice   := (v_sess.state ->> 'dice')::int;
  v_color  := (v_cur ->> 'color')::int;
  v_p      := (v_cur -> 'tokens' ->> p_token)::int;
  v_target := public._ludo_token_target(v_p, v_dice);
  if v_target < 0 then raise exception 'illegal move'; end if;

  -- Move the active token.
  v_players := jsonb_set(
    v_players, array[v_turn::text, 'tokens', p_token::text], to_jsonb(v_target)
  );

  -- Captures — only when landing on a non-safe shared ring cell.
  if v_target between 1 and 51 then
    v_abs := public._ludo_abs(v_color, v_target);
    if not public._ludo_is_safe(v_abs) then
      v_n := jsonb_array_length(v_players);
      for pi in 0 .. v_n - 1 loop
        if pi <> v_turn then
          v_pcolor := (v_players -> pi ->> 'color')::int;
          for ti in 0 .. 3 loop
            v_q := (v_players -> pi -> 'tokens' ->> ti)::int;
            if v_q between 1 and 51 and public._ludo_abs(v_pcolor, v_q) = v_abs then
              v_players := jsonb_set(
                v_players, array[pi::text, 'tokens', ti::text], '0'::jsonb
              );
              v_captured := true;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end if;

  if v_target = 57 then v_home := true; end if;

  -- Did the mover get all four tokens home?
  v_allhome := true;
  for ti in 0 .. 3 loop
    if (v_players -> v_turn -> 'tokens' ->> ti)::int <> 57 then
      v_allhome := false;
      exit;
    end if;
  end loop;
  if v_allhome then
    v_players := jsonb_set(v_players, array[v_turn::text, 'finished'], 'true'::jsonb);
    v_winner  := v_cur ->> 'id';
  end if;

  -- Event label (priority order).
  if    v_winner is not null then v_event := 'win';
  elsif v_captured           then v_event := 'captured';
  elsif v_home               then v_event := 'home';
  elsif v_dice = 6           then v_event := 'six';
  else                            v_event := null;
  end if;

  v_n := jsonb_array_length(v_players);

  if v_winner is not null then
    update public.game_session
       set state = jsonb_build_object(
             'players',   v_players,
             'hostId',    v_sess.state ->> 'hostId',
             'turnIndex', v_turn,
             'dice',      null::int,
             'winner',    v_winner,
             'moveCount', coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1,
             'lastEvent', 'win',
             'lastMove',  jsonb_build_array(v_turn, p_token)
           ),
           status = 'finished'
     where id = p_session_id;
    return;
  end if;

  -- A 6 grants the same player another roll; otherwise advance.
  if v_dice = 6 then v_next := v_turn; else v_next := (v_turn + 1) % v_n; end if;

  update public.game_session
     set state = jsonb_build_object(
           'players',   v_players,
           'hostId',    v_sess.state ->> 'hostId',
           'turnIndex', v_next,
           'dice',      null::int,
           'winner',    null::text,
           'moveCount', coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1,
           'lastEvent', v_event,
           'lastMove',  jsonb_build_array(v_turn, p_token)
         )
   where id = p_session_id;
end;
$$;

grant execute on function public.ludo_move(uuid, int) to authenticated, anon;


-- ── ludo_rematch ─────────────────────────────────────────────────────────────
-- Any seated player restarts a finished game with the same seats/colours.
create or replace function public.ludo_rematch(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_sess    record;
  v_players jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_sess
    from public.game_session
   where id = p_session_id and game_id = 'ludo' and status = 'finished'
   for update;
  if v_sess is null then raise exception 'game not finished'; end if;

  if not exists (
    select 1 from jsonb_array_elements(v_sess.state -> 'players') p
     where p ->> 'id' = v_uid::text
  ) then
    raise exception 'not a player in this game';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'id',       p ->> 'id',
             'handle',   p ->> 'handle',
             'color',    (p ->> 'color')::int,
             'tokens',   jsonb_build_array(0, 0, 0, 0),
             'finished', false
           )
           order by (p ->> 'color')::int
         )
    into v_players
    from jsonb_array_elements(v_sess.state -> 'players') p;

  update public.game_session
     set state = jsonb_build_object(
           'players',   v_players,
           'hostId',    v_sess.state ->> 'hostId',
           'turnIndex', 0,
           'dice',      null::int,
           'winner',    null::text,
           'moveCount', 0,
           'lastEvent', null::text,
           'lastMove',  null::jsonb
         ),
         status = 'active'
   where id = p_session_id;
end;
$$;

grant execute on function public.ludo_rematch(uuid) to authenticated, anon;


-- These helpers are only ever called by the SECURITY DEFINER RPCs above.
revoke all on function public._ludo_token_target(int, int) from public;
revoke all on function public._ludo_abs(int, int)          from public;
revoke all on function public._ludo_is_safe(int)           from public;
