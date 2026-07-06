import type { GameModule } from "../types";
import { ConnectFourBoard } from "./board";
import { CONNECT_FOUR_ID } from "./logic";

export const connectFour: GameModule = {
  id: CONNECT_FOUR_ID,
  minPlayers: 2,
  maxPlayers: 2,
  Board: ConnectFourBoard,
};
