import type { GameModule } from "../types";
import { MilitaryZoneBoard } from "./board";
import { MILITARY_ZONE_ID } from "./logic";

export const militaryZone: GameModule = {
  id: MILITARY_ZONE_ID,
  minPlayers: 2,
  maxPlayers: 2,
  Board: MilitaryZoneBoard,
};
