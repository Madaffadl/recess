/**
 * Word Snake — client-side types and pure display helpers.
 *
 * Game state lives in game_session.state (custom JSONB schema — not the
 * generic game_core schema). All mutations happen via the word_snake_*
 * Supabase RPCs defined in 0010_word_snake_multiplayer.sql.
 */

export const WORD_SNAKE_ID = "word-snake";
export const STARTING_LIVES = 3;
export const TURN_SECONDS = 10;

// Time-based scoring thresholds (seconds elapsed since turn started)
export const SCORE_FAST_SECS = 3;   // < 3s  → 3 pts
export const SCORE_MEDIUM_SECS = 7;  // 3–7s  → 2 pts
                                      // 7–10s → 1 pt
export const SCORE_FAST_PTS   = 3;
export const SCORE_MEDIUM_PTS = 2;
export const SCORE_SLOW_PTS   = 1;

/** One participant in a Word Snake session. */
export type WordSnakePlayer = {
  id: string;       // auth uid
  handle: string;   // display name
  lives: number;    // remaining lives (starts at 3)
  score: number;    // cumulative score this round
  eliminated: boolean;
};

/** Full game state stored in game_session.state. */
export type WordSnakeState = {
  players: WordSnakePlayer[];
  hostId: string;
  /** Index into players[] — whose turn it is. */
  turnIndex: number;
  /** Auth uid of the winner. Null while game is ongoing. */
  winner: string | null;
  moveCount: number;
  chain: string[];
  /** Epoch-ms when the current turn expires. Null while waiting. */
  turnExpiresAt: number | null;
  /** First player to reach this score wins. Null = elimination-only mode. */
  targetScore: number | null;
  /** Word language — controls which dictionary is used for validation. */
  language: "en" | "id";
  /** Seconds each player has per turn (host-configurable, 10–20). */
  turnSeconds: number;
};

/** Typed session row returned from game_session for Word Snake. */
export type WordSnakeSessionRow = {
  id: string;
  room_key: string;
  game_id: string;
  state: WordSnakeState;
  status: "waiting" | "active" | "finished";
};

/** Empty state used before a session loads. */
export function emptyWordSnakeState(): WordSnakeState {
  return {
    players: [],
    hostId: "",
    turnIndex: 0,
    winner: null,
    moveCount: 0,
    chain: [],
    turnExpiresAt: null,
    targetScore: null,
    language: "en",
    turnSeconds: TURN_SECONDS,
  };
}

/** Last letter of the last chain word, uppercased. Null when chain is empty. */
export function promptLetter(chain: string[]): string | null {
  if (chain.length === 0) return null;
  const last = chain[chain.length - 1];
  return last[last.length - 1].toUpperCase();
}

/** True if `word` already appears in the chain (case-insensitive). */
export function isWordUsed(word: string, chain: string[]): boolean {
  const lower = word.toLowerCase();
  return chain.some((w) => w.toLowerCase() === lower);
}

/** Dot color class per player seat (index 0–7). */
export const PLAYER_DOT_COLORS = [
  "bg-amber-400",
  "bg-sky-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-rose-400",
  "bg-orange-400",
  "bg-pink-400",
  "bg-cyan-400",
] as const;
