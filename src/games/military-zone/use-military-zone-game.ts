"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";
import { MILITARY_ZONE_ID, type MilitaryZoneSessionRow } from "./logic";

export type MilitaryZoneGameState = {
  session:  MilitaryZoneSessionRow | null;
  myRole:   number | null;
  uid:      string | null;
  ready:    boolean;
  busy:     boolean;
  error:    string | null;
  join:     (numPlayers?: number) => Promise<void>;
  move:     (action: Record<string, unknown>) => Promise<void>;
  rematch:  () => Promise<void>;
};

export function useMilitaryZoneGame({
  roomKey,
  handle,
}: {
  roomKey: string;
  handle:  string;
}): MilitaryZoneGameState {
  const [session, setSession] = useState<MilitaryZoneSessionRow | null>(null);
  const [uid,     setUid]     = useState<string | null>(null);
  const [ready,   setReady]   = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const handleRef  = useRef(handle);
  useEffect(() => { handleRef.current = handle; }, [handle]);

  // ── Init: authenticate + fetch + subscribe ──────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseClient();

    async function init() {
      const authUid = await ensureAnonymousSession();
      if (cancelled) return;
      setUid(authUid);

      const { data } = await supabase
        .from("game_session")
        .select("*")
        .eq("room_key", roomKey)
        .eq("game_id", MILITARY_ZONE_ID)
        .in("status", ["waiting", "active", "finished"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (data) setSession(data as MilitaryZoneSessionRow);
      setReady(true);

      const ch = supabase
        .channel(`mz:${roomKey}`)
        .on(
          "postgres_changes",
          {
            event:  "*",
            schema: "public",
            table:  "game_session",
            filter: `room_key=eq.${roomKey}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new as MilitaryZoneSessionRow;
            if (row.game_id !== MILITARY_ZONE_ID) return;
            setSession(row);
          }
        )
        .subscribe();

      channelRef.current = ch;
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [roomKey]);

  // ── Derive myRole from uid vs. players dict ────────────────────────────
  const myRole = useMemo<number | null>(() => {
    if (!session || !uid) return null;
    const numPlayers = session.state.numPlayers;
    for (let i = 1; i <= numPlayers; i++) {
      if (session.state.players[String(i)]?.id === uid) return i;
    }
    return null;
  }, [session, uid]);

  // ── Actions ────────────────────────────────────────────────────────────

  const join = useCallback(async (numPlayers = 2) => {
    if (!isSupabaseConfigured) { setError("Supabase not configured."); return; }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionId, error: rpcErr } = await supabase.rpc(
        "military_zone_join",
        {
          p_room_key:    roomKey,
          p_handle:      handleRef.current,
          p_num_players: numPlayers,
        }
      );
      if (rpcErr) throw rpcErr;
      const { data } = await supabase
        .from("game_session")
        .select("*")
        .eq("id", sessionId as string)
        .single();
      if (data) {
        setSession((prev) => {
          const row = data as MilitaryZoneSessionRow;
          // Guard against stale reads overwriting a correct Realtime update:
          // if Realtime already delivered the active session, don't roll back to waiting.
          if (prev?.status === "active" && row.status === "waiting") return prev;
          return row;
        });
      }
    } catch (e) {
      setError((e as Error).message ?? "Failed to join.");
    } finally {
      setBusy(false);
    }
  }, [roomKey]);

  const move = useCallback(async (action: Record<string, unknown>) => {
    if (!session || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("military_zone_move", {
        p_session_id: session.id,
        p_action:     action,
      });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setError((e as Error).message ?? "Failed to move.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const rematch = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("military_zone_rematch", {
        p_session_id: session.id,
      });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setError((e as Error).message ?? "Failed to rematch.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  return { session, myRole, uid, ready, busy, error, join, move, rematch };
}
