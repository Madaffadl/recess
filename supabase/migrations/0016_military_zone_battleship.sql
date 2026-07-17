-- ============================================================
-- Recess — Military Zone / Tactical Grid Strike (Battleship)
-- Supersedes migration 0015 (Gunjin Shōgi)
-- Rewritten for 2–4 player support.
--
-- NOTE: Before applying this migration, clear existing Military Zone sessions:
--   DELETE FROM game_session WHERE game_id = 'military-zone';
--
-- This game uses CUSTOM RPCs (military_zone_join / move / rematch)
-- instead of the shared game_core RPCs. The generic game_join / game_move
-- / game_rematch are not used for this game.
--
-- Board: 10×10 grid, columns 0-9, rows 0-9.
--
-- Game state shape:
--   {
--     "phase":      "placement" | "battle" | "finished",
--     "ready":      { "1": bool, …, "N": bool },
--     "eliminated": { "1": bool, …, "N": bool },
--     "ships":      [{ id, player, r, c, size, orient, sunk }, ...],
--     "shots":      {
--       "<shooter>": {
--         "<target>": [ [null|"hit"|"miss" ×10] ×10 ]
--       }
--     },
--     "lastShot": { by, target, r, c, result, sunkId?, eliminatedPlayer? } | null
--   }
--
-- Session state envelope:
--   {
--     "players":    { "1": {id, handle}, …, "N": seat|null },
--     "hostId":     string,
--     "numPlayers": 2|3|4,
--     "turn":       int,
--     "startTurn":  int,
--     "winner":     int|null,
--     "moveCount":  int,
--     "game":       <BattleshipGame>
--   }
--
-- Ship ids / sizes:
--   carrier→5, battleship→4, destroyer→3, submarine→3, patrol→2
--
-- Place action: { "type": "place", "ships": [{id, r, c, orient}, …] }
-- Fire action:  { "type": "fire", "r": int, "c": int, "target": int }
-- ============================================================


-- ── Drop old 2-player functions before redefining ───────────────────────────
drop function if exists public._military_zone_initial_state();
drop function if exists public._military_zone_apply_move(jsonb, jsonb, int);


-- ── Helper: build an empty 10×10 null shot grid ─────────────────────────────
create or replace function public._battleship_empty_grid()
returns jsonb
language sql
immutable
as $$
  select jsonb_agg(
    jsonb_build_array(
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text
    )
  )
  from generate_series(0, 9);
$$;


-- ── Build initial game state for N players ───────────────────────────────────
create or replace function public._military_zone_build_initial_game(p_num_players int)
returns jsonb
language plpgsql
as $$
declare
  v_ready      jsonb := '{}'::jsonb;
  v_eliminated jsonb := '{}'::jsonb;
  v_shots      jsonb := '{}'::jsonb;
  v_shooter_shots jsonb;
  v_i int;
  v_j int;
begin
  for v_i in 1..p_num_players loop
    v_ready      := jsonb_set(v_ready,      array[v_i::text], 'false'::jsonb);
    v_eliminated := jsonb_set(v_eliminated, array[v_i::text], 'false'::jsonb);

    v_shooter_shots := '{}'::jsonb;
    for v_j in 1..p_num_players loop
      if v_j != v_i then
        v_shooter_shots := jsonb_set(v_shooter_shots, array[v_j::text], public._battleship_empty_grid());
      end if;
    end loop;
    v_shots := jsonb_set(v_shots, array[v_i::text], v_shooter_shots);
  end loop;

  return jsonb_build_object(
    'phase',      'placement',
    'ready',      v_ready,
    'eliminated', v_eliminated,
    'ships',      '[]'::jsonb,
    'shots',      v_shots,
    'lastShot',   null
  );
end;
$$;


-- ── Move dispatcher (pure: no DB access) ─────────────────────────────────────
create or replace function public._military_zone_apply_move(
  p_game        jsonb,
  p_action      jsonb,
  p_player      int,
  p_num_players int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_phase      text    := p_game->>'phase';
  v_type       text    := p_action->>'type';
  v_player_s   text    := p_player::text;

  v_ship_ids   text[]  := ARRAY['carrier','battleship','destroyer','submarine','patrol'];
  v_ship_sizes int[]   := ARRAY[5, 4, 3, 3, 2];

  -- Placement
  v_elem       jsonb;
  v_id         text;
  v_r          int;
  v_c          int;
  v_size       int;
  v_orient     text;
  v_exp_size   int;
  v_j          int;
  v_idx        int;
  v_cell_key   text;
  v_all_cells  text[]  := '{}';
  v_new_ships  jsonb   := '[]'::jsonb;
  v_upd_ships  jsonb;
  v_all_ready  boolean;
  v_k          int;

  -- Fire
  v_target     int;
  v_target_s   text;
  v_fire_r     int;
  v_fire_c     int;
  v_shot_val   text;
  v_is_hit     boolean := false;
  v_hit_ship   jsonb;
  v_ship       jsonb;
  v_hit_r      int;
  v_hit_c      int;
  v_hit_size   int;
  v_hit_orient text;
  v_check_r    int;
  v_check_c    int;
  v_cell_val   text;
  v_sunk       boolean;
  v_sunk_id    text;
  v_upd_game   jsonb;
  v_shooter    int;
  v_survivors  int;
  v_eliminated jsonb;
begin

  -- ================================================================
  -- PLACEMENT: players deploy their fleet (concurrent, any order)
  -- ================================================================
  if v_type = 'place' and v_phase = 'placement' then

    if p_action->'ships' is null
       or jsonb_array_length(p_action->'ships') != 5 then
      return jsonb_build_object('result', 'illegal');
    end if;

    for v_elem in select * from jsonb_array_elements(p_action->'ships') loop
      v_id     := v_elem->>'id';
      v_r      := (v_elem->>'r')::int;
      v_c      := (v_elem->>'c')::int;
      v_orient := coalesce(v_elem->>'orient', 'H');

      v_exp_size := null;
      for v_idx in 1..array_length(v_ship_ids, 1) loop
        if v_ship_ids[v_idx] = v_id then
          v_exp_size := v_ship_sizes[v_idx];
          exit;
        end if;
      end loop;

      if v_exp_size is null
         or v_r is null or v_c is null
         or v_r < 0 or v_r > 9
         or v_c < 0 or v_c > 9 then
        return jsonb_build_object('result', 'illegal');
      end if;

      v_size := v_exp_size;

      if v_orient = 'H' and (v_c + v_size - 1) > 9 then
        return jsonb_build_object('result', 'illegal');
      end if;
      if v_orient = 'V' and (v_r + v_size - 1) > 9 then
        return jsonb_build_object('result', 'illegal');
      end if;

      for v_j in 0..(v_size - 1) loop
        v_cell_key := case when v_orient = 'H'
          then v_r::text        || ',' || (v_c + v_j)::text
          else (v_r + v_j)::text || ',' || v_c::text
        end;
        if v_cell_key = any(v_all_cells) then
          return jsonb_build_object('result', 'illegal');
        end if;
        v_all_cells := v_all_cells || v_cell_key;
      end loop;

      v_new_ships := v_new_ships || jsonb_build_array(
        jsonb_build_object(
          'id',     v_id,
          'player', p_player,
          'r',      v_r,
          'c',      v_c,
          'size',   v_size,
          'orient', v_orient,
          'sunk',   false
        )
      );
    end loop;

    -- Replace any prior placement by this player, then append fresh ships
    v_upd_ships := coalesce(
      (
        select jsonb_agg(s)
        from   jsonb_array_elements(p_game->'ships') s
        where  (s->>'player')::int != p_player
      ),
      '[]'::jsonb
    ) || v_new_ships;

    -- Mark this player ready
    v_upd_game := jsonb_set(
      jsonb_set(p_game, '{ships}', v_upd_ships),
      array['ready', v_player_s], 'true'::jsonb
    );

    -- Transition to battle when all N players are ready
    v_all_ready := true;
    for v_k in 1..p_num_players loop
      if not coalesce((v_upd_game->'ready'->>v_k::text)::boolean, false) then
        v_all_ready := false;
        exit;
      end if;
    end loop;

    if v_all_ready then
      v_upd_game := jsonb_set(v_upd_game, '{phase}', '"battle"'::jsonb);
    end if;

    return jsonb_build_object('result', 'continue', 'game', v_upd_game);
  end if;


  -- ================================================================
  -- FIRE: active player fires at a chosen opponent's grid
  -- ================================================================
  if v_type = 'fire' and v_phase = 'battle' then

    v_fire_r  := (p_action->>'r')::int;
    v_fire_c  := (p_action->>'c')::int;
    -- target is required; for 2-player default to opponent for backward compat
    v_target  := coalesce(
      (p_action->>'target')::int,
      case when p_num_players = 2 then 3 - p_player else null end
    );
    v_target_s := v_target::text;

    if v_fire_r is null or v_fire_c is null
       or v_fire_r < 0 or v_fire_r > 9
       or v_fire_c < 0 or v_fire_c > 9
       or v_target is null
       or v_target = p_player
       or v_target < 1 or v_target > p_num_players then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Can't fire at already-eliminated players
    if coalesce((p_game->'eliminated'->>v_target_s)::boolean, false) then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Reject if the cell has already been shot by ANY player (shared attack grid)
    for v_k in 1..p_num_players loop
      if v_k != v_target then
        v_shot_val := p_game->'shots'->v_k::text->v_target_s->v_fire_r ->> v_fire_c;
        if v_shot_val is not null then
          return jsonb_build_object('result', 'illegal');
        end if;
      end if;
    end loop;

    -- Determine hit/miss: scan target's ships
    v_is_hit   := false;
    v_hit_ship := null;

    for v_ship in
      select s
      from   jsonb_array_elements(p_game->'ships') s
      where  (s->>'player')::int = v_target
    loop
      v_hit_r      := (v_ship->>'r')::int;
      v_hit_c      := (v_ship->>'c')::int;
      v_hit_size   := (v_ship->>'size')::int;
      v_hit_orient := v_ship->>'orient';

      for v_j in 0..(v_hit_size - 1) loop
        if v_hit_orient = 'H' then
          v_is_hit := (v_hit_r = v_fire_r and (v_hit_c + v_j) = v_fire_c);
        else
          v_is_hit := ((v_hit_r + v_j) = v_fire_r and v_hit_c = v_fire_c);
        end if;
        if v_is_hit then v_hit_ship := v_ship; exit; end if;
      end loop;
      if v_is_hit then exit; end if;
    end loop;

    -- Record the shot at shots[shooter][target][r][c]
    v_upd_game := jsonb_set(
      p_game,
      array['shots', v_player_s, v_target_s, v_fire_r::text, v_fire_c::text],
      case when v_is_hit then '"hit"'::jsonb else '"miss"'::jsonb end
    );

    -- If hit: check whether the entire ship is now sunk
    -- A ship is sunk when ALL its cells have been hit by ANY shooter
    v_sunk_id := null;
    if v_is_hit then
      v_hit_r      := (v_hit_ship->>'r')::int;
      v_hit_c      := (v_hit_ship->>'c')::int;
      v_hit_size   := (v_hit_ship->>'size')::int;
      v_hit_orient := v_hit_ship->>'orient';
      v_sunk       := true;

      for v_j in 0..(v_hit_size - 1) loop
        if v_hit_orient = 'H' then
          v_check_r := v_hit_r;
          v_check_c := v_hit_c + v_j;
        else
          v_check_r := v_hit_r + v_j;
          v_check_c := v_hit_c;
        end if;

        -- Check if any non-target shooter hit this cell
        v_cell_val := null;
        for v_shooter in 1..p_num_players loop
          if v_shooter != v_target then
            v_cell_val := v_upd_game->'shots'->v_shooter::text->v_target_s->v_check_r ->> v_check_c;
            exit when v_cell_val = 'hit';
          end if;
        end loop;

        if v_cell_val is distinct from 'hit' then
          v_sunk := false;
          exit;
        end if;
      end loop;

      if v_sunk then
        v_sunk_id := v_hit_ship->>'id';
        -- Flip sunk=true on the ship record
        v_upd_ships := (
          select jsonb_agg(
            case
              when (s->>'id') = v_sunk_id and (s->>'player')::int = v_target
              then jsonb_set(s, '{sunk}', 'true'::jsonb)
              else s
            end
          )
          from jsonb_array_elements(v_upd_game->'ships') s
        );
        v_upd_game := jsonb_set(v_upd_game, '{ships}', v_upd_ships);
      end if;
    end if;

    -- Stamp lastShot
    v_upd_game := jsonb_set(
      v_upd_game,
      '{lastShot}',
      jsonb_build_object(
        'by',     p_player,
        'target', v_target,
        'r',      v_fire_r,
        'c',      v_fire_c,
        'result', case when v_is_hit then 'hit' else 'miss' end
      ) ||
      case when v_sunk_id is not null
        then jsonb_build_object('sunkId', v_sunk_id)
        else '{}'::jsonb
      end
    );

    -- If a ship sank, check whether the target's entire fleet is eliminated
    if v_sunk then
      if not exists (
        select 1
        from   jsonb_array_elements(v_upd_game->'ships') s
        where  (s->>'player')::int = v_target
          and  (s->>'sunk') is distinct from 'true'
      ) then
        -- Target is eliminated: mark eliminated flag and annotate lastShot
        v_upd_game := jsonb_set(v_upd_game, array['eliminated', v_target_s], 'true'::jsonb);
        v_upd_game := jsonb_set(
          v_upd_game, '{lastShot}',
          v_upd_game->'lastShot' || jsonb_build_object('eliminatedPlayer', v_target)
        );

        -- Count survivors (non-eliminated players)
        v_eliminated := v_upd_game->'eliminated';
        v_survivors  := 0;
        for v_k in 1..p_num_players loop
          if not coalesce((v_eliminated->>v_k::text)::boolean, false) then
            v_survivors := v_survivors + 1;
          end if;
        end loop;

        if v_survivors <= 1 then
          -- Last fleet standing: declare win
          v_upd_game := jsonb_set(v_upd_game, '{phase}', '"finished"'::jsonb);
          return jsonb_build_object('result', 'win', 'game', v_upd_game);
        else
          -- Partial elimination: game continues
          return jsonb_build_object('result', 'eliminate', 'game', v_upd_game);
        end if;
      end if;
    end if;

    return jsonb_build_object('result', 'continue', 'game', v_upd_game);
  end if;

  return jsonb_build_object('result', 'illegal');
end;
$$;


-- ── Join: create session or take an open seat ────────────────────────────────
create or replace function public.military_zone_join(
  p_room_key    text,
  p_handle      text,
  p_num_players int default 2
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  s            record;
  v_num_players int;
  v_i          int;
  v_k          int;
  v_new_state  jsonb;
  v_filled     int;
  v_players    jsonb;
  v_session_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_handle is null or length(trim(p_handle)) = 0 then raise exception 'handle required'; end if;
  p_num_players := least(4, greatest(2, p_num_players));

  select * into s
  from public.game_session
  where room_key = p_room_key
    and game_id  = 'military-zone'
    and status in ('waiting', 'active')
  order by created_at desc
  limit 1
  for update;

  if found then
    v_num_players := (s.state->>'numPlayers')::int;

    -- Already seated → return the session
    for v_i in 1..v_num_players loop
      if (s.state->'players'->v_i::text->>'id') = v_uid::text then
        return s.id;
      end if;
    end loop;

    -- Take the first open seat
    if s.status = 'waiting' then
      for v_i in 1..v_num_players loop
        if (s.state->'players'->v_i::text->>'id') is null then
          v_new_state := jsonb_set(
            s.state,
            array['players', v_i::text],
            jsonb_build_object('id', v_uid::text, 'handle', p_handle)
          );
          -- Count filled seats after taking this one
          v_filled := 0;
          for v_k in 1..v_num_players loop
            if (v_new_state->'players'->v_k::text->>'id') is not null then
              v_filled := v_filled + 1;
            end if;
          end loop;
          update public.game_session
          set state  = v_new_state,
              status = case when v_filled = v_num_players then 'active' else 'waiting' end
          where id = s.id;
          return s.id;
        end if;
      end loop;
    end if;

    -- All seats taken / already active → spectate
    return s.id;
  end if;

  -- No session yet: create one with caller as player 1
  v_players := jsonb_build_object(
    '1', jsonb_build_object('id', v_uid::text, 'handle', p_handle)
  );
  for v_k in 2..p_num_players loop
    v_players := jsonb_set(v_players, array[v_k::text], 'null'::jsonb);
  end loop;

  insert into public.game_session (room_key, game_id, state, status)
  values (
    p_room_key,
    'military-zone',
    jsonb_build_object(
      'players',    v_players,
      'hostId',     v_uid::text,
      'numPlayers', p_num_players,
      'turn',       1,
      'startTurn',  1,
      'winner',     null,
      'moveCount',  0,
      'game',       public._military_zone_build_initial_game(p_num_players)
    ),
    'waiting'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;


-- ── Move: validate turn, dispatch to apply_move, advance state ───────────────
create or replace function public.military_zone_move(
  p_session_id uuid,
  p_action     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  s             record;
  v_state       jsonb;
  v_game        jsonb;
  v_num_players int;
  v_player      int  := null;
  v_i           int;
  v_action_type text;
  v_result      jsonb;
  v_result_code text;
  v_new_game    jsonb;
  v_new_phase   text;
  v_new_turn    int;
  v_eliminated  jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into s
  from public.game_session
  where id      = p_session_id
    and game_id = 'military-zone'
    and status  = 'active'
  for update;

  if not found then raise exception 'session not found or not active'; end if;

  v_state       := s.state;
  v_num_players := (v_state->>'numPlayers')::int;
  v_game        := v_state->'game';

  -- Identify the calling player
  for v_i in 1..v_num_players loop
    if (v_state->'players'->v_i::text->>'id') = v_uid::text then
      v_player := v_i;
      exit;
    end if;
  end loop;
  if v_player is null then raise exception 'not a player in this session'; end if;

  v_action_type := p_action->>'type';

  -- Enforce turn order for fire; placement is concurrent (no turn gate)
  if v_action_type = 'fire' then
    if (v_state->>'turn')::int != v_player then
      raise exception 'not your turn';
    end if;
  elsif v_action_type != 'place' then
    raise exception 'unknown action type: %', v_action_type;
  end if;

  v_result      := public._military_zone_apply_move(v_game, p_action, v_player, v_num_players);
  v_result_code := v_result->>'result';

  if v_result_code = 'illegal' then raise exception 'illegal move'; end if;

  v_new_game  := v_result->'game';
  v_new_phase := v_new_game->>'phase';

  if v_result_code = 'win' then
    update public.game_session
    set state = jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(v_state, '{game}', v_new_game),
                      '{winner}', to_jsonb(v_player)
                    ),
                    '{moveCount}', to_jsonb((v_state->>'moveCount')::int + 1)
                  ),
                  '{turn}', to_jsonb(v_player)
                ),
        status = 'finished'
    where id = p_session_id;
    return;
  end if;

  -- Determine next turn
  if v_action_type = 'place' then
    -- Don't cycle turn during placement; reset to startTurn when battle begins
    if v_new_phase = 'battle' then
      v_new_turn := (v_state->>'startTurn')::int;
    else
      v_new_turn := (v_state->>'turn')::int;
    end if;
  else
    -- Fire (or eliminate): cycle to next non-eliminated player
    v_eliminated := v_new_game->'eliminated';
    v_new_turn   := v_player;
    for v_i in 1..v_num_players loop
      v_new_turn := (v_new_turn % v_num_players) + 1;
      exit when not coalesce((v_eliminated->>v_new_turn::text)::boolean, false);
    end loop;
  end if;

  update public.game_session
  set state = jsonb_set(
                jsonb_set(
                  jsonb_set(v_state, '{game}', v_new_game),
                  '{turn}', to_jsonb(v_new_turn)
                ),
                '{moveCount}', to_jsonb((v_state->>'moveCount')::int + 1)
              )
  where id = p_session_id;
end;
$$;


-- ── Rematch: reset with same players and numPlayers, cycle startTurn ─────────
create or replace function public.military_zone_rematch(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  s               record;
  v_state         jsonb;
  v_num_players   int;
  v_player        int  := null;
  v_i             int;
  v_new_start_turn int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into s
  from public.game_session
  where id      = p_session_id
    and game_id = 'military-zone'
    and status  = 'finished'
  for update;

  if not found then raise exception 'session not found or not finished'; end if;

  v_state       := s.state;
  v_num_players := (v_state->>'numPlayers')::int;

  -- Validate caller is a seated player
  for v_i in 1..v_num_players loop
    if (v_state->'players'->v_i::text->>'id') = v_uid::text then
      v_player := v_i;
      exit;
    end if;
  end loop;
  if v_player is null then raise exception 'not a player in this session'; end if;

  -- Cycle startTurn: 1→2→…→N→1
  v_new_start_turn := ((v_state->>'startTurn')::int % v_num_players) + 1;

  update public.game_session
  set state = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(v_state,
                      '{game}', public._military_zone_build_initial_game(v_num_players)
                    ),
                    '{winner}', 'null'::jsonb
                  ),
                  '{turn}', to_jsonb(v_new_start_turn)
                ),
                '{startTurn}', to_jsonb(v_new_start_turn)
              ),
      status = 'active'
  where id = p_session_id;
end;
$$;


-- ── Permissions ───────────────────────────────────────────────────────────────
revoke all on function public._battleship_empty_grid()                              from public;
revoke all on function public._military_zone_build_initial_game(int)                from public;
revoke all on function public._military_zone_apply_move(jsonb, jsonb, int, int)     from public;

grant execute on function public.military_zone_join(text, text, int)                to authenticated, anon;
grant execute on function public.military_zone_move(uuid, jsonb)                    to authenticated, anon;
grant execute on function public.military_zone_rematch(uuid)                        to authenticated, anon;
