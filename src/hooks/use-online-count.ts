"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

const PRESENCE_CHANNEL = "presence:online";

/**
 * Shared live "online" count for the whole app.
 *
 * Both the navbar badge and the Anonymous Lounge need the *same* number, but a
 * single Supabase client cannot open two channels on the same topic — the
 * second `.on(...)` throws "cannot add callbacks after subscribe()". So we keep
 * ONE module-level channel, ref-counted, and fan its count out to every
 * consumer. First mount subscribes + tracks; last unmount tears it down.
 */
let channel: RealtimeChannel | null = null;
let refCount = 0;
let currentCount = 1;
const listeners = new Set<(count: number) => void>();

// Per-tab presence key so multiple tabs of one browser each count as a peer.
const presenceKey =
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

function emit() {
  for (const listener of listeners) listener(currentCount);
}

function acquire() {
  refCount += 1;
  if (channel || !isSupabaseConfigured) return;

  const supabase = getSupabaseClient();
  channel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: presenceKey } },
  });
  channel
    .on("presence", { event: "sync" }, () => {
      currentCount = Math.max(1, Object.keys(channel!.presenceState()).length);
      emit();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel!.track({ online_at: new Date().toISOString() });
      }
    });
}

function release() {
  refCount -= 1;
  if (refCount > 0 || !channel) return;
  getSupabaseClient().removeChannel(channel);
  channel = null;
  currentCount = 1;
}

/** Live count of everyone currently connected, shared across the app. */
export function useOnlineCount(): number {
  const [count, setCount] = useState(currentCount);

  useEffect(() => {
    acquire();
    listeners.add(setCount);
    setCount(currentCount);
    return () => {
      listeners.delete(setCount);
      release();
    };
  }, []);

  return count;
}
