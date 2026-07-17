"use client";

import type { GameModule, GameBoardProps } from "@/games/types";
import { GeoChallengeBoard } from "./board";
import { GeoChallengeLobby } from "./lobby";

export const GEO_CHALLENGE_ID = "geo-challenge";

// Adapter: satisfies GameBoardProps while providing a no-op onExit.
// In practice the /play page always constructs GeoChallengeBoard directly
// and passes a real onExit; this adapter is the Board slot on GameModule.
function GeoChallengeAdapter({ roomKey, handle }: GameBoardProps) {
  return <GeoChallengeBoard roomKey={roomKey} handle={handle} onExit={() => {}} />;
}

export const geoChallenge: GameModule = {
  id: GEO_CHALLENGE_ID,
  minPlayers: 2,
  maxPlayers: 8,
  Board: GeoChallengeAdapter,
  Lobby: GeoChallengeLobby,
  renderMode: "fullpage",
};
