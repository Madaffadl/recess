"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";
import { LUDO_ID, type LudoSessionRow } from "./logic";

export type LudoGameState = {
  session: LudoSessionRow | null;
  uid: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  join: () => Promise<void>;
  start: () => Promise<void>;
  roll: () => Promise<void>;
  move: (token: number) => Promise<void>;
  pass: () => Promise<void>;
  rematch: () => Promise<void>;
};

/**
 * Realtime session for Ludo. Like Word Snake it drives its own `ludo_*` RPCs and
 * streams the whole state back over Postgres Changes on `game_session`.
 */
export function useLudoGame({
  roomKey,
  handle,
}: {
  roomKey: string;
  handle: string;
}): LudoGameState {
  const [session, setSession] = useState<LudoSessionRow | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  // ── Init: authenticate + fetch + subscribe ─────────────────────────────
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
        .eq("game_id", LUDO_ID)
        .in("status", ["waiting", "active", "finished"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (data) setSession(data as LudoSessionRow);
      setReady(true);

      const ch = supabase
        .channel(`ludo:${roomKey}:${LUDO_ID}`)
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
            const row = payload.new as LudoSessionRow;
            if (row.game_id !== LUDO_ID) return;
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

  // ── Actions ────────────────────────────────────────────────────────────

  const join = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionId, error: rpcErr } = await supabase.rpc("ludo_join", {
        p_room_key: roomKey,
        p_handle: handleRef.current,
      });
      if (rpcErr) throw rpcErr;
      const { data } = await supabase
        .from("game_session")
        .select("*")
        .eq("id", sessionId as string)
        .single();
      if (data) setSession(data as LudoSessionRow);
    } catch (e) {
      setError((e as Error).message ?? "Could not join the game.");
    } finally {
      setBusy(false);
    }
  }, [roomKey]);

  const start = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("ludo_start", {
        p_session_id: session.id,
      });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setError((e as Error).message ?? "Could not start the game.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const roll = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("ludo_roll", {
        p_session_id: session.id,
      });
      if (rpcErr) setError(rpcErr.message);
    } catch (e) {
      setError((e as Error).message ?? "Could not roll.");
    }
  }, [session]);

  const move = useCallback(
    async (token: number) => {
      if (!session || !isSupabaseConfigured) return;
      setError(null);
      try {
        const supabase = getSupabaseClient();
        const { error: rpcErr } = await supabase.rpc("ludo_move", {
          p_session_id: session.id,
          p_token: token,
        });
        if (rpcErr) setError(rpcErr.message);
      } catch (e) {
        setError((e as Error).message ?? "Could not move.");
      }
    },
    [session]
  );

  const pass = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("ludo_pass", {
        p_session_id: session.id,
      });
      if (rpcErr) setError(rpcErr.message);
    } catch (e) {
      setError((e as Error).message ?? "Could not pass.");
    }
  }, [session]);

  const rematch = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("ludo_rematch", {
        p_session_id: session.id,
      });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setError((e as Error).message ?? "Could not restart.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  return { session, uid, ready, busy, error, join, start, roll, move, pass, rematch };
}
