/**
 * Ludo — client-side types + board geometry + pure display helpers.
 *
 * Like the other multiplayer games (Word Snake, Military Zone), Ludo bypasses
 * the 2-player generic `game_core` dispatcher and manages its own state through
 * dedicated `ludo_*` RPCs. The client NEVER validates moves or rolls dice; it
 * renders the `state` streamed from Supabase and submits actions. All rules —
 * server-authoritative dice, turn order (2–4 players), captures, win detection —
 * live in supabase/migrations/0023_ludo.sql.
 *
 * Position model — each token stores a single integer `p`:
 *   p = 0            → in its base/yard (not yet on the board)
 *   p = 1..51        → on the shared 52-cell ring (relative to the player's own
 *                      entry). Absolute ring index = (START_OFFSET[color] + p-1) % 52
 *   p = 52..57       → in the player's private home column (6 cells)
 *   p = 57           → finished (reached home). A token needs an EXACT roll to
 *                      land on 57; overshoots are illegal.
 *
 * The geometry here (TRACK / HOME_PATH / START_OFFSET / SAFE_CELLS) is the
 * source of truth for rendering. The SQL engine re-encodes the same offsets and
 * safe set so client and server agree on captures.
 */

export const LUDO_ID = "ludo";

/** Grid is 15×15 (classic Ludo cross). */
export const GRID = 15;

/** Token colour === player index in `state.players` (0..3). */
export type LudoColor = 0 | 1 | 2 | 3;

/** [row, col] on the 15×15 grid. */
export type Cell = readonly [number, number];

/**
 * The shared ring, 52 cells, clockwise. TRACK[i] is the grid cell of absolute
 * ring index i. Entry (start) cells sit at indices 0, 13, 26, 39.
 */
export const TRACK: readonly Cell[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],       // 0-4   red entry → right
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], // 5-10  up the top-left lane
  [0, 7],                                         // 11
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 12-17 green entry → down
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], // 18-23 → right
  [7, 14],                                        // 24
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 25-30 yellow entry → left
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], // 31-36 → down
  [14, 7],                                        // 37
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 38-43 blue entry → up
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], // 44-49 → left
  [7, 0],                                         // 50
  [6, 0],                                         // 51
];

/** Absolute ring index of each colour's entry cell. */
export const START_OFFSET: readonly number[] = [0, 13, 26, 39];

/**
 * Safe ring cells — a token here cannot be captured, and any number may share
 * it. The four entry cells plus the four "star" cells 8 ahead of each entry.
 */
export const SAFE_CELLS: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/**
 * Private home columns, 6 cells each (p = 52..57). HOME_PATH[color][p-52] is the
 * grid cell. The last (index 5, p=57) is the finish square touching the centre.
 */
export const HOME_PATH: readonly (readonly Cell[])[] = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], // red   (from left)
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]], // green (from top)
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // yellow (from right)
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // blue  (from bottom)
];

/** The four parking slots in each colour's base yard (for tokens at p=0). */
export const BASE_SLOTS: readonly (readonly Cell[])[] = [
  [[1, 1], [1, 4], [4, 1], [4, 4]],         // red   — top-left
  [[1, 10], [1, 13], [4, 10], [4, 13]],     // green — top-right
  [[10, 10], [10, 13], [13, 10], [13, 13]], // yellow— bottom-right
  [[10, 1], [10, 4], [13, 1], [13, 4]],     // blue  — bottom-left
];

/** The 6×6 base yard bounding box per colour: [rowStart, colStart]. */
export const BASE_BOX: readonly Cell[] = [
  [0, 0],   // red
  [0, 9],   // green
  [9, 9],   // yellow
  [9, 0],   // blue
];

/** Centre finish square. */
export const CENTER: Cell = [7, 7];

// ─── Per-colour presentation ────────────────────────────────────────────────

export type ColorMeta = {
  key: "red" | "green" | "yellow" | "blue";
  label: string;
  /** Token body gradient. */
  token: string;
  /** Base yard / home column tint. */
  surface: string;
  /** Solid dot / accent. */
  dot: string;
  /** Ring used to highlight the active seat + movable tokens. */
  ring: string;
  /** Track entry + home cell tint. */
  path: string;
  /** Hex for inline SVG-ish glows. */
  hex: string;
};

export const COLORS: readonly ColorMeta[] = [
  {
    key: "red",
    label: "red",
    token: "bg-gradient-to-br from-rose-300 via-rose-500 to-rose-700",
    surface: "bg-rose-500/10",
    dot: "bg-rose-500",
    ring: "ring-rose-400",
    path: "bg-rose-500/25",
    hex: "#f43f5e",
  },
  {
    key: "green",
    label: "green",
    token: "bg-gradient-to-br from-emerald-300 via-emerald-500 to-emerald-700",
    surface: "bg-emerald-500/10",
    dot: "bg-emerald-500",
    ring: "ring-emerald-400",
    path: "bg-emerald-500/25",
    hex: "#10b981",
  },
  {
    key: "yellow",
    label: "gold",
    token: "bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600",
    surface: "bg-amber-500/10",
    dot: "bg-amber-500",
    ring: "ring-amber-400",
    path: "bg-amber-500/25",
    hex: "#f59e0b",
  },
  {
    key: "blue",
    label: "blue",
    token: "bg-gradient-to-br from-sky-300 via-blue-500 to-blue-700",
    surface: "bg-blue-500/10",
    dot: "bg-blue-500",
    ring: "ring-sky-400",
    path: "bg-blue-500/25",
    hex: "#3b82f6",
  },
];

// ─── Types (mirror of state.game / state envelope) ──────────────────────────

export type LudoPlayer = {
  id: string;
  handle: string;
  color: LudoColor;
  /** Length-4 array of token positions (see position model above). */
  tokens: number[];
  /** True once all four tokens reach p=57. */
  finished: boolean;
};

/** For UI feedback after the last action. */
export type LudoEvent =
  | null
  | "rolled"
  | "six"
  | "nomove"
  | "captured"
  | "home"
  | "win";

export type LudoState = {
  players: LudoPlayer[];
  hostId: string;
  /** Index into `players` whose turn it is. */
  turnIndex: number;
  /** Pending die awaiting a token move, or null when the player must roll. */
  dice: number | null;
  /** Winner's uid, or null while ongoing. */
  winner: string | null;
  moveCount: number;
  lastEvent: LudoEvent;
  /** [playerIndex, tokenIndex] of the most recent move, for animation focus. */
  lastMove: [number, number] | null;
};

export type LudoSessionRow = {
  id: string;
  room_key: string;
  game_id: string;
  state: LudoState;
  status: "waiting" | "active" | "finished";
};

// ─── Pure helpers ────────────────────────────────────────────────────────────

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
/** Terminal position — a token is home. */
export const FINISH = 57;

/**
 * Where a token would land given a die, or null if the move is illegal.
 * MUST mirror the server (`_ludo_token_target` in the SQL migration).
 */
export function tokenTarget(p: number, dice: number): number | null {
  if (p === 0) return dice === 6 ? 1 : null; // leave base only on a 6
  if (p >= 1 && p < FINISH) {
    const np = p + dice;
    return np <= FINISH ? np : null; // exact landing on the finish; no overshoot
  }
  return null; // already finished
}

/** Which of a player's four tokens can legally move with the given die. */
export function movableTokens(tokens: number[], dice: number | null): boolean[] {
  if (dice == null) return [false, false, false, false];
  return tokens.map((p) => tokenTarget(p, dice) !== null);
}

/** Absolute ring index for a token on the ring (p=1..51), else null. */
export function absRingIndex(color: LudoColor, p: number): number | null {
  if (p < 1 || p > 51) return null;
  return (START_OFFSET[color] + p - 1) % 52;
}

/** Grid cell of a token given its colour, position and slot (for base parking). */
export function tokenCell(color: LudoColor, p: number, tokenIndex: number): Cell {
  if (p === 0) return BASE_SLOTS[color][tokenIndex];
  const abs = absRingIndex(color, p);
  if (abs != null) return TRACK[abs];
  // home column p=52..57
  return HOME_PATH[color][p - 52];
}

export function isSafeCell(absIdx: number): boolean {
  return SAFE_CELLS.has(absIdx);
}

/** Human blurb for the last event (drives the status banner tone). */
export function eventLabel(ev: LudoEvent): string | null {
  switch (ev) {
    case "six":
      return "Rolled a 6 — roll again!";
    case "captured":
      return "Capture! An opponent was sent home.";
    case "home":
      return "A token reached home!";
    case "nomove":
      return "No legal move — turn passes.";
    default:
      return null;
  }
}
