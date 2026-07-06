"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";
import type { GameSessionRow, Player } from "./types";

export type GameSessionState<TGame> = {
  session: GameSessionRow<TGame> | null;
  /** This browser's seat, or null when spectating / not yet loaded. */
  myRole: Player | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  /** Start a game or take the open seat. */
  join: () => Promise<void>;
  /** Submit a game-specific action, e.g. `{ col: 3 }`. */
  move: (action: Record<string, unknown>) => Promise<void>;
  /** Reset a finished game. */
  rematch: () => Promise<void>;
};

/**
 * Generic, game-agnostic realtime session.
 *
 * All games share this hook. It subscribes to `game_session` for the room,
 * and every mutation is a generic RPC (`game_join` / `game_move` /
 * `game_rematch`) that dispatches server-side to the game's own SQL logic by
 * `game_id`. New game state always arrives back over realtime.
 */
export function useGameSession<TGame = unknown>({
  roomKey,
  gameId,
  handle,
}: {
  roomKey: string;
  gameId: string;
  handle: string;
}): GameSessionState<TGame> {
  const [session, setSession] = useState<GameSessionRow<TGame> | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !roomKey) return;

    let active = true;
    const supabase = getSupabaseClient();

    (async () => {
      const id = await ensureAnonymousSession();
      if (!active) return;
      setUid(id);

      const { data } = await supabase
        .from("game_session")
        .select("*")
        .eq("room_key", roomKey)
        .eq("game_id", gameId)
        .in("status", ["waiting", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (data) setSession(data as GameSessionRow<TGame>);
      setReady(true);
    })();

    const channel = supabase
      .channel(`game:${roomKey}:${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_session",
          filter: `room_key=eq.${roomKey}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as GameSessionRow<TGame>;
          if (row.game_id !== gameId) return;
          setSession(row);
        }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      active = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomKey, gameId]);

  const myRole = useMemo<Player | null>(() => {
    if (!session || !uid) return null;
    if (session.state.players["1"]?.id === uid) return 1;
    if (session.state.players["2"]?.id === uid) return 2;
    return null;
  }, [session, uid]);

  const join = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error: rpcError } = await supabase.rpc("game_join", {
        p_room_key: roomKey,
        p_game_id: gameId,
        p_handle: handleRef.current,
      });
      if (rpcError) throw rpcError;
      if (data) {
        const { data: row } = await supabase
          .from("game_session")
          .select("*")
          .eq("id", data as string)
          .maybeSingle();
        if (row) setSession(row as GameSessionRow<TGame>);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the game.");
    } finally {
      setBusy(false);
    }
  }, [roomKey, gameId]);

  const move = useCallback(
    async (action: Record<string, unknown>) => {
      if (!session) return;
      setError(null);
      const supabase = getSupabaseClient();
      const { error: rpcError } = await supabase.rpc("game_move", {
        p_session: session.id,
        p_action: action,
      });
      // New state arrives via the realtime subscription.
      if (rpcError) setError(rpcError.message);
    },
    [session]
  );

  const rematch = useCallback(async () => {
    if (!session) return;
    setError(null);
    const supabase = getSupabaseClient();
    const { error: rpcError } = await supabase.rpc("game_rematch", {
      p_session: session.id,
    });
    if (rpcError) setError(rpcError.message);
  }, [session]);

  return { session, myRole, ready, busy, error, join, move, rematch };
}
