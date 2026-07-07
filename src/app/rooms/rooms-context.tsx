"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getRooms, ROOMS_SEED, type Room } from "@/lib/api/rooms";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { GameCategory, RoomStatus } from "@/lib/data";

type RoomsContextValue = {
  rooms: Room[];
  loading: boolean;
  addRoom: (room: Room) => void;
  toggleJoin: (id: string, user: string) => void;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(ROOMS_SEED);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    getRooms()
      .then((fetched) => setRooms(fetched))
      .catch(() => {
        // Keep the seed rooms already in state; just stop blocking the UI.
      })
      .finally(() => setLoading(false));

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel("rooms:list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room" },
        ({ new: row }) => {
          const r = row as {
            slug: string; title: string; game_id: string; game_name: string;
            game_emoji: string; host_handle: string; capacity: number;
            visibility: string; category: string; status: string;
            current_count: number;
          };
          // Note: invite_code is intentionally NOT read here — the realtime
          // feed reaches every connected client, so codes must not ride along.
          const newRoom: Room = {
            id: r.slug, title: r.title, gameId: r.game_id,
            gameName: r.game_name, gameEmoji: r.game_emoji,
            host: r.host_handle, participants: [],
            capacity: r.capacity,
            visibility: r.visibility as "public" | "private",
            category: r.category as Exclude<GameCategory, "All">,
            status: r.status as RoomStatus,
            currentCount: r.current_count,
          };
          setRooms((prev) =>
            prev.some((x) => x.id === newRoom.id) ? prev : [newRoom, ...prev]
          );
        }
      )
      // Live occupancy: update currentCount + status when room_join/room_leave fires.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "room" },
        ({ new: row }) => {
          const r = row as { slug: string; current_count: number; status: string };
          setRooms((prev) =>
            prev.map((room) =>
              room.id === r.slug
                ? { ...room, currentCount: r.current_count, status: r.status as RoomStatus }
                : room
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addRoom = useCallback((room: Room) => {
    setRooms((prev) =>
      prev.some((r) => r.id === room.id) ? prev : [room, ...prev]
    );
  }, []);

  const toggleJoin = useCallback((id: string, user: string) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const inRoom = r.participants.includes(user);
        return {
          ...r,
          participants: inRoom
            ? r.participants.filter((p) => p !== user)
            : [...r.participants, user],
        };
      })
    );
  }, []);

  return (
    <RoomsContext.Provider value={{ rooms, loading, addRoom, toggleJoin }}>
      {children}
    </RoomsContext.Provider>
  );
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error("useRooms must be used within RoomsProvider");
  return ctx;
}
