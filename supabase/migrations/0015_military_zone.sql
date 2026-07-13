-- ============================================================
-- Recess — Military Zone / Gunjin Shōgi  (game_core dispatcher hooks)
--
-- Board model
--   56-cell flat array, row-major, 8 rows × 7 cols.
--   pos = row * 7 + col  (row 0 = TOP, row 7 = BOTTOM)
--   P1 territory: rows 4-7 (pos 28-55)
--   P2 territory: rows 0-3 (pos 0-27)
--
-- Game state shape:
--   {
--     "pieces":    [{ id, rank, player, pos }],
--     "phase":     "setup" | "playing" | "finished",
--     "setupDone": [bool, bool],
--     "lastBattle": { pos, result } | null
--   }
--
-- Setup action:  { "type": "setup", "pieces": [{ id, rank, pos }] }
-- Move action:   { "type": "move", "id": "<piece-id>", "to": <pos> }
-- ============================================================

create or replace function public._military_zone_initial_state()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'pieces',     '[]'::jsonb,
    'phase',      'setup',
    'setupDone',  '[false, false]'::jsonb,
    'lastBattle', null
  );
$$;


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
  v_pieces     jsonb   := coalesce(p_game->'pieces', '[]');
  v_setup_p1   boolean := (p_game->'setupDone'->0)::boolean;
  v_setup_p2   boolean := (p_game->'setupDone'->1)::boolean;

  v_elem       jsonb;
  v_piece      jsonb;
  v_target     jsonb;
  v_incoming   jsonb;
  v_new_pieces jsonb;
  v_updated    jsonb;
  v_new_phase  text;
  v_pos        int;
  v_min_pos    int;
  v_max_pos    int;
  v_pos_set    int[];
  v_piece_id   text;
  v_from_pos   int;
  v_to_pos     int;
  v_rank       text;
  v_def_rank   text;
  v_from_row   int;
  v_from_col   int;
  v_to_row     int;
  v_to_col     int;
  v_dr         int;
  v_dc         int;
  v_steps      int;
  v_valid      boolean;
  v_fwd_dr     int;
  v_mid_pos    int;
  v_blocked    boolean;
  v_step_i     int;
  v_dir_r      int;
  v_dir_c      int;
  v_is_ally    boolean;
  v_atk_power  int;
  v_def_power  int;
  v_result     text;
  v_mob_left   int;
  v_opponent   int;
begin
  v_opponent := 3 - p_player;

  -- ================================================================
  -- SETUP PHASE: player submits their army arrangement
  -- ================================================================
  if v_type = 'setup' and v_phase = 'setup' then
    v_incoming := p_action->'pieces';

    if v_incoming is null or jsonb_array_length(v_incoming) != 15 then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Territory bounds: P1 rows 4-7 (28-55), P2 rows 0-3 (0-27)
    v_min_pos := case when p_player = 1 then 28 else 0  end;
    v_max_pos := case when p_player = 1 then 55 else 27 end;

    v_pos_set := '{}';
    for v_elem in select * from jsonb_array_elements(v_incoming) loop
      v_pos := (v_elem->>'pos')::int;
      if v_pos is null or v_pos < v_min_pos or v_pos > v_max_pos then
        return jsonb_build_object('result', 'illegal');
      end if;
      if v_pos = any(v_pos_set) then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_pos_set := v_pos_set || v_pos;
    end loop;

    -- Stamp player onto each incoming piece and merge with existing pieces
    v_new_pieces := (
      select jsonb_agg(p || jsonb_build_object('player', p_player))
      from jsonb_array_elements(v_incoming) p
    );
    v_pieces := v_pieces || v_new_pieces;

    if p_player = 1 then v_setup_p1 := true; else v_setup_p2 := true; end if;
    v_new_phase := case when v_setup_p1 and v_setup_p2 then 'playing' else 'setup' end;

    return jsonb_build_object(
      'result', 'continue',
      'game',   jsonb_build_object(
        'pieces',     v_pieces,
        'phase',      v_new_phase,
        'setupDone',  jsonb_build_array(v_setup_p1, v_setup_p2),
        'lastBattle', null
      )
    );
  end if;

  -- ================================================================
  -- MOVE PHASE: player moves a piece (possibly into battle)
  -- ================================================================
  if v_type = 'move' and v_phase = 'playing' then
    v_piece_id := p_action->>'id';
    v_to_pos   := (p_action->>'to')::int;

    if v_piece_id is null or v_to_pos is null
       or v_to_pos < 0 or v_to_pos > 55 then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- Find the piece owned by this player
    select elem into v_piece
    from jsonb_array_elements(v_pieces) elem
    where elem->>'id' = v_piece_id
      and (elem->>'player')::int = p_player
    limit 1;

    if v_piece is null then
      return jsonb_build_object('result', 'illegal');
    end if;

    v_from_pos := (v_piece->>'pos')::int;
    v_rank     := v_piece->>'rank';

    -- Immobile pieces cannot move
    if v_rank in ('landmine', 'hq') then
      return jsonb_build_object('result', 'illegal');
    end if;

    v_from_row := v_from_pos / 7;
    v_from_col := v_from_pos % 7;
    v_to_row   := v_to_pos   / 7;
    v_to_col   := v_to_pos   % 7;
    v_dr       := v_to_row - v_from_row;
    v_dc       := v_to_col - v_from_col;
    v_steps    := abs(v_dr) + abs(v_dc);

    -- Must be strictly orthogonal and non-zero
    if v_steps = 0 or (v_dr != 0 and v_dc != 0) then
      return jsonb_build_object('result', 'illegal');
    end if;
    -- Prevent column wrap-around on horizontal moves
    if v_dc != 0 and v_to_row != v_from_row then
      return jsonb_build_object('result', 'illegal');
    end if;

    v_valid := false;

    -- Movement rules per rank
    if v_rank in ('general', 'major', 'captain', 'lieutenant', 'spy') then
      v_valid := (v_steps = 1);

    elsif v_rank = 'tank' then
      v_fwd_dr := case when p_player = 1 then -1 else 1 end;
      if v_dc = 0 then
        if v_dr = v_fwd_dr then
          v_valid := true;
        elsif v_dr = v_fwd_dr * 2 then
          -- 2-step: intermediate square must be empty
          v_mid_pos := v_from_pos + v_fwd_dr * 7;
          v_valid := not exists (
            select 1 from jsonb_array_elements(v_pieces) elem
            where (elem->>'pos')::int = v_mid_pos
          );
        end if;
      end if;

    elsif v_rank = 'engineer' then
      -- Unlimited straight steps; path must be clear (last square can be enemy)
      v_dir_r  := case when v_dr > 0 then 1 when v_dr < 0 then -1 else 0 end;
      v_dir_c  := case when v_dc > 0 then 1 when v_dc < 0 then -1 else 0 end;
      v_blocked := false;
      for v_step_i in 1..(v_steps - 1) loop
        v_mid_pos := (v_from_row + v_dir_r * v_step_i) * 7
                   + (v_from_col + v_dir_c * v_step_i);
        if exists (
          select 1 from jsonb_array_elements(v_pieces) elem
          where (elem->>'pos')::int = v_mid_pos
        ) then
          v_blocked := true;
          exit;
        end if;
      end loop;
      v_valid := not v_blocked
        and v_to_row between 0 and 7
        and v_to_col between 0 and 6;
    end if;

    if not v_valid then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- What's at the target square?
    select elem into v_target
    from jsonb_array_elements(v_pieces) elem
    where (elem->>'pos')::int = v_to_pos
    limit 1;

    -- Target is empty: just move
    if v_target is null then
      v_updated := (
        select jsonb_agg(
          case when elem->>'id' = v_piece_id
            then elem || jsonb_build_object('pos', v_to_pos)
          else elem end
        )
        from jsonb_array_elements(v_pieces) elem
      );
      return jsonb_build_object(
        'result', 'continue',
        'game',   jsonb_build_object(
          'pieces',     v_updated,
          'phase',      'playing',
          'setupDone',  jsonb_build_array(v_setup_p1, v_setup_p2),
          'lastBattle', null
        )
      );
    end if;

    -- Target is occupied by ally: illegal
    v_is_ally := (v_target->>'player')::int = p_player;
    if v_is_ally then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- ---- BATTLE ----
    v_def_rank := v_target->>'rank';

    -- HQ capture (only combat pieces can capture)
    if v_def_rank = 'hq' then
      if v_rank in ('spy', 'engineer') then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_updated := (
        select jsonb_agg(
          case when elem->>'id' = v_piece_id
            then elem || jsonb_build_object('pos', v_to_pos)
          else elem end
        )
        from jsonb_array_elements(v_pieces) elem
        where (elem->>'id') != (v_target->>'id')
      );
      return jsonb_build_object(
        'result', 'win',
        'game',   jsonb_build_object(
          'pieces',     v_updated,
          'phase',      'finished',
          'setupDone',  jsonb_build_array(v_setup_p1, v_setup_p2),
          'lastBattle', jsonb_build_object('pos', v_to_pos, 'result', 'attacker_wins')
        )
      );
    end if;

    -- Determine battle outcome
    if v_def_rank = 'landmine' then
      v_result := case when v_rank = 'engineer'
                    then 'attacker_wins'
                    else 'mutual_destruction'
                  end;
    elsif v_rank = 'spy' and v_def_rank = 'general' then
      v_result := 'attacker_wins';
    else
      v_atk_power := case v_rank
        when 'general'    then 8 when 'major'      then 6
        when 'captain'    then 5 when 'lieutenant' then 4
        when 'tank'       then 3 when 'engineer'   then 2
        when 'spy'        then 1 else 0
      end;
      v_def_power := case v_def_rank
        when 'general'    then 8 when 'major'      then 6
        when 'captain'    then 5 when 'lieutenant' then 4
        when 'tank'       then 3 when 'engineer'   then 2
        when 'spy'        then 1 else 0
      end;
      v_result := case
        when v_atk_power > v_def_power then 'attacker_wins'
        when v_atk_power < v_def_power then 'defender_wins'
        else                                'mutual_destruction'
      end;
    end if;

    -- Apply battle outcome
    case v_result
      when 'attacker_wins' then
        v_updated := (
          select jsonb_agg(
            case when elem->>'id' = v_piece_id
              then elem || jsonb_build_object('pos', v_to_pos)
            else elem end
          )
          from jsonb_array_elements(v_pieces) elem
          where (elem->>'id') != (v_target->>'id')
        );
      when 'defender_wins' then
        v_updated := (
          select jsonb_agg(elem)
          from jsonb_array_elements(v_pieces) elem
          where (elem->>'id') != v_piece_id
        );
      when 'mutual_destruction' then
        v_updated := (
          select jsonb_agg(elem)
          from jsonb_array_elements(v_pieces) elem
          where (elem->>'id') != v_piece_id
            and (elem->>'id') != (v_target->>'id')
        );
      else
        return jsonb_build_object('result', 'illegal');
    end case;

    -- Win by elimination: opponent has no mobile pieces left
    select count(*) into v_mob_left
    from jsonb_array_elements(coalesce(v_updated, '[]')) elem
    where (elem->>'player')::int = v_opponent
      and (elem->>'rank') not in ('landmine', 'hq');

    if v_mob_left = 0 then
      return jsonb_build_object(
        'result', 'win',
        'game',   jsonb_build_object(
          'pieces',     coalesce(v_updated, '[]'),
          'phase',      'finished',
          'setupDone',  jsonb_build_array(v_setup_p1, v_setup_p2),
          'lastBattle', jsonb_build_object('pos', v_to_pos, 'result', v_result)
        )
      );
    end if;

    return jsonb_build_object(
      'result', 'continue',
      'game',   jsonb_build_object(
        'pieces',     coalesce(v_updated, '[]'),
        'phase',      'playing',
        'setupDone',  jsonb_build_array(v_setup_p1, v_setup_p2),
        'lastBattle', jsonb_build_object('pos', v_to_pos, 'result', v_result)
      )
    );
  end if;

  -- Unrecognised action or wrong phase
  return jsonb_build_object('result', 'illegal');
end;
$$;


revoke all on function public._military_zone_initial_state()               from public;
revoke all on function public._military_zone_apply_move(jsonb, jsonb, int) from public;
