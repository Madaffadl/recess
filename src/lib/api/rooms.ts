import { ROOMS, type GameCategory, type Room, type RoomStatus } from "@/lib/data";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type { Room };

/**
 * Synchronous seed for context initial state.
 * Supabase configured → start empty (async fetch populates).
 * Not configured → fall back to static mock data.
 */
export const ROOMS_SEED: Room[] = isSupabaseConfigured ? [] : ROOMS;

type DbRoom = {
  slug: string;
  title: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  host_handle: string;
  capacity: number;
  visibility: string;
  category: string;
  status: string;
  invite_code: string;
  current_count: number;
};

// Full column set — includes invite_code. Only used where the caller is
// entitled to the code (room creation, invite-code RPC lookup).
const DB_COLUMNS =
  "slug, title, game_id, game_name, game_emoji, host_handle, capacity, visibility, category, status, invite_code, current_count";

// List column set — deliberately omits invite_code so the public room list
// never ships private invite codes to every visitor's browser.
const LIST_COLUMNS =
  "slug, title, game_id, game_name, game_emoji, host_handle, capacity, visibility, category, status, current_count";

function toRoom(row: DbRoom): Room {
  return {
    id: row.slug,
    title: row.title,
    gameId: row.game_id,
    gameName: row.game_name,
    gameEmoji: row.game_emoji,
    host: row.host_handle,
    participants: [],
    capacity: row.capacity,
    visibility: row.visibility as "public" | "private",
    category: row.category as Exclude<GameCategory, "All">,
    status: row.status as RoomStatus,
    inviteCode: row.invite_code || undefined,
    currentCount: row.current_count,
  };
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function toSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 48) +
    "-" +
    Date.now().toString(36)
  );
}

export async function getRooms(): Promise<Room[]> {
  if (!isSupabaseConfigured) return ROOMS;
  const { data, error } = await getSupabaseClient()
    .from("room")
    .select(LIST_COLUMNS)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error || !data) return ROOMS;
  return (data as DbRoom[]).map(toRoom);
}

export async function getRoom(id: string): Promise<Room | null> {
  if (!isSupabaseConfigured) return ROOMS.find((r) => r.id === id) ?? null;
  const { data, error } = await getSupabaseClient()
    .from("room")
    .select(DB_COLUMNS)
    .eq("slug", id)
    .gt("expires_at", new Date().toISOString())
    .single();
  if (error || !data) return null;
  return toRoom(data as DbRoom);
}

export async function getRoomByInviteCode(code: string): Promise<Room | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getSupabaseClient()
    .rpc("room_by_invite", { p_code: code.toUpperCase() });
  if (error || !data || (data as DbRoom[]).length === 0) return null;
  return toRoom((data as DbRoom[])[0]);
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
  const slug = toSlug(input.title);
  const inviteCode = generateInviteCode();

  const fallback: Room = {
    id: slug,
    title: input.title,
    gameId: input.gameId,
    gameName: input.gameName,
    gameEmoji: input.gameEmoji,
    host: input.host,
    participants: [input.host],
    capacity: input.capacity,
    visibility: input.visibility,
    category: input.category,
    status: "open",
    inviteCode,
    currentCount: 1,
  };

  if (!isSupabaseConfigured) return fallback;

  const { data, error } = await getSupabaseClient()
    .from("room")
    .insert({
      slug,
      title: input.title,
      game_id: input.gameId,
      game_name: input.gameName,
      game_emoji: input.gameEmoji,
      host_handle: input.host,
      capacity: input.capacity,
      visibility: input.visibility,
      category: input.category,
      status: "open",
      invite_code: inviteCode,
      current_count: 0,
    })
    .select(DB_COLUMNS)
    .single();

  if (error || !data) return fallback;
  return { ...toRoom(data as DbRoom), participants: [input.host], inviteCode };
}

export type JoinError = "full" | "expired" | "not_found" | "error";

/** Race-safe join. Returns null on success, error string on failure. */
export async function joinRoom(slug: string): Promise<JoinError | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getSupabaseClient().rpc("room_join", { p_slug: slug });
  // A transport/auth error is a genuine failure — never report it as success.
  if (error) return "error";
  const result = data as { ok?: boolean; error?: string };
  if (result?.error) return result.error as JoinError;
  return null;
}

/** Fire-and-forget — call without awaiting in cleanup functions. */
export async function leaveRoom(slug: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  await getSupabaseClient().rpc("room_leave", { p_slug: slug });
}
