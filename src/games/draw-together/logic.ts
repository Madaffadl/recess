export const DRAW_TOGETHER_ID = "draw-together";

export type DrawTogetherStatus =
  | "waiting"
  | "word_selection"
  | "drawing"
  | "round_end"
  | "finished";

export type DrawTogetherPlayer = {
  userId: string;
  handle: string;
  score: number;
  hasGuessed: boolean;
};

export type DrawTogetherSession = {
  id: string;
  roomKey: string;
  status: DrawTogetherStatus;
  hostId: string;
  roundsPerPlayer: number;
  drawSeconds: number;
  currentRound: number;
  currentDrawerId: string | null;
  currentWordLength: number | null;
  currentWordHint: string | null;   // e.g. "_ _ _ _ _" (space-separated)
  roundWordRevealed: string | null; // set at round_end
  roundStartedAt: string | null;
  players: DrawTogetherPlayer[];
};

/** Row shape returned directly from the draw_together_session table. */
export type DrawTogetherSessionRow = {
  id: string;
  room_key: string;
  status: DrawTogetherStatus;
  host_id: string;
  rounds_per_player: number;
  draw_seconds: number;
  current_round: number;
  current_drawer_id: string | null;
  current_word_length: number | null;
  current_word_hint: string | null;
  round_word_revealed: string | null;
  round_started_at: string | null;
  players: Array<{
    userId: string;
    handle: string;
    score: number;
    hasGuessed: boolean;
  }>;
  created_at: string;
  updated_at: string;
};

/** A broadcast stroke batch sent from the drawer's canvas. */
export type StrokeBatch = {
  strokeId: string;
  points: Array<[number, number]>; // coordinates in 800×500 logical space
  color: string;
  size: number;
  tool: "pen" | "eraser";
  done: boolean; // true on pointerup
};

export const CANVAS_W = 800;
export const CANVAS_H = 500;

export const COLORS = [
  "#000000", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#92400e", "#6b7280",
];

export const BRUSH_SIZES = [4, 8, 16, 24];

export function rowToSession(row: DrawTogetherSessionRow): DrawTogetherSession {
  return {
    id:               row.id,
    roomKey:          row.room_key,
    status:           row.status,
    hostId:           row.host_id,
    roundsPerPlayer:  row.rounds_per_player,
    drawSeconds:      row.draw_seconds,
    currentRound:     row.current_round,
    currentDrawerId:  row.current_drawer_id,
    currentWordLength: row.current_word_length,
    currentWordHint:  row.current_word_hint,
    roundWordRevealed: row.round_word_revealed,
    roundStartedAt:   row.round_started_at,
    players:          row.players ?? [],
  };
}
