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

/** Returns the set of flat board indices that form the winning line(s). */
export function findWinCells(board: Cell[], winner: 1 | 2): Set<number> {
  const result = new Set<number>();
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const line: number[] = [];
        for (let n = 0; n < 4; n++) {
          const nr = r + dr * n;
          const nc = c + dc * n;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr * COLS + nc] !== winner) break;
          line.push(nr * COLS + nc);
        }
        if (line.length === 4) line.forEach((i) => result.add(i));
      }
    }
  }
  return result;
}
