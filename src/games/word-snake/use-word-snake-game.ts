"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";
import { WORD_SNAKE_ID, type WordSnakeSessionRow } from "./logic";

export type WordSnakeGameState = {
  session: WordSnakeSessionRow | null;
  uid: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  join: () => Promise<void>;
  start: (targetScore?: number | null, language?: "en" | "id", turnSeconds?: number) => Promise<void>;
  submit: (word: string) => Promise<void>;
  triggerTimeout: () => Promise<void>;
  rematch: () => Promise<void>;
};

export function useWordSnakeGame({
  roomKey,
  handle,
}: {
  roomKey: string;
  handle: string;
}): WordSnakeGameState {
  const [session, setSession] = useState<WordSnakeSessionRow | null>(null);
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

      // Fetch the most recent waiting or active session for this room
      const { data } = await supabase
        .from("game_session")
        .select("*")
        .eq("room_key", roomKey)
        .eq("game_id", WORD_SNAKE_ID)
        .in("status", ["waiting", "active", "finished"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (data) setSession(data as WordSnakeSessionRow);
      setReady(true);

      // Subscribe to all changes on game_session for this room
      const ch = supabase
        .channel(`ws:${roomKey}:${WORD_SNAKE_ID}`)
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
            const row = payload.new as WordSnakeSessionRow;
            if (row.game_id !== WORD_SNAKE_ID) return;
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
      setError("Supabase not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionId, error: rpcErr } = await supabase.rpc(
        "word_snake_join",
        { p_room_key: roomKey, p_handle: handleRef.current }
      );
      if (rpcErr) throw rpcErr;
      // Immediately fetch the row so the UI doesn't wait for realtime
      const { data } = await supabase
        .from("game_session")
        .select("*")
        .eq("id", sessionId as string)
        .single();
      if (data) setSession(data as WordSnakeSessionRow);
    } catch (e) {
      setError((e as Error).message ?? "Failed to join.");
    } finally {
      setBusy(false);
    }
  }, [roomKey]);

  const start = useCallback(async (targetScore?: number | null, language?: "en" | "id", turnSeconds?: number) => {
    if (!session || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("word_snake_start", {
        p_session_id:    session.id,
        p_target_score:  targetScore ?? null,
        p_language:      language ?? "en",
        p_turn_seconds:  Math.min(20, Math.max(10, turnSeconds ?? 10)),
      });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setError((e as Error).message ?? "Failed to start.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  const submit = useCallback(
    async (word: string) => {
      if (!session || !isSupabaseConfigured) return;
      setBusy(true);
      setError(null);
      try {
        const supabase = getSupabaseClient();
        const { error: rpcErr } = await supabase.rpc("word_snake_submit", {
          p_session_id: session.id,
          p_word: word,
        });
        if (rpcErr) throw rpcErr;
      } catch (e) {
        setError((e as Error).message ?? "Failed to submit.");
      } finally {
        setBusy(false);
      }
    },
    [session]
  );

  const triggerTimeout = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    try {
      const supabase = getSupabaseClient();
      await supabase.rpc("word_snake_timeout", { p_session_id: session.id });
    } catch {
      // Timeout errors are silent — the turn may have already advanced
    }
  }, [session]);

  const rematch = useCallback(async () => {
    if (!session || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: rpcErr } = await supabase.rpc("word_snake_rematch", {
        p_session_id: session.id,
      });
      if (rpcErr) throw rpcErr;
    } catch (e) {
      setError((e as Error).message ?? "Failed to rematch.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  return { session, uid, ready, busy, error, join, start, submit, triggerTimeout, rematch };
}
