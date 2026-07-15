import type { GameModule } from "./types";
import { connectFour } from "./connect-four";
import { wordSnake } from "./word-snake";
import { drawTogether } from "./draw-together/index";

/**
 * Playable games. A game appears here only once its module + SQL logic exist;
 * everything else in the catalog (`GAMES` in lib/data) renders "coming soon".
 *
 * To add a game: create `src/games/<game>/`, add its `0015_<game>.sql`
 * migration, then add the module to this array.
 */
const MODULES: GameModule[] = [connectFour, wordSnake, drawTogether];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export function getGameModule(id: string): GameModule | null {
  return BY_ID.get(id) ?? null;
}

export function isPlayable(id: string): boolean {
  return BY_ID.has(id);
}
