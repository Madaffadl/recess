/**
 * Connect Four — client-side types + pure display helpers.
 *
 * The client never validates moves; it renders the `game` payload streamed
 * from Supabase and submits actions via the generic `game_move` RPC. Board
 * rules + win detection live in supabase/migrations/0003_connect_four.sql.
 */

export const CONNECT_FOUR_ID = "connect-four";

export const COLS = 7;
export const ROWS = 6;
export const CELLS = COLS * ROWS; // 42

/** 0 = empty · 1 = player one · 2 = player two */
export type Cell = 0 | 1 | 2;

/** Game-specific payload stored under `state.game`. */
export type ConnectFourGame = {
  /** Flat, row-major, length 42. Row 0 = top, row 5 = bottom. */
  board: Cell[];
  lastCol: number | null;
  lastRow: number | null;
};

/** Value at (row, col) in the flat board. */
export function cellAt(board: Cell[], row: number, col: number): Cell {
  return board[row * COLS + col];
}

/** A column is full when its top cell is occupied. */
export function columnFull(board: Cell[], col: number): boolean {
  return cellAt(board, 0, col) !== 0;
}

/** Empty board (all zeros) — placeholder before a session loads. */
export function emptyBoard(): Cell[] {
  return Array<Cell>(CELLS).fill(0);
}
