import type { GameModule } from "../types";
import { LudoBoard } from "./board";
import { LUDO_ID } from "./logic";

export const ludo: GameModule = {
  id: LUDO_ID,
  minPlayers: 2,
  maxPlayers: 4,
  Board: LudoBoard,
};
