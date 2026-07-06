"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { ROOMS_SEED, type Room } from "@/lib/api/rooms";

type RoomsContextValue = {
  rooms: Room[];
  addRoom: (room: Room) => void;
  toggleJoin: (id: string, user: string) => void;
};

const RoomsContext = createContext<RoomsContextValue | null>(null);

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(ROOMS_SEED);

  const addRoom = useCallback((room: Room) => {
    setRooms((prev) => [room, ...prev]);
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
    <RoomsContext.Provider value={{ rooms, addRoom, toggleJoin }}>
      {children}
    </RoomsContext.Provider>
  );
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error("useRooms must be used within RoomsProvider");
  return ctx;
}
