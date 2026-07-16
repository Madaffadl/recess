"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";
import {
  rowToSession,
  DRAW_TOGETHER_ID,
  type DrawTogetherSession,
  type DrawTogetherSessionRow,
  type StrokeBatch,
} from "./logic";

export type DrawTogetherGameState = {
  session: DrawTogetherSession | null;
  wordOptions: string[] | null;
  /** The actual word to draw — only populated for the current drawer. */
  secretWord: string | null;
  uid: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;

  join: () => Promise<void>;
  /** Returns true only if the game actually started (host + valid state). */
  start: () => Promise<boolean>;
  selectWord: (word: string) => Promise<void>;
  submitGuess: (guess: string) => Promise<GuessResult | null>;
  endRound: () => Promise<void>;
  nextRound: () => Promise<void>;
  rematch: () => Promise<void>;
  /** Remove self from the roster (host reassign / drawer-leave handled server-side). */
  leave: () => Promise<void>;
  /** Advance the time-based letter reveal (no-op unless drawing). */
  revealHint: () => Promise<void>;

  // Drawing broadcast (drawer → others)
  sendStroke: (batch: StrokeBatch) => void;
  sendClear: () => void;

  // Received strokes (for viewers)
  incomingStrokes: StrokeBatch[];
  clearSignal: number;

  /** Shared guess feed — every player's guesses (correct guesses hide the word). */
  guessFeed: GuessFeedItem[];
};

export type GuessResult = { correct: boolean; points: number };
export type GuessFeedItem = {
  id: string;
  handle: string;
  text: string;
  correct: boolean;
};

export function useDrawTogetherGame({
  roomKey,
  handle,
}: {
  roomKey: string;
  handle: string;
}): DrawTogetherGameState {
  const [session, setSession] = useState<DrawTogetherSession | null>(null);
  const [wordOptions, setWordOptions] = useState<string[] | null>(null);
  const [secretWord, setSecretWord] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingStrokes, setIncomingStrokes] = useState<StrokeBatch[]>([]);
  const [clearSignal, setClearSignal] = useState(0);
  const [guessFeed, setGuessFeed] = useState<GuessFeedItem[]>([]);

  const sessionIdRef = useRef<string | null>(null);
  const uidRef = useRef<string | null>(null);
  const prevRoundRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const drawChannelRef = useRef<RealtimeChannel | null>(null);
  const handleRef = useRef(handle);
  useEffect(() => { handleRef.current = handle; }, [handle]);

  // ── Auth + initial fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) { setReady(true); return; }

    let cancelled = false;
    const supabase = getSupabaseClient();

    async function init() {
      const authUid = await ensureAnonymousSession();
      if (cancelled) return;
      uidRef.current = authUid;
      setUid(authUid);

      const { data } = await supabase
        .from("draw_together_session")
        .select("*")
        .eq("room_key", roomKey)
        .maybeSingle();

      if (cancelled) return;
      if (data) {
        const s = rowToSession(data as DrawTogetherSessionRow);
        setSession(s);
        sessionIdRef.current = s.id;
        prevRoundRef.current = s.currentRound;
        subscribeToSession(s.id);
        subscribeToDrawing(s.id);
        applyDrawerFetches(s);
      }
      setReady(true);
    }

    void init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);

  function subscribeToSession(sessionId: string) {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const ch = supabase
      .channel(`dt_session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "draw_together_session",
          filter: `id=eq.${sessionId}`,
        },
        ({ new: row }) => {
          if (!row || !("id" in row)) return;
          const s = rowToSession(row as DrawTogetherSessionRow);
          setSession(s);
          // A new round → wipe the canvas + guess feed for everyone (each client
          // detects the round-number change independently; no broadcast needed).
          if (s.currentRound !== prevRoundRef.current) {
            prevRoundRef.current = s.currentRound;
            setIncomingStrokes([]);
            setClearSignal((n) => n + 1);
            setGuessFeed([]);
          }
          applyDrawerFetches(s);
        },
      )
      .subscribe();
    channelRef.current = ch;
  }

  // Fetch the data only the current drawer is allowed to see, based on phase.
  function applyDrawerFetches(s: DrawTogetherSession) {
    const amDrawer = s.currentDrawerId === uidRef.current;
    if (s.status === "word_selection" && amDrawer) {
      void fetchWordOptions(s.id);
    } else {
      setWordOptions(null);
    }
    if ((s.status === "drawing" || s.status === "round_end") && amDrawer) {
      void fetchSecretWord(s.id, s.currentRound);
    } else if (s.status === "waiting") {
      setSecretWord(null);
    }
  }

  // The drawer can read their own round's secret word directly — RLS policy
  // `dt_secret_drawer` permits `drawer_id = auth.uid()`. Guessers cannot.
  async function fetchSecretWord(sessionId: string, roundNum: number) {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("draw_together_round_secret")
      .select("word")
      .eq("session_id", sessionId)
      .eq("round_num", roundNum)
      .maybeSingle();
    if (data) setSecretWord((data as { word: string }).word);
  }

  function subscribeToDrawing(sessionId: string) {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const ch = supabase
      .channel(`dt_draw:${sessionId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "stroke" }, ({ payload }) => {
        setIncomingStrokes((prev) => [...prev, payload as StrokeBatch]);
      })
      .on("broadcast", { event: "canvas_clear" }, () => {
        setIncomingStrokes([]);
        setClearSignal((n) => n + 1);
      })
      .on("broadcast", { event: "guess" }, ({ payload }) => {
        const item = payload as GuessFeedItem;
        setGuessFeed((prev) =>
          prev.some((g) => g.id === item.id) ? prev : [...prev, item].slice(-50),
        );
      })
      .subscribe();
    drawChannelRef.current = ch;
  }

  async function fetchWordOptions(sessionId: string) {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const { data } = await supabase.rpc("draw_together_get_word_options", {
      p_session_id: sessionId,
    });
    if (data) setWordOptions(data as string[]);
  }

  const rpc = useCallback(
    async <T>(fn: string, args: Record<string, unknown>): Promise<T | null> => {
      if (!isSupabaseConfigured) return null;
      const supabase = getSupabaseClient();
      setBusy(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(fn, args);
        if (rpcError) { setError(rpcError.message); return null; }
        return data as T;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const join = useCallback(async () => {
    const sid = await rpc<string>("draw_together_join", {
      p_room_key: roomKey,
      p_handle: handleRef.current,
    });
    if (!sid) return;
    sessionIdRef.current = sid;
    if (!channelRef.current) subscribeToSession(sid);
    if (!drawChannelRef.current) subscribeToDrawing(sid);
    // Re-fetch session after joining
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("draw_together_session")
      .select("*")
      .eq("id", sid)
      .single();
    if (data) {
      const s = rowToSession(data as DrawTogetherSessionRow);
      setSession(s);
      prevRoundRef.current = s.currentRound;
      applyDrawerFetches(s);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, rpc]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!sessionIdRef.current || !isSupabaseConfigured) return false;
    const supabase = getSupabaseClient();
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.rpc("draw_together_start", {
        p_session_id: sessionIdRef.current,
      });
      if (e) { setError(e.message); return false; }
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const selectWord = useCallback(
    async (word: string) => {
      if (!sessionIdRef.current) return;
      await rpc("draw_together_select_word", {
        p_session_id: sessionIdRef.current,
        p_word: word,
      });
      setWordOptions(null);
    },
    [rpc],
  );

  const submitGuess = useCallback(
    async (guess: string): Promise<GuessResult | null> => {
      if (!sessionIdRef.current) return null;
      const result = await rpc<GuessResult>("draw_together_guess", {
        p_session_id: sessionIdRef.current,
        p_guess: guess,
      });
      if (!result) return null;

      // Share the guess with the room. Correct guesses hide the text so the
      // word is never leaked through the feed to players still guessing.
      const item: GuessFeedItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        handle: handleRef.current,
        text: result.correct ? "" : guess.trim(),
        correct: result.correct,
      };
      setGuessFeed((prev) => [...prev, item].slice(-50));
      drawChannelRef.current?.send({
        type: "broadcast",
        event: "guess",
        payload: item,
      });
      return result;
    },
    [rpc],
  );

  const endRound = useCallback(async () => {
    if (!sessionIdRef.current) return;
    await rpc("draw_together_end_round", { p_session_id: sessionIdRef.current });
  }, [rpc]);

  const nextRound = useCallback(async () => {
    if (!sessionIdRef.current) return;
    await rpc("draw_together_next_round", { p_session_id: sessionIdRef.current });
  }, [rpc]);

  const rematch = useCallback(async () => {
    if (!sessionIdRef.current) return;
    await rpc("draw_together_rematch", { p_session_id: sessionIdRef.current });
  }, [rpc]);

  const leave = useCallback(async () => {
    if (!sessionIdRef.current || !isSupabaseConfigured) return;
    // Fire-and-forget; the caller is usually navigating away.
    await getSupabaseClient().rpc("draw_together_leave", {
      p_session_id: sessionIdRef.current,
    });
  }, []);

  const revealHint = useCallback(async () => {
    if (!sessionIdRef.current || !isSupabaseConfigured) return;
    await getSupabaseClient().rpc("draw_together_reveal_hint", {
      p_session_id: sessionIdRef.current,
    });
  }, []);

  const sendStroke = useCallback((batch: StrokeBatch) => {
    drawChannelRef.current?.send({
      type: "broadcast",
      event: "stroke",
      payload: batch,
    });
  }, []);

  const sendClear = useCallback(() => {
    setIncomingStrokes([]);
    setClearSignal((n) => n + 1);
    drawChannelRef.current?.send({
      type: "broadcast",
      event: "canvas_clear",
      payload: {},
    });
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      const supabase = isSupabaseConfigured ? getSupabaseClient() : null;
      if (supabase) {
        if (channelRef.current) supabase.removeChannel(channelRef.current);
        if (drawChannelRef.current) supabase.removeChannel(drawChannelRef.current);
      }
    };
  }, []);

  return {
    session, wordOptions, secretWord, uid, ready, busy, error,
    join, start, selectWord, submitGuess, endRound, nextRound, rematch,
    leave, revealHint,
    sendStroke, sendClear,
    incomingStrokes, clearSignal, guessFeed,
  };
}

// Re-export DRAW_TOGETHER_ID for use in registry
export { DRAW_TOGETHER_ID };
