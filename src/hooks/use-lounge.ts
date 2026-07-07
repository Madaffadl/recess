"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useOnlineCount } from "@/hooks/use-online-count";
import { timeLabel, type ChatMessage } from "@/lib/data";

const LOUNGE_CHANNEL = "lounge:global";
const TYPING_CLEAR_MS = 2500; // hide "X is typing" after this idle gap
const TYPING_THROTTLE_MS = 1200; // don't broadcast typing more often than this
const MAX_MESSAGES = 60; // keep the client buffer bounded

export type LoungeState = {
  messages: ChatMessage[];
  onlineCount: number;
  typingUser: string | null;
  connected: boolean;
  sendMessage: (text: string) => void;
  notifyTyping: () => void;
};

/**
 * Realtime Anonymous Lounge over Supabase Realtime.
 *
 * - Broadcast → ephemeral chat + typing (no DB writes; nothing persisted)
 *
 * The live online count comes from the shared {@link useOnlineCount} presence
 * channel so the lounge and the navbar badge always show the same number.
 *
 * Chat is intentionally ephemeral (Broadcast), matching the roadmap: cheaper,
 * lower latency, and far less moderation/storage liability than persisting
 * every message.
 */
export function useLounge({
  handle,
  seed = [],
}: {
  handle: string;
  seed?: ChatMessage[];
}): LoungeState {
  const [messages, setMessages] = useState<ChatMessage[]>(seed);
  const onlineCount = useOnlineCount();
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
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabaseClient();

    function connect() {
      const channel = supabase.channel(LOUNGE_CHANNEL, {
        config: {
          broadcast: { self: false }, // we add our own messages optimistically
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
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            reconnectAttempt.current = 0;
            setConnected(true);
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
  }, []);

  const sendMessage = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const msg: ChatMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: handleRef.current,
      text: clean,
      time: timeLabel(),
    };
    // Optimistic: show our own message immediately on the right.
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

  return { messages, onlineCount, typingUser, connected, sendMessage, notifyTyping };
}
