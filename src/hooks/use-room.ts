"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { timeLabel, type ChatMessage } from "@/lib/data";

const TYPING_CLEAR_MS = 2500;
const TYPING_THROTTLE_MS = 1200;
const MAX_MESSAGES = 60;
const MAX_ACTIVITY = 30;

export type ActivityEvent = {
  id: string;
  text: string;
};

export type RoomState = {
  messages: ChatMessage[];
  /** Handles currently tracked in Presence for this room. */
  presentHandles: string[];
  onlineCount: number;
  typingUser: string | null;
  connected: boolean;
  activity: ActivityEvent[];
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
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const pushActivity = (events: Omit<ActivityEvent, "id">[]) => {
    if (!events.length) return;
    setActivity((prev) =>
      [
        ...prev,
        ...events.map((e, i) => ({
          ...e,
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        })),
      ].slice(-MAX_ACTIVITY)
    );
  };

  const channelRef = useRef<RealtimeChannel | null>(null);
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const lastTypingSent = useRef(0);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !roomId) return;

    const supabase = getSupabaseClient();

    function connect() {
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
        .on("presence", { event: "join" }, ({ newPresences }) => {
          const joiners = (newPresences as Array<{ user?: string }>)
            .map((p) => p.user)
            .filter((u): u is string => Boolean(u) && u !== handleRef.current);
          pushActivity(joiners.map((u) => ({ text: `${u} joined` })));
        })
        .on("presence", { event: "leave" }, ({ leftPresences }) => {
          const leavers = (leftPresences as Array<{ user?: string }>)
            .map((p) => p.user)
            .filter((u): u is string => Boolean(u) && u !== handleRef.current);
          pushActivity(leavers.map((u) => ({ text: `${u} left` })));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            reconnectAttempt.current = 0;
            setConnected(true);
            pushActivity([{ text: `You joined as ${handleRef.current}` }]);
            await channel.track({
              user: handleRef.current,
              online_at: new Date().toISOString(),
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnected(false);
            channelRef.current = null;
            supabase.removeChannel(channel);
            const delay = Math.min(1_000 * 2 ** reconnectAttempt.current, 30_000);
            reconnectAttempt.current += 1;
            reconnectTimer.current = setTimeout(connect, delay);
          } else {
            setConnected(false);
          }
        });
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      clearTimeout(typingClearTimer.current);
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) supabase.removeChannel(ch);
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
    const channel = channelRef.current;
    // Without a live channel the broadcast is a no-op — don't show a bubble
    // the peers will never receive. The composer is disabled while offline.
    if (!clean || !channel) return;
    const msg: ChatMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: handleRef.current,
      text: clean,
      time: timeLabel(),
    };
    setMessages((prev) => [...prev, { ...msg, self: true }].slice(-MAX_MESSAGES));
    channel.send({
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
    activity,
    sendMessage,
    notifyTyping,
  };
}
