-- ============================================================
-- Recess — Military Zone / Tactical Grid Strike (Battleship)
-- Supersedes migration 0015 (Gunjin Shōgi)
--
-- Board: 10×10 grid, columns 0-9, rows 0-9.
--
-- Game state shape:
--   {
--     "phase":    "placement" | "battle" | "finished",
--     "ready":    { "1": bool, "2": bool },
--     "ships":    [{ id, player, r, c, size, orient, sunk }, ...],
--     "shots":    {
--       "1": [ [null|"hit"|"miss" ×10] ×10 ],   -- shots P1 fired (at P2's grid)
--       "2": [ [null|"hit"|"miss" ×10] ×10 ]    -- shots P2 fired (at P1's grid)
--     },
--     "lastShot": { by, r, c, result, sunkId? } | null
--   }
--
-- Ship ids / sizes:
--   carrier→5, battleship→4, destroyer→3, submarine→3, patrol→2
--
-- Place action:  { "type": "place", "ships": [{id, r, c, orient}, …] }
-- Fire action:   { "type": "fire",  "r": int, "c": int }
-- ============================================================


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


-- ── Initial game state ───────────────────────────────────────────────────────
create or replace function public._military_zone_initial_state()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'phase',    'placement',
    'ready',    jsonb_build_object('1', false, '2', false),
    'ships',    '[]'::jsonb,
    'shots',    jsonb_build_object(
                  '1', public._battleship_empty_grid(),
                  '2', public._battleship_empty_grid()
                ),
    'lastShot', null
  );
$$;


-- ── Move dispatcher ──────────────────────────────────────────────────────────
create or replace function public._military_zone_apply_move(
  p_game   jsonb,
  p_action jsonb,
  p_player int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_phase      text    := p_game->>'phase';
  v_type       text    := p_action->>'type';
  v_opponent   int     := 3 - p_player;
  v_player_s   text    := p_player::text;
  v_opp_s      text    := (3 - p_player)::text;
  v_ready_1    boolean := coalesce((p_game->'ready'->>'1')::boolean, false);
  v_ready_2    boolean := coalesce((p_game->'ready'->>'2')::boolean, false);

  -- Valid ship definitions (id → size)
  v_ship_ids   text[]  := ARRAY['carrier','battleship','destroyer','submarine','patrol'];
  v_ship_sizes int[]   := ARRAY[5, 4, 3, 3, 2];

  -- Placement loop variables
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

  -- Fire loop variables
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
  v_all_sunk   boolean;
  v_upd_game   jsonb;
begin

  -- ================================================================
  -- PLACEMENT: each player submits their fleet once
  -- ================================================================
  if v_type = 'place' and v_phase = 'placement' then

    if p_action->'ships' is null
       or jsonb_array_length(p_action->'ships') != 5 then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Validate each ship
    for v_elem in select * from jsonb_array_elements(p_action->'ships') loop
      v_id     := v_elem->>'id';
      v_r      := (v_elem->>'r')::int;
      v_c      := (v_elem->>'c')::int;
      v_orient := coalesce(v_elem->>'orient', 'H');

      -- Resolve expected size
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

      -- Boundary check
      if v_orient = 'H' and (v_c + v_size - 1) > 9 then
        return jsonb_build_object('result', 'illegal');
      end if;
      if v_orient = 'V' and (v_r + v_size - 1) > 9 then
        return jsonb_build_object('result', 'illegal');
      end if;

      -- Overlap check within this submitted fleet
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

      -- Append validated ship to local list
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

    -- Merge: drop any prior placement by this player, add fresh ships
    v_upd_ships := coalesce(
      (
        select jsonb_agg(s)
        from   jsonb_array_elements(p_game->'ships') s
        where  (s->>'player')::int != p_player
      ),
      '[]'::jsonb
    ) || v_new_ships;

    -- Mark player ready
    if p_player = 1 then v_ready_1 := true; else v_ready_2 := true; end if;

    v_upd_game :=
      jsonb_set(
        jsonb_set(
          jsonb_set(p_game, '{ships}', v_upd_ships),
          '{ready}', jsonb_build_object('1', v_ready_1, '2', v_ready_2)
        ),
        '{phase}',
        case when v_ready_1 and v_ready_2
          then '"battle"'::jsonb
          else '"placement"'::jsonb
        end
      );

    return jsonb_build_object('result', 'continue', 'game', v_upd_game);
  end if;


  -- ================================================================
  -- FIRE: active player fires one shot at the opponent's grid
  -- ================================================================
  if v_type = 'fire' and v_phase = 'battle' then

    v_fire_r := (p_action->>'r')::int;
    v_fire_c := (p_action->>'c')::int;

    if v_fire_r is null or v_fire_c is null
       or v_fire_r < 0 or v_fire_r > 9
       or v_fire_c < 0 or v_fire_c > 9 then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Reject re-shooting an already-revealed cell
    v_shot_val := p_game->'shots'->v_player_s->v_fire_r ->> v_fire_c;
    if v_shot_val is not null then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Determine hit/miss: scan opponent ships for cell (fire_r, fire_c)
    v_is_hit   := false;
    v_hit_ship := null;

    for v_ship in
      select s
      from   jsonb_array_elements(p_game->'ships') s
      where  (s->>'player')::int = v_opponent
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
        if v_is_hit then
          v_hit_ship := v_ship;
          exit;
        end if;
      end loop;
      if v_is_hit then exit; end if;
    end loop;

    -- Record shot in the grid
    v_upd_game := jsonb_set(
      p_game,
      array['shots', v_player_s, v_fire_r::text, v_fire_c::text],
      case when v_is_hit then '"hit"'::jsonb else '"miss"'::jsonb end
    );

    -- If hit: check whether the ship is now fully sunk
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
        v_cell_val := v_upd_game->'shots'->v_player_s->v_check_r ->> v_check_c;
        if v_cell_val is distinct from 'hit' then
          v_sunk := false;
          exit;
        end if;
      end loop;

      if v_sunk then
        v_sunk_id := v_hit_ship->>'id';
        -- Flip sunk flag on the ship
        v_upd_ships := (
          select jsonb_agg(
            case
              when (s->>'id') = v_sunk_id
               and (s->>'player')::int = v_opponent
              then jsonb_set(s, '{sunk}', 'true'::jsonb)
              else s
            end
          )
          from jsonb_array_elements(v_upd_game->'ships') s
        );
        v_upd_game := jsonb_set(v_upd_game, '{ships}', v_upd_ships);
      end if;
    end if;

    -- Stamp lastShot (+ optional sunkId)
    v_upd_game := jsonb_set(
      v_upd_game,
      '{lastShot}',
      jsonb_build_object(
        'by',     p_player,
        'r',      v_fire_r,
        'c',      v_fire_c,
        'result', case when v_is_hit then 'hit' else 'miss' end
      ) ||
      case when v_sunk_id is not null
        then jsonb_build_object('sunkId', v_sunk_id)
        else '{}'::jsonb
      end
    );

    -- Win condition: all opponent ships sunk
    v_all_sunk := not exists (
      select 1
      from   jsonb_array_elements(v_upd_game->'ships') s
      where  (s->>'player')::int = v_opponent
        and  (s->>'sunk') is distinct from 'true'
    );

    if v_all_sunk then
      v_upd_game := jsonb_set(v_upd_game, '{phase}', '"finished"'::jsonb);
      return jsonb_build_object('result', 'win', 'game', v_upd_game);
    end if;

    return jsonb_build_object('result', 'continue', 'game', v_upd_game);
  end if;

  -- Unrecognised action or wrong phase
  return jsonb_build_object('result', 'illegal');
end;
$$;


revoke all on function public._battleship_empty_grid()                         from public;
revoke all on function public._military_zone_initial_state()                   from public;
revoke all on function public._military_zone_apply_move(jsonb, jsonb, int)     from public;
