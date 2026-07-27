-- ============================================================
-- Recess — N-Player Support
--
-- Extends every 2-player-hardcoded function to support up to 10
-- players dynamically. Backwards-compatible with all existing
-- 2-player sessions.
--
-- Changes in this migration
-- ─────────────────────────
--   game_join          : seat N players (not just 1 and 2); hard cap 10
--   game_ready         : find seat + all-ready check across N seats
--   game_start         : N-seat host check; dynamic ready-reset;
--                        dispatch _<game>_initial_state(integer) if it exists
--   game_rematch       : reset ready across N seats; cycle startTurn mod N
--   game_move          : N-player turn advancement (replace 3-v_turn formula)
--   game_draw          : N-player turn advancement (forced + voluntary)
--   _uno_apply_move    : N-player skip/reverse using hands key count
--   game_uno_declare   : find seat across N players (not just 1..2)
--   _uno_initial_state : new overload taking p_player_count int
--
-- Turn advancement formula (seats 1..N, direction ±1)
--   next = ((current − 1 + direction + N) % N) + 1
-- Skip formula
--   next = ((current − 1 + 2*direction + 2*N) % N) + 1
-- Reverse (N=2): play again; Reverse (N>2): advance in new direction
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- game_join — create a game / take the next open seat / spectate
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
  v_next_seat  int;
  v_seat_key   text;
  v_max_seats  int := 10;  -- hard cap matching UNO maxPlayers
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_handle is null or length(trim(p_handle)) = 0 then
    raise exception 'handle required';
  end if;

  v_init_fn := '_' || replace(p_game_id, '-', '_') || '_initial_state';
  if to_regprocedure(format('%I()', v_init_fn)) is null
     and to_regprocedure(format('%I(integer)', v_init_fn)) is null then
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
    if exists (
      select 1 from jsonb_each(s.state->'players')
      where value->>'id' = v_uid::text
    ) then
      return s.id;
    end if;

    -- Find next open seat on a waiting game.
    if s.status = 'waiting' then
      select coalesce(max(key::int), 0) + 1
      into v_next_seat
      from jsonb_each(s.state->'players');

      if v_next_seat <= v_max_seats then
        v_seat_key := v_next_seat::text;

        update public.game_session
        set state = jsonb_set(
                      jsonb_set(
                        state,
                        array['players', v_seat_key],
                        jsonb_build_object('id', v_uid::text, 'handle', p_handle)
                      ),
                      array['ready', v_seat_key],
                      'false'
                    )
        where id = s.id;
      end if;
    end if;

    -- Full / active / over cap → spectate.
    return s.id;
  end if;

  -- No session yet: seat caller as player 1.
  insert into public.game_session (room_key, game_id, state, status)
  values (
    p_room_key,
    p_game_id,
    jsonb_build_object(
      'players',   jsonb_build_object(
                     '1', jsonb_build_object('id', v_uid::text, 'handle', p_handle)
                   ),
      'ready',     jsonb_build_object('1', false),
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
-- game_ready — mark this player ready; auto-start when all N ready
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
  v_uid          uuid := auth.uid();
  s              record;
  v_seat         text;
  v_state        jsonb;
  v_init_fn      text;
  v_game         jsonb;
  v_filled_count int;
  v_ready_count  int;
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
    return;
  end if;

  -- Find caller's seat dynamically.
  select key into v_seat
  from jsonb_each(s.state->'players')
  where value->>'id' = v_uid::text
  limit 1;

  if v_seat is null then
    raise exception 'not a seated player';
  end if;

  v_state := s.state;

  -- Ensure ready map has an entry for this seat.
  if v_state->'ready' is null then
    v_state := jsonb_set(v_state, '{ready}', jsonb_build_object(v_seat, false));
  end if;
  v_state := jsonb_set(v_state, array['ready', v_seat], to_jsonb(coalesce(p_ready, true)));

  -- Count filled and ready seats for auto-start.
  select
    count(*) filter (where value->>'id' is not null),
    0
  into v_filled_count, v_ready_count
  from jsonb_each(v_state->'players');

  select count(*) into v_ready_count
  from jsonb_each(v_state->'ready')
  where value::boolean = true;

  -- Auto-start: all filled seats ready, minimum 2 players.
  if coalesce(p_ready, true)
     and v_filled_count >= 2
     and v_ready_count >= v_filled_count
  then
    v_init_fn := '_' || replace(s.game_id, '-', '_') || '_initial_state';

    if to_regprocedure(format('%I(integer)', v_init_fn)) is not null then
      execute format('select %I($1)', v_init_fn) into v_game using v_filled_count;
    elsif to_regprocedure(format('%I()', v_init_fn)) is not null then
      execute format('select %I()', v_init_fn) into v_game;
    else
      raise exception 'unknown game: %', s.game_id;
    end if;

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
-- game_start — host-controlled start supporting N non-host seats
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_start(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  s              record;
  v_room_host    uuid;
  v_host_seat    text;
  v_init_fn      text;
  v_game         jsonb;
  v_player_count int;
  v_ready_reset  jsonb;
  v_seat         text;
  v_player_val   jsonb;
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

  -- Find host's game seat (may be null if spectating).
  select key into v_host_seat
  from jsonb_each(s.state->'players')
  where value->>'id' = v_uid::text
  limit 1;

  -- Verify all non-host filled seats are ready.
  for v_seat, v_player_val in
    select key, value from jsonb_each(s.state->'players')
  loop
    if v_seat = v_host_seat then continue; end if;
    if v_player_val->>'id' is null then continue; end if;
    if not coalesce((s.state->'ready'->>v_seat)::boolean, false) then
      raise exception 'player % is not ready', v_seat;
    end if;
  end loop;

  -- Count total non-null players.
  select count(*) into v_player_count
  from jsonb_each(s.state->'players')
  where value->>'id' is not null;

  if v_player_count < 2 then
    raise exception 'need at least 2 players to start';
  end if;

  -- Dispatch to the per-game initial-state function (N-player version first).
  v_init_fn := '_' || replace(s.game_id, '-', '_') || '_initial_state';

  if to_regprocedure(format('%I(integer)', v_init_fn)) is not null then
    execute format('select %I($1)', v_init_fn) into v_game using v_player_count;
  elsif to_regprocedure(format('%I()', v_init_fn)) is not null then
    execute format('select %I()', v_init_fn) into v_game;
  else
    raise exception 'unknown game: %', s.game_id;
  end if;

  -- Build dynamic ready reset (all filled seats → false).
  select jsonb_object_agg(key, false)
  into v_ready_reset
  from jsonb_each(s.state->'players')
  where value->>'id' is not null;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'ready',     coalesce(v_ready_reset, '{}'::jsonb),
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


-- ─────────────────────────────────────────────────────────────
-- game_rematch — reset to waiting; cycle startTurn across N players
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_rematch(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  s              record;
  v_next_start   int;
  v_player_count int;
  v_ready_reset  jsonb;
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

  -- Verify caller is a seated player.
  if not exists (
    select 1 from jsonb_each(s.state->'players')
    where value->>'id' = v_uid::text
  ) then
    raise exception 'only players can rematch';
  end if;

  -- Count players and cycle startTurn.
  select count(*) into v_player_count
  from jsonb_each(s.state->'players')
  where value->>'id' is not null;

  v_next_start := ((s.state->>'startTurn')::int % v_player_count) + 1;

  -- Build dynamic ready reset.
  select jsonb_object_agg(key, false)
  into v_ready_reset
  from jsonb_each(s.state->'players')
  where value->>'id' is not null;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'ready',     coalesce(v_ready_reset, '{}'::jsonb),
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


-- ─────────────────────────────────────────────────────────────
-- game_move — N-player turn advancement
--
-- Replaces "3 - v_turn" with the general formula:
--   next = ((current − 1 + direction + N) % N) + 1
-- where direction comes from the result game state (handles Reverse)
-- and N = count of hands keys.
-- Falls back to 2-player formula when hands is absent (other games).
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
  v_uid          uuid := auth.uid();
  s              record;
  v_turn         int;
  v_apply_fn     text;
  v_res          jsonb;
  v_result       text;
  v_win          boolean;
  v_draw         boolean;
  v_player_count int;
  v_direction    int;
  v_default_next int;
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

  -- Compute N-player default next turn from result game state.
  -- direction: from new game state (captures Reverse card effect).
  -- N: number of hands keys (falls back to 2 for games without hands).
  v_direction    := coalesce((v_res->'game'->>'direction')::int, 1);
  v_player_count := coalesce(jsonb_object_length(v_res->'game'->'hands'), 2);
  v_default_next := ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      coalesce(
                               (v_res->>'nextTurn')::int,
                               case when v_win or v_draw then v_turn else v_default_next end
                             ),
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
-- game_draw — N-player forced and voluntary draw
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_draw(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid    := auth.uid();
  s               record;
  v_turn          int;
  v_hand_key      text;
  v_game          jsonb;
  v_already_drawn boolean;
  v_draw_pile     text[];
  v_disc_pile     text[];
  v_hand          text[];
  v_drawn         text;
  v_new_draw      text[];
  v_new_hand      text[];
  v_parsed        jsonb;
  v_card_color    text;
  v_card_type     text;
  v_card_value    int;
  v_curr_color    text;
  v_curr_type     text;
  v_curr_value    int;
  v_playable      boolean;
  v_new_turn      int;
  v_pending       int;
  v_drew_cards    text[];
  j               int;
  v_player_count  int;
  v_direction     int;
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
  if s.game_id <> 'uno' then
    raise exception 'draw action only applies to uno';
  end if;

  v_turn    := (s.state->>'turn')::int;
  if (s.state->'players'->(v_turn::text)->>'id') <> v_uid::text then
    raise exception 'not your turn';
  end if;

  v_game         := s.state->'game';
  v_pending      := coalesce((v_game->>'pendingDraw')::int, 0);
  v_player_count := coalesce(jsonb_object_length(v_game->'hands'), 2);
  v_direction    := coalesce((v_game->>'direction')::int, 1);

  -- Helper: N-player next-turn formula
  -- next = ((current - 1 + direction + N) % N) + 1

  -- ── Forced draw: resolve pendingDraw ─────────────────────────
  if v_pending > 0 then
    v_hand_key   := v_turn::text;
    v_draw_pile  := array(select jsonb_array_elements_text(v_game->'drawPile'));
    v_disc_pile  := array(select jsonb_array_elements_text(v_game->'discardPile'));
    v_hand       := array(select jsonb_array_elements_text(v_game->'hands'->v_hand_key));
    v_drew_cards := array[]::text[];

    for j in 1..v_pending loop
      if cardinality(v_draw_pile) = 0 then
        if cardinality(v_disc_pile) <= 1 then
          raise exception 'no cards left to draw';
        end if;
        select array_agg(c order by random())
        into v_draw_pile
        from unnest(v_disc_pile[2:cardinality(v_disc_pile)]) as c;
        v_disc_pile := array[v_disc_pile[1]];
      end if;
      v_drew_cards := v_drew_cards || v_draw_pile[1];
      v_draw_pile  := v_draw_pile[2:cardinality(v_draw_pile)];
    end loop;

    update public.game_session
    set state = jsonb_build_object(
                  'players',   s.state->'players',
                  'turn',      ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1,
                  'startTurn', s.state->'startTurn',
                  'winner',    null,
                  'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                  'game', jsonb_build_object(
                    'drawPile',      to_jsonb(v_draw_pile),
                    'discardPile',   to_jsonb(v_disc_pile),
                    'currentColor',  v_game->'currentColor',
                    'currentType',   v_game->'currentType',
                    'currentValue',  v_game->'currentValue',
                    'hands', jsonb_set(
                      v_game->'hands',
                      array[v_hand_key],
                      to_jsonb(v_hand || v_drew_cards)
                    ),
                    'direction',     v_game->'direction',
                    'pendingDraw',   0,
                    'drawnThisTurn', false,
                    'unoDeclared',   v_game->'unoDeclared',
                    'lastEvent', jsonb_build_object(
                      'seat',        v_turn,
                      'type',        'draw_card',
                      'card',        null,
                      'chosenColor', null,
                      'drewCards',   to_jsonb(v_drew_cards)
                    )
                  )
                )
    where id = p_session;
    return;
  end if;

  -- ── Voluntary draw ───────────────────────────────────────────

  v_hand_key      := v_turn::text;
  v_already_drawn := coalesce((v_game->>'drawnThisTurn')::boolean, false);
  if v_already_drawn then
    raise exception 'already drawn this turn';
  end if;

  v_draw_pile := array(select jsonb_array_elements_text(v_game->'drawPile'));
  v_disc_pile := array(select jsonb_array_elements_text(v_game->'discardPile'));
  v_hand      := array(select jsonb_array_elements_text(v_game->'hands'->v_hand_key));

  if cardinality(v_draw_pile) = 0 then
    if cardinality(v_disc_pile) <= 1 then
      raise exception 'no cards left to draw';
    end if;
    select array_agg(c order by random())
    into v_draw_pile
    from unnest(v_disc_pile[2:cardinality(v_disc_pile)]) as c;
    v_disc_pile := array[v_disc_pile[1]];
  end if;

  v_drawn    := v_draw_pile[1];
  v_new_draw := v_draw_pile[2:cardinality(v_draw_pile)];
  v_new_hand := v_hand || v_drawn;

  v_parsed     := public._uno_parse_card(v_drawn);
  v_card_color := v_parsed->>'color';
  v_card_type  := v_parsed->>'type';
  v_card_value := (v_parsed->>'value')::int;
  v_curr_color := v_game->>'currentColor';
  v_curr_type  := v_game->>'currentType';
  v_curr_value := (v_game->>'currentValue')::int;

  v_playable :=
    v_card_type in ('wild', 'wild_draw_four')
    or v_card_color = v_curr_color
    or (v_card_type = 'number' and v_curr_type = 'number'
        and v_curr_value is not null and v_curr_value = v_card_value)
    or (v_card_type not in ('number', 'wild', 'wild_draw_four')
        and v_card_type = v_curr_type);

  v_new_turn := case
    when v_playable then v_turn
    else ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1
  end;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      v_new_turn,
                'startTurn', s.state->'startTurn',
                'winner',    null,
                'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                'game', jsonb_build_object(
                  'drawPile',      to_jsonb(v_new_draw),
                  'discardPile',   to_jsonb(v_disc_pile),
                  'currentColor',  v_game->'currentColor',
                  'currentType',   v_game->'currentType',
                  'currentValue',  v_game->'currentValue',
                  'hands', jsonb_set(
                    v_game->'hands',
                    array[v_hand_key],
                    to_jsonb(v_new_hand)
                  ),
                  'direction',     v_game->'direction',
                  'pendingDraw',   v_game->'pendingDraw',
                  'drawnThisTurn', v_playable,
                  'unoDeclared',   v_game->'unoDeclared',
                  'lastEvent', jsonb_build_object(
                    'seat',        v_turn,
                    'type',        'draw_card',
                    'card',        null,
                    'chosenColor', null,
                    'drewCards',   jsonb_build_array(v_drawn)
                  )
                )
              )
  where id = p_session;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- _uno_apply_move — N-player skip/reverse
--
-- Skip: advance 2 steps in current direction
--   next = ((player − 1 + 2·dir + 2·N) % N) + 1
-- Reverse (N=2): play again (matches official 2-player UNO rules)
-- Reverse (N>2): advance 1 step in new (reversed) direction
--   next = ((player − 1 − dir + N) % N) + 1
-- All other cards: nextTurn=null, game_move uses default formula.
-- ─────────────────────────────────────────────────────────────
create or replace function public._uno_apply_move(
  p_game   jsonb,
  p_action jsonb,
  p_player int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_type         text    := p_action->>'type';
  v_card         text;
  v_hand_key     text    := p_player::text;
  v_hand         text[];
  v_new_hand     text[];
  v_parsed       jsonb;
  v_card_color   text;
  v_card_type    text;
  v_card_value   int;
  v_curr_color   text    := p_game->>'currentColor';
  v_curr_type    text    := p_game->>'currentType';
  v_curr_value   int     := (p_game->>'currentValue')::int;
  v_removed      boolean := false;
  i              int;
  v_result_value int;
  v_result_dir   jsonb;
  v_event_type   text;
  v_next_turn    int;
  v_result_color text;
  v_pending_val  int;
  v_chosen_color text;
  v_player_count int;
  v_direction    int;
begin
  if v_type = 'noop' then
    return jsonb_build_object(
      'result', 'continue',
      'game', jsonb_set(p_game, '{drawnThisTurn}', 'false'::jsonb)
    );
  end if;

  if v_type = 'play_card' then
    v_card         := p_action->>'card';
    v_chosen_color := p_action->>'chosenColor';
    if v_card is null then
      return jsonb_build_object('result', 'illegal');
    end if;

    v_hand := array(
      select jsonb_array_elements_text(p_game->'hands'->v_hand_key)
    );

    if not (v_card = any(v_hand)) then
      return jsonb_build_object('result', 'illegal');
    end if;

    v_parsed     := public._uno_parse_card(v_card);
    v_card_color := v_parsed->>'color';
    v_card_type  := v_parsed->>'type';
    v_card_value := (v_parsed->>'value')::int;

    -- N-player counts
    v_player_count := jsonb_object_length(p_game->'hands');
    v_direction    := coalesce((p_game->>'direction')::int, 1);

    if v_card_type = 'number' then
      if v_card_color <> v_curr_color then
        if v_curr_type <> 'number'
           or v_curr_value is null
           or v_curr_value <> v_card_value
        then
          return jsonb_build_object('result', 'illegal');
        end if;
      end if;
      v_result_color := v_card_color;
      v_result_value := v_card_value;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'play_card';
      v_next_turn    := null;   -- game_move computes default
      v_pending_val  := 0;

    elsif v_card_type = 'skip' then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'skip';
      -- Skip: advance 2 steps in current direction
      v_next_turn    := ((p_player - 1 + 2 * v_direction + 2 * v_player_count) % v_player_count) + 1;
      v_pending_val  := 0;

    elsif v_card_type = 'reverse' then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := to_jsonb(v_direction * -1);
      v_event_type   := 'reverse';
      if v_player_count = 2 then
        -- 2-player: reverse = play again (official UNO rule)
        v_next_turn := p_player;
      else
        -- N-player: advance 1 step in new (reversed) direction
        v_next_turn := ((p_player - 1 - v_direction + v_player_count) % v_player_count) + 1;
      end if;
      v_pending_val  := 0;

    elsif v_card_type = 'draw_two' then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'draw_two';
      v_next_turn    := null;   -- game_move advances normally; opponent resolves draw
      v_pending_val  := 2;

    elsif v_card_type = 'wild' then
      if v_chosen_color is null
         or v_chosen_color not in ('red', 'green', 'blue', 'yellow')
      then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_chosen_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'wild';
      v_next_turn    := null;
      v_pending_val  := 0;

    elsif v_card_type = 'wild_draw_four' then
      if v_chosen_color is null
         or v_chosen_color not in ('red', 'green', 'blue', 'yellow')
      then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_chosen_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'wild_draw_four';
      v_next_turn    := null;
      v_pending_val  := 4;

    else
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Remove first occurrence of card from hand
    v_new_hand := array[]::text[];
    v_removed  := false;
    for i in 1..cardinality(v_hand) loop
      if v_hand[i] = v_card and not v_removed then
        v_removed := true;
      else
        v_new_hand := v_new_hand || v_hand[i];
      end if;
    end loop;

    return jsonb_build_object(
      'result',   case when cardinality(v_new_hand) = 0 then 'win' else 'continue' end,
      'nextTurn', v_next_turn,
      'game', jsonb_build_object(
        'drawPile',     p_game->'drawPile',
        'discardPile',  jsonb_build_array(v_card) || (p_game->'discardPile'),
        'currentColor', v_result_color,
        'currentType',  v_card_type,
        'currentValue', v_result_value,
        'hands', jsonb_set(
          p_game->'hands',
          array[v_hand_key],
          to_jsonb(v_new_hand)
        ),
        'direction',   v_result_dir,
        'pendingDraw', v_pending_val,
        'unoDeclared', p_game->'unoDeclared',
        'lastEvent', jsonb_build_object(
          'seat',        p_player,
          'type',        v_event_type,
          'card',        v_card,
          'chosenColor', v_chosen_color,
          'drewCards',   jsonb_build_array()
        )
      )
    );
  end if;

  return jsonb_build_object('result', 'illegal');
end;
$$;

revoke all on function public._uno_apply_move(jsonb, jsonb, int) from public;


-- ─────────────────────────────────────────────────────────────
-- game_uno_declare — find caller's seat across N players
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_uno_declare(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  s      record;
  v_seat text := null;
  v_hand text[];
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

  -- Find caller's seat across all N players.
  select key into v_seat
  from jsonb_each(s.state->'players')
  where value->>'id' = v_uid::text
  limit 1;

  if v_seat is null then
    raise exception 'not a participant';
  end if;

  v_hand := array(
    select jsonb_array_elements_text(s.state->'game'->'hands'->v_seat)
  );

  if cardinality(v_hand) <> 1 then
    raise exception 'can only declare UNO with exactly one card';
  end if;

  update public.game_session
  set state = jsonb_set(s.state, '{game,unoDeclared}', to_jsonb(v_seat::int))
  where id = p_session;
end;
$$;

grant execute on function public.game_uno_declare(uuid) to authenticated, anon;


-- ─────────────────────────────────────────────────────────────
-- _uno_initial_state(p_player_count int) — N-player deck deal
--
-- Deals 7 cards to each of p_player_count players.
-- Hands are keyed "1".."N".
-- Starting card: first non-WD4 after all hands are dealt.
-- ─────────────────────────────────────────────────────────────
create or replace function public._uno_initial_state(p_player_count int)
returns jsonb
language plpgsql
as $$
declare
  v_deck         text[];
  v_shuffled     text[];
  v_discard      text;
  v_parsed       jsonb;
  v_color        text;
  v_idx          int;
  v_drawpile     text[];
  v_hands        jsonb := '{}';
  p              int;
  v_hand_start   int;
  v_start_search int;
begin
  -- ── 1. Build deck ───────────────────────────────────────────
  select array_agg(card)
  into v_deck
  from (
    select (color || suffix) as card
    from
      unnest(array['R','G','B','Y']) as color,
      unnest(array[
        '0',
        '1','1','2','2','3','3','4','4','5','5',
        '6','6','7','7','8','8','9','9',
        'S','S','R','R','D2','D2'
      ]) as suffix
    union all
    select unnest(array['W','W','W','W','WD4','WD4','WD4','WD4'])
  ) cards;

  -- ── 2. Shuffle ──────────────────────────────────────────────
  select array_agg(card order by random())
  into v_shuffled
  from unnest(v_deck) as card;

  -- ── 3. Deal 7 cards to each of N players ────────────────────
  for p in 1..p_player_count loop
    v_hand_start := (p - 1) * 7 + 1;
    v_hands := v_hands || jsonb_build_object(
      p::text,
      to_jsonb(v_shuffled[v_hand_start : v_hand_start + 6])
    );
  end loop;

  -- ── 4. Find first non-WD4 starting card ─────────────────────
  v_start_search := p_player_count * 7 + 1;
  v_idx          := v_start_search;
  loop
    exit when v_idx > 108;
    exit when v_shuffled[v_idx] <> 'WD4';
    v_idx := v_idx + 1;
  end loop;

  if v_idx > 108 then
    v_idx := v_start_search;
  end if;

  v_discard := v_shuffled[v_idx];
  v_parsed  := public._uno_parse_card(v_discard);
  v_color   := coalesce(v_parsed->>'color', 'red');

  -- ── 5. Build draw pile (skipped WD4s reinserted randomly) ───
  select array_agg(c order by random())
  into v_drawpile
  from unnest(
    v_shuffled[v_start_search:(v_idx - 1)] || v_shuffled[(v_idx + 1):108]
  ) as c;

  return jsonb_build_object(
    'drawPile',     to_jsonb(v_drawpile),
    'discardPile',  jsonb_build_array(v_discard),
    'currentColor', v_color,
    'currentType',  v_parsed->>'type',
    'currentValue', v_parsed->'value',
    'hands',        v_hands,
    'direction',    1,
    'pendingDraw',  0,
    'unoDeclared',  null,
    'lastEvent', jsonb_build_object(
      'seat',        1,
      'type',        'game_start',
      'card',        v_discard,
      'chosenColor', null,
      'drewCards',   jsonb_build_array()
    )
  );
end;
$$;

revoke all on function public._uno_initial_state(int) from public;


-- ── Grants ────────────────────────────────────────────────────
grant execute on function public.game_join(text, text, text)    to authenticated, anon;
grant execute on function public.game_ready(uuid, boolean)      to authenticated, anon;
grant execute on function public.game_start(uuid)               to authenticated, anon;
grant execute on function public.game_rematch(uuid)             to authenticated, anon;
grant execute on function public.game_move(uuid, jsonb)         to authenticated, anon;
grant execute on function public.game_draw(uuid)                to authenticated, anon;
