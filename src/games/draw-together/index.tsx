"use client";

import type { GameModule, GameBoardProps } from "@/games/types";
import { DRAW_TOGETHER_ID } from "./logic";
import { DrawTogetherBoard } from "./board";
import { DrawTogetherLobby } from "./lobby";

// Adapter: satisfies GameBoardProps while providing a no-op onExit.
// In practice, fullpage games never render Board inline — the game page
// constructs DrawTogetherBoard directly and passes a real onExit handler.
function DrawTogetherBoardAdapter({ roomKey, handle }: GameBoardProps) {
  return <DrawTogetherBoard roomKey={roomKey} handle={handle} onExit={() => {}} />;
}

export const drawTogether: GameModule = {
  id: DRAW_TOGETHER_ID,
  minPlayers: 2,
  maxPlayers: 8,
  Board: DrawTogetherBoardAdapter,
  Lobby: DrawTogetherLobby,
  renderMode: "fullpage",
};
