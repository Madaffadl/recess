"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";
import { syncRoomCount } from "@/lib/api/rooms";
import { timeLabel, type ChatMessage } from "@/lib/data";

const TYPING_CLEAR_MS = 2500;
const TYPING_THROTTLE_MS = 1200;
const MAX_MESSAGES = 60;
const MAX_ACTIVITY = 30;
const RECONCILE_DEBOUNCE_MS = 1500;

export type ActivityEvent = {
  id: string;
  text: string;
};

/** One live connection in the room (a presence entry). */
export type PresencePeer = {
  /** Unique per browser tab — the safe target for a kick. */
  key: string;
  handle: string;
  /** Stable auth id, when known — used to mark the host. */
  uid?: string;
};

/** Why the local user was removed from the room, if at all. */
export type RemovalReason = "kicked" | "closed" | null;

export type RoomState = {
  messages: ChatMessage[];
  /** Handles currently tracked in Presence for this room (deduped). */
  presentHandles: string[];
  /** One entry per live connection, with its presence key + uid. */
  presentPeers: PresencePeer[];
  onlineCount: number;
  typingUser: string | null;
  connected: boolean;
  activity: ActivityEvent[];
  /** This tab's presence key, once subscribed. */
  selfKey: string | null;
  /** This browser's stable auth id, once resolved. */
  selfUid: string | null;
  /** Set when the host kicked this user or closed the room. */
  removed: RemovalReason;
  sendMessage: (text: string) => void;
  notifyTyping: () => void;
  /** Host action: remove a specific connection by its presence key. */
  kick: (key: string) => void;
  /** Host action: tell every present client the room is closing. */
  closeForAll: () => void;
};

/**
 * Per-room realtime over Supabase Realtime.
 *
 * Each room gets an isolated channel `room:{roomId}`:
 * - Presence  → live participant list + online count
 * - Broadcast → ephemeral chat + typing + host moderation (kick / close)
 *
 * Occupancy is self-healing: the room's "leader" (lowest presence key) pushes
 * the true presence count back to the DB, correcting any drift left behind by
 * clients that disconnected without leaving cleanly.
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
  const [presentPeers, setPresentPeers] = useState<PresencePeer[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [selfKey, setSelfKey] = useState<string | null>(null);
  const [selfUid, setSelfUid] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RemovalReason>(null);

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
  const presenceKeyRef = useRef<string | null>(null);
  const uidRef = useRef<string | null>(null);
  const typingClearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const lastTypingSent = useRef(0);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Resolve the stable anonymous auth id once — used to identify the host.
  useEffect(() => {
    let active = true;
    ensureAnonymousSession().then((id) => {
      if (!active) return;
      uidRef.current = id;
      setSelfUid(id);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !roomId) return;

    const supabase = getSupabaseClient();

    // Only the leader (lowest presence key) reconciles, so N clients don't all
    // write the same value. Debounced to collapse join/leave bursts.
    const scheduleReconcile = (count: number) => {
      clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => {
        void syncRoomCount(roomId, count);
      }, RECONCILE_DEBOUNCE_MS);
    };

    function connect() {
      // Unique key per tab so multiple open tabs each register as a distinct peer.
      const presenceKey =
        globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
      presenceKeyRef.current = presenceKey;
      setSelfKey(presenceKey);
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
        .on("broadcast", { event: "kick" }, ({ payload }) => {
          // Advisory: the targeted tab removes itself.
          if ((payload as { key?: string }).key === presenceKeyRef.current) {
            setRemoved("kicked");
          }
        })
        .on("broadcast", { event: "room_closed" }, () => {
          setRemoved("closed");
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ user?: string; uid?: string }>();
          const entries = Object.entries(state);
          const peers: PresencePeer[] = entries.map(([key, arr]) => {
            const p = arr[0] as { user?: string; uid?: string } | undefined;
            return { key, handle: p?.user ?? "anon", uid: p?.uid };
          });
          setPresentPeers(peers);
          setPresentHandles([...new Set(peers.map((p) => p.handle))]);
          setOnlineCount(Math.max(1, entries.length));

          // Leader election: the lowest key heals the DB occupancy count.
          const leader = entries.map(([k]) => k).sort()[0];
          if (leader && leader === presenceKeyRef.current) {
            scheduleReconcile(entries.length);
          }
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
              uid: uidRef.current,
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
      clearTimeout(reconcileTimer.current);
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) supabase.removeChannel(ch);
    };
  }, [roomId]);

  // Re-announce when handle or uid changes (shuffle / late auth resolution).
  useEffect(() => {
    if (connected) {
      channelRef.current?.track({
        user: handle,
        uid: selfUid,
        online_at: new Date().toISOString(),
      });
    }
  }, [handle, selfUid, connected]);

  // Kicked, or the room closed: leave the channel immediately so we stop
  // occupying a slot / appearing in presence, while the page shows the notice.
  // (`connected` is intentionally left as-is — the page short-circuits on
  // `removed`, so it's never read again.)
  useEffect(() => {
    if (!removed || !isSupabaseConfigured) return;
    const ch = channelRef.current;
    channelRef.current = null;
    if (ch) getSupabaseClient().removeChannel(ch);
  }, [removed]);

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

  const kick = useCallback((key: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "kick",
      payload: { key },
    });
  }, []);

  const closeForAll = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "room_closed",
      payload: {},
    });
  }, []);

  return {
    messages,
    presentHandles,
    presentPeers,
    onlineCount,
    typingUser,
    connected,
    activity,
    selfKey,
    selfUid,
    removed,
    sendMessage,
    notifyTyping,
    kick,
    closeForAll,
  };
}
