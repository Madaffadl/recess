-- ============================================================
-- Recess — Connect Four  (per-game logic for the game_core dispatcher)
--
-- Implements the two functions game_core.sql dispatches to:
--   _connect_four_initial_state()
--   _connect_four_apply_move(game, action, player)
--
-- These are private helpers (not granted to clients); they are only ever
-- called by the SECURITY DEFINER functions in 0002_game_core.sql.
--
-- Board model
--   42-cell flat array, row-major, 6 rows × 7 cols.
--   index(row, col) = row*7 + col     (row 0 = TOP, row 5 = BOTTOM)
--   cells: 0 empty · 1 player one · 2 player two
--
-- game payload shape:  { "board": [42 ints], "lastCol": int|null, "lastRow": int|null }
-- action shape:        { "col": 0..6 }
--
-- Run AFTER 0002_game_core.sql.
-- ============================================================

-- Empty board payload.
create or replace function public._connect_four_initial_state()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'board',   to_jsonb(array_fill(0, array[42])),
    'lastCol', null,
    'lastRow', null
  );
$$;

-- 4-in-a-row check for `p_player` on a 1-indexed flat board.
create or replace function public._connect_four_check_win(p_board int[], p_player int)
returns boolean
language plpgsql
immutable
as $$
declare
  r int;
  c int;
begin
  -- cell(row,col) = p_board[row*7 + col + 1]

  -- horizontal
  for r in 0..5 loop
    for c in 0..3 loop
      if p_board[r*7+c+1] = p_player
         and p_board[r*7+c+2] = p_player
         and p_board[r*7+c+3] = p_player
         and p_board[r*7+c+4] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  -- vertical
  for c in 0..6 loop
    for r in 0..2 loop
      if p_board[r*7+c+1] = p_player
         and p_board[(r+1)*7+c+1] = p_player
         and p_board[(r+2)*7+c+1] = p_player
         and p_board[(r+3)*7+c+1] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  -- diagonal ↘ (row+, col+)
  for r in 0..2 loop
    for c in 0..3 loop
      if p_board[r*7+c+1] = p_player
         and p_board[(r+1)*7+c+2] = p_player
         and p_board[(r+2)*7+c+3] = p_player
         and p_board[(r+3)*7+c+4] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  -- diagonal ↙ (row+, col-)
  for r in 0..2 loop
    for c in 3..6 loop
      if p_board[r*7+c+1] = p_player
         and p_board[(r+1)*7+c] = p_player
         and p_board[(r+2)*7+c-1] = p_player
         and p_board[(r+3)*7+c-2] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  return false;
end;
$$;

-- Apply a drop. Returns { result, game } for the dispatcher to act on.
create or replace function public._connect_four_apply_move(
  p_game   jsonb,
  p_action jsonb,
  p_player int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_col   int := (p_action->>'col')::int;
  v_board int[];
  v_row   int := -1;
  r       int;
  v_win   boolean;
  v_full  boolean;
begin
  if v_col is null or v_col < 0 or v_col > 6 then
    return jsonb_build_object('result', 'illegal');
  end if;

  v_board := array(select jsonb_array_elements_text(p_game->'board'))::int[];

  -- lowest empty cell in the column (scan bottom → top)
  for r in reverse 5..0 loop
    if v_board[r*7 + v_col + 1] = 0 then
      v_row := r;
      exit;
    end if;
  end loop;

  if v_row = -1 then
    return jsonb_build_object('result', 'illegal');
  end if;

  v_board[v_row*7 + v_col + 1] := p_player;

  v_win  := public._connect_four_check_win(v_board, p_player);
  v_full := not exists (select 1 from unnest(v_board) x where x = 0);

  return jsonb_build_object(
    'result', case when v_win then 'win' when v_full then 'draw' else 'continue' end,
    'game',   jsonb_build_object(
                'board',   to_jsonb(v_board),
                'lastCol', v_col,
                'lastRow', v_row
              )
  );
end;
$$;

-- These helpers are only ever called by the SECURITY DEFINER dispatcher in
-- 0002_game_core.sql (which runs as the function owner). No client should call
-- them directly, so revoke the default PUBLIC execute grant.
revoke all on function public._connect_four_initial_state()               from public;
revoke all on function public._connect_four_check_win(int[], int)         from public;
revoke all on function public._connect_four_apply_move(jsonb, jsonb, int) from public;
