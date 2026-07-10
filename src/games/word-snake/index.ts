import type { GameModule } from "../types";
import { WordSnakeBoard } from "./board";
import { WORD_SNAKE_ID } from "./logic";

export const wordSnake: GameModule = {
  id: WORD_SNAKE_ID,
  minPlayers: 2,
  maxPlayers: 8,
  Board: WordSnakeBoard,
};
