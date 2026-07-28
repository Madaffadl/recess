import type { ComponentType } from "react";

/**
 * Shared game contract.
 *
 * Every game is a self-contained module under `src/games/<game>/` that exports
 * a {@link GameModule}. The room page looks the module up by id via the
 * registry and renders its `Board`. Adding a game = a new folder + a row in
 * the registry + a SQL migration for its server-side logic. Nothing else in
 * the app changes.
 *
 * State is a two-layer envelope: the generic fields (seating, turn, winner)
 * are managed by the shared `game_*` RPCs; the game-specific payload lives
 * under `game` and is produced/consumed only by that game's module + SQL.
 */

/** Props passed to a fullpage game's lobby component (shown in the room page). */
export type LobbyProps = {
  roomKey: string;
  handle: string;
  isHost: boolean;
  onGameStarted: () => void;
};

export type Player = number;
export type Seat = { id: string; handle: string } | null;
export type GamePlayers = Record<string, Seat>;
export type GameStatus = "waiting" | "active" | "finished";
/** Per-seat readiness for the generic pre-game lobby (`state.ready`). */
export type ReadyMap = Record<string, boolean>;

export type GameState<TGame = unknown> = {
  players: GamePlayers;
  /**
   * Per-seat readiness for the generic pre-game lobby. Managed by the
   * `game_ready` RPC; identity stays in `players`, runtime readiness here.
   * Optional because it only exists while a session is `waiting`.
   */
  ready?: ReadyMap;
  turn: Player;
  startTurn?: Player;
  /** null = ongoing · 0 = draw · seat number = winner */
  winner: 0 | number | null;
  moveCount: number;
  /**
   * Game-specific payload (board, hands, etc.). `null` until both players
   * are ready and the game is initialised (see `game_ready`).
   */
  game: TGame;
};

export type GameSessionRow<TGame = unknown> = {
  id: string;
  room_key: string;
  game_id: string;
  state: GameState<TGame>;
  status: GameStatus;
};

/** One live room participant (from Realtime Presence). */
export type RoomParticipant = { handle: string; uid?: string };

export type GameBoardProps = {
  roomKey: string;
  handle: string;
  /** Called by fullpage boards when the player exits back to the room lobby. */
  onExit?: () => void;
  /** All participants currently present in the room (from Realtime Presence).
   *  When provided, the ready lobby shows the full room instead of just the
   *  two game seats. The game engine itself stays 2-player. */
  participants?: RoomParticipant[];
  /** True when this browser session belongs to the room host.
   *  Controls which action button the lobby renders:
   *    true  → yellow "Start Game" button (host only).
   *    false → green "Ready" / "Cancel Ready" button (non-host players).
   *  Absent → legacy behaviour (no host-controlled start). */
  isHost?: boolean;
  /** Called by the board when the host explicitly closes the room,
   *  so the room page can broadcast `room_closed` to all other participants. */
  onCloseRoom?: () => void;
};

export type GameModule = {
  /** Must match `game_session.game_id` and the SQL fn prefix (see registry). */
  id: string;
  minPlayers: number;
  maxPlayers: number;
  Board: ComponentType<GameBoardProps>;
  /**
   * 'inline'   → rendered inside the room page (default, existing behaviour).
   * 'fullpage' → room page shows a Lobby; on game start all players navigate
   *              to /rooms/[id]/play which renders the Board full-screen.
   */
  renderMode?: "inline" | "fullpage";
  /**
   * Required when renderMode === 'fullpage'. Rendered in the room page while
   * players are waiting. The host uses it to start the game.
   */
  Lobby?: ComponentType<LobbyProps>;
};
