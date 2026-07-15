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

export type Player = 1 | 2;
export type Seat = { id: string; handle: string } | null;
export type GamePlayers = { "1": Seat; "2": Seat };
export type GameStatus = "waiting" | "active" | "finished";

export type GameState<TGame = unknown> = {
  players: GamePlayers;
  turn: Player;
  startTurn?: Player;
  /** null = ongoing · 0 = draw · 1|2 = winner */
  winner: 0 | 1 | 2 | null;
  moveCount: number;
  /** Game-specific payload (board, hands, etc.). */
  game: TGame;
};

export type GameSessionRow<TGame = unknown> = {
  id: string;
  room_key: string;
  game_id: string;
  state: GameState<TGame>;
  status: GameStatus;
};

export type GameBoardProps = {
  roomKey: string;
  handle: string;
};

export type GameModule = {
  /** Must match `game_session.game_id` and the SQL fn prefix (see registry). */
  id: string;
  minPlayers: number;
  maxPlayers: number;
  Board: ComponentType<GameBoardProps>;
  /**
   * 'inline'   → rendered inside the room page (default, existing behaviour).
   * 'fullpage' → room page shows a lobby; on game start all players navigate
   *              to /rooms/[id]/play which renders the Board full-screen.
   */
  renderMode?: "inline" | "fullpage";
};
