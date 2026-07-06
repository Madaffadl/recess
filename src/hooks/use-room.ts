"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { timeLabel, type ChatMessage } from "@/lib/data";

const TYPING_CLEAR_MS = 2500;
const TYPING_THROTTLE_MS = 1200;
const MAX_MESSAGES = 60;

export type RoomState = {
  messages: ChatMessage[];
  /** Handles currently tracked in Presence for this room. */
  presentHandles: string[];
  onlineCount: number;
  typingUser: string | null;
  connected: boolean;
  sendMessage: (text: string) => void;
  notifyTyping: () => void;
};

/**
 * Per-room realtime over Supabase Realtime.
 *
 * Each room gets an isolated channel `room:{roomId}`:
 * - Presence  → live participant list + online count
 * - Broadcast → ephemeral chat + typing (nothing written to DB)
 *
 * Mirrors the lounge pattern but scoped to a specific room so presence
 * counts are per-room rather than global.
 */
export function useRoom({
  roomId,
  handle,
  seed = [],
}: {
  roomId: string;
  handle: string;
  seed?: ChatMessage[];
}): RoomState {
  const [messages, setMessages] = useState<ChatMessage[]>(seed);
  const [presentHandles, setPresentHandles] = useState<string[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const lastTypingSent = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !roomId) return;

    const supabase = getSupabaseClient();
    // Unique key per tab so multiple open tabs each register as a distinct peer.
    const presenceKey =
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false }, // own messages added optimistically
        presence: { key: presenceKey },
      },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setMessages((prev) =>
          [...prev, { ...msg, self: false }].slice(-MAX_MESSAGES)
        );
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { user?: string }).user;
        if (!who || who === handleRef.current) return;
        setTypingUser(who);
        clearTimeout(typingClearTimer.current);
        typingClearTimer.current = setTimeout(
          () => setTypingUser(null),
          TYPING_CLEAR_MS
        );
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user: string }>();
        const handles = Object.values(state)
          .flat()
          .map((p) => p.user)
          .filter((h): h is string => Boolean(h));
        setPresentHandles([...new Set(handles)]);
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track({
            user: handleRef.current,
            online_at: new Date().toISOString(),
          });
        } else {
          setConnected(false);
        }
      });

    return () => {
      clearTimeout(typingClearTimer.current);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Re-announce when handle changes (shuffle).
  useEffect(() => {
    if (connected) {
      channelRef.current?.track({
        user: handle,
        online_at: new Date().toISOString(),
      });
    }
  }, [handle, connected]);

  const sendMessage = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const msg: ChatMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: handleRef.current,
      text: clean,
      time: timeLabel(),
    };
    setMessages((prev) => [...prev, { ...msg, self: true }].slice(-MAX_MESSAGES));
    channelRef.current?.send({
      type: "broadcast",
      event: "message",
      payload: msg,
    });
  }, []);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_THROTTLE_MS) return;
    lastTypingSent.current = now;
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user: handleRef.current },
    });
  }, []);

  return {
    messages,
    presentHandles,
    onlineCount,
    typingUser,
    connected,
    sendMessage,
    notifyTyping,
  };
}
