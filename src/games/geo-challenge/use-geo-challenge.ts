"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/api/session";

export type GeoRound = {
  /** Curated location id (see data/locations.ts). */
  imageId: string;
  /** Mapillary street-view image id, resolved at game start. */
  mapillaryId: string;
  /** Friendly label — revealed only after a guess. */
  name: string;
  country: string;
  /** Actual coordinates of the street-view image = the correct answer. */
  lat: number;
  lng: number;
};

/** {lat, lng} if the player guessed, {} if they ran out of time */
export type GeoGuess = { lat: number; lng: number } | Record<string, never>;

export type GeoPhase = "waiting" | "guessing" | "revealing" | "finished";

export type GeoState = {
  players: string[];
  rounds: GeoRound[];
  currentRound: number;
  phase: GeoPhase;
  roundGuesses: Record<string, GeoGuess>;
  roundScores: Record<string, number>;
  scores: Record<string, number>;
  roundDuration: number;
  roundStartedAt: string | null;
};

export type GeoSessionRow = {
  id: string;
  room_key: string;
  state: GeoState;
  status: string;
};

export function useGeoChallenge(roomKey: string, handle: string) {
  const [session, setSession] = useState<GeoSessionRow | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(() => !isSupabaseConfigured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !roomKey) return;

    let active = true;
    const supabase = getSupabaseClient();

    (async () => {
      const id = await ensureAnonymousSession();
      if (!active) return;
      setUid(id);

      const { data: existing } = await supabase
        .from("geo_challenge_session")
        .select("*")
        .eq("room_key", roomKey)
        .maybeSingle();

      if (!active) return;
      if (existing) setSession(existing as GeoSessionRow);
      setReady(true);
    })();

    const channel = supabase
      .channel(`geo:${roomKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "geo_challenge_session",
          filter: `room_key=eq.${roomKey}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          setSession(payload.new as GeoSessionRow);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      active = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);

  const rpc = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      if (!isSupabaseConfigured) return null;
      setBusy(true);
      setError(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error: err } = await supabase.rpc(fn, args);
        if (err) throw err;
        if (data && typeof data === "object") {
          setSession(data as GeoSessionRow);
        }
        return data as GeoSessionRow | null;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const join = useCallback(
    () => rpc("geo_challenge_join", { p_room_key: roomKey, p_handle: handle }),
    [rpc, roomKey, handle]
  );

  const start = useCallback(
    async (rounds: GeoRound[], duration = 60) => {
      // Prefer the duration-aware (3-arg) signature; if migration 0022 hasn't
      // been applied the server 404s (PGRST202), so fall back to the original
      // 2-arg signature. The game still starts (default 60s); duration takes
      // effect automatically once 0022 lands.
      const r = await rpc("geo_challenge_start", {
        p_room_key: roomKey,
        p_rounds: rounds,
        p_duration: duration,
      });
      if (r) return r;
      return rpc("geo_challenge_start", {
        p_room_key: roomKey,
        p_rounds: rounds,
      });
    },
    [rpc, roomKey]
  );

  const submitGuess = useCallback(
    (lat: number, lng: number) =>
      rpc("geo_challenge_guess", {
        p_room_key: roomKey,
        p_handle: handle,
        p_lat: lat,
        p_lng: lng,
      }),
    [rpc, roomKey, handle]
  );

  const reveal = useCallback(
    () => rpc("geo_challenge_reveal", { p_room_key: roomKey }),
    [rpc, roomKey]
  );

  const nextRound = useCallback(
    () => rpc("geo_challenge_next_round", { p_room_key: roomKey }),
    [rpc, roomKey]
  );

  const rematch = useCallback(
    async (rounds: GeoRound[], duration = 60) => {
      const r = await rpc("geo_challenge_rematch", {
        p_room_key: roomKey,
        p_rounds: rounds,
        p_duration: duration,
      });
      if (r) return r;
      return rpc("geo_challenge_rematch", {
        p_room_key: roomKey,
        p_rounds: rounds,
      });
    },
    [rpc, roomKey]
  );

  const state = session?.state;

  return {
    session,
    uid,
    ready,
    busy,
    error,
    state,
    phase: state?.phase ?? "waiting",
    currentRound: state?.currentRound ?? 0,
    round: state ? state.rounds[state.currentRound] : undefined,
    totalRounds: state?.rounds?.length ?? 0,
    players: state?.players ?? [],
    scores: state?.scores ?? {},
    roundScores: state?.roundScores ?? {},
    roundGuesses: state?.roundGuesses ?? {},
    roundDuration: state?.roundDuration ?? 60,
    roundStartedAt: state?.roundStartedAt ?? null,
    join,
    start,
    submitGuess,
    reveal,
    nextRound,
    rematch,
  };
}
