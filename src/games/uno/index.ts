import type { GameModule } from "../types";
import { UnoBoard } from "./board";
import { UNO_ID } from "./logic";

export const uno: GameModule = {
  id: UNO_ID,
  minPlayers: 2,
  maxPlayers: 10,
  Board: UnoBoard,
};
