"use client";

import { useEffect, useState } from "react";
import { Globe2, Play, Users, Crown, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { LobbyProps } from "@/games/types";
import { useGeoChallenge } from "./use-geo-challenge";
import { buildGeoRounds, type GeoRegion } from "./data/locations";

const REGIONS: { value: GeoRegion; label: string }[] = [
  { value: "World", label: "🌍 World" },
  { value: "Europe", label: "🇪🇺 Europe" },
  { value: "Asia", label: "🌏 Asia" },
  { value: "Americas", label: "🌎 Americas" },
];
const ROUND_OPTIONS = [3, 5, 7];
const DURATION_OPTIONS = [30, 60, 90];

/** Compact segmented control. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            value === o.value
              ? "border-teal-500/50 bg-teal-500/15 text-teal-200"
              : "border-border bg-elevated text-muted hover:border-border-strong hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GeoChallengeLobby({
  roomKey,
  handle,
  isHost,
  onGameStarted,
}: LobbyProps) {
  const { session, uid, ready, busy, join, start } = useGeoChallenge(
    roomKey,
    handle
  );
  const [starting, setStarting] = useState(false);
  const [region, setRegion] = useState<GeoRegion>("World");
  const [roundCount, setRoundCount] = useState(5);
  const [duration, setDuration] = useState(60);

  useEffect(() => {
    if (ready) void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const players = session?.state?.players ?? [];
  const amHost =
    (!!uid && session?.state?.players?.[0] !== undefined) &&
    (isHost || (session?.state && players[0] === handle));
  const showControls = isHost || amHost;
  const canStart = showControls && players.length >= 2 && !starting && !busy;

  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const built = await buildGeoRounds(roundCount, region);
      if (built.length < roundCount) {
        setStartError(
          "Couldn't load enough street-view spots for that region — try World or fewer rounds."
        );
        return;
      }
      const ok = await start(built, duration);
      if (ok) onGameStarted();
    } finally {
      setStarting(false);
    }
  };

  const isStarting = starting || busy;

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      {/* Teal ambient wash */}
      <div className="pointer-events-none absolute -left-16 -top-16 size-40 rounded-full bg-teal-500/10 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl border border-teal-500/25 bg-teal-500/10">
          <Globe2 className="size-5 text-teal-400" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">
            Geo Challenge
          </h2>
          <p className="terminal-badge text-subtle">
            {players.length === 0
              ? "Connecting…"
              : players.length === 1
                ? "Waiting for players…"
                : `${players.length} players ready`}
          </p>
        </div>
      </div>

      {/* Rules */}
      <div className="relative mt-4 grid grid-cols-3 gap-3 text-center text-xs text-muted">
        <div className="rounded-xl border border-border bg-elevated p-2">
          <span className="block text-lg">🗺️</span>
          {roundCount} rounds
        </div>
        <div className="rounded-xl border border-border bg-elevated p-2">
          <span className="block text-lg">⏱</span>
          {duration} s each
        </div>
        <div className="rounded-xl border border-border bg-elevated p-2">
          <span className="block text-lg">
            {REGIONS.find((r) => r.value === region)?.label.split(" ")[0] ?? "🌍"}
          </span>
          {region}
        </div>
      </div>

      {/* Host setup */}
      {showControls && (
        <div className="relative mt-4 space-y-3 rounded-xl border border-border bg-elevated/50 p-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
              Region
            </p>
            <Segmented
              options={REGIONS}
              value={region}
              onChange={setRegion}
              disabled={isStarting}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                Rounds
              </p>
              <Segmented
                options={ROUND_OPTIONS.map((n) => ({ value: n, label: `${n}` }))}
                value={roundCount}
                onChange={setRoundCount}
                disabled={isStarting}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                Timer
              </p>
              <Segmented
                options={DURATION_OPTIONS.map((n) => ({ value: n, label: `${n}s` }))}
                value={duration}
                onChange={setDuration}
                disabled={isStarting}
              />
            </div>
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="relative mt-4 space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
          <Users className="size-3.5" />
          Players
        </p>
        <ul className="mt-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {players.map((p, i) => (
              <motion.li
                key={p}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2"
              >
                <UserAvatar name={p} className="size-6" />
                <span className="flex-1 truncate text-sm">{p}</span>
                {i === 0 && (
                  <Crown className="size-3.5 text-yellow-400" />
                )}
                {p === handle && (
                  <span className="terminal-badge text-teal-400">you</span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      {/* Actions */}
      <div className="relative mt-5">
        {isHost || amHost ? (
          <Button
            className="w-full"
            disabled={!canStart}
            onClick={handleStart}
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Preparing rounds…
              </>
            ) : (
              <>
                <Play className="mr-2 size-4" />
                {players.length < 2 ? "Need at least 2 players" : "Start Game"}
              </>
            )}
          </Button>
        ) : (
          <p className="text-center text-sm text-muted">
            Waiting for the host to start the game…
          </p>
        )}
        {startError && (
          <p className="mt-2 text-center text-sm text-red-400">{startError}</p>
        )}
      </div>
    </div>
  );
}
