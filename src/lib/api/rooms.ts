import { ROOMS, type Room, type GameCategory } from "@/lib/data";

export type { Room };

/**
 * Synchronous seed for context initial state — avoids a loading flash.
 * Replace with [] when wiring Supabase (the useEffect fetch will populate).
 */
export const ROOMS_SEED = ROOMS;

export async function getRooms(): Promise<Room[]> {
  return ROOMS;
}

export async function getRoom(id: string): Promise<Room | null> {
  return ROOMS.find((r) => r.id === id) ?? null;
}

export type CreateRoomInput = {
  title: string;
  gameId: string;
  gameName: string;
  gameEmoji: string;
  capacity: number;
  visibility: "public" | "private";
  category: Exclude<GameCategory, "All">;
  host: string;
};

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  return {
    id: `custom-${Date.now()}`,
    ...input,
    participants: [input.host],
    status: "open",
  };
}
