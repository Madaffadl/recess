"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Globe2,
  ArrowLeft,
  MapPin,
  Trophy,
  Clock,
  ChevronRight,
  RotateCcw,
  Lock,
  Crown,
  Target,
  Navigation,
  AlertTriangle,
  Eye,
  Check,
  Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { GameBoardProps } from "@/games/types";
import { useGeoChallenge, type GeoRound } from "./use-geo-challenge";
import { buildGeoRounds } from "./data/locations";

// Leaflet must be loaded client-side only (no SSR)
const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/20 text-sm text-muted">
      Loading map…
    </div>
  ),
});

// Mapillary viewer is WebGL — browser-only, no SSR.
const MapillaryViewer = dynamic(
  () => import("./mapillary-viewer").then((m) => m.MapillaryViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-black/80 text-sm text-white/60">
        Loading street view…
      </div>
    ),
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLAYER_COLORS = [
  "#ef4444","#3b82f6","#22c55e","#f59e0b",
  "#8b5cf6","#ec4899","#14b8a6","#f97316",
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function medal(rank: number) {
  return rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `${rank + 1}.`;
}

// ── Timer bar ────────────────────────────────────────────────────────────────

function TimerBar({
  roundStartedAt,
  roundDuration,
}: {
  roundStartedAt: string | null;
  roundDuration: number;
}) {
  const [pct, setPct] = useState(100);

  useEffect(() => {
    if (!roundStartedAt) { setPct(100); return; }
    const start = new Date(roundStartedAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setPct(Math.max(0, ((roundDuration - elapsed) / roundDuration) * 100));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [roundStartedAt, roundDuration]);

  const grad =
    pct > 50
      ? "linear-gradient(90deg,#0d9488,#2dd4bf)"
      : pct > 25
        ? "linear-gradient(90deg,#d97706,#fbbf24)"
        : "linear-gradient(90deg,#dc2626,#f87171)";
  const glow =
    pct > 50 ? "rgba(45,212,191,.5)" : pct > 25 ? "rgba(251,191,36,.5)" : "rgba(248,113,113,.6)";

  return (
    <div className="h-[3px] w-full overflow-hidden bg-white/[0.04]">
      <motion.div
        className="h-full"
        style={{ width: `${pct}%`, background: grad, boxShadow: `0 0 10px ${glow}` }}
        transition={{ duration: 0.25 }}
      />
    </div>
  );
}

// ── Shared premium bits ────────────────────────────────────────────────────────

/** Eased count-up for satisfying score/number reveals. */
function CountUp({
  value,
  className,
  suffix = "",
}: {
  value: number;
  className?: string;
  suffix?: string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 850;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={className}>
      {n.toLocaleString()}
      {suffix}
    </span>
  );
}

/** Round progress dots — filled/active/upcoming. */
function RoundPips({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`block h-1.5 rounded-full transition-all duration-300 ${
            i < current
              ? "w-1.5 bg-teal-400/70"
              : i === current
                ? "w-5 bg-teal-400"
                : "w-1.5 bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

/** Focal timer pill — tone shifts teal → amber → red as time runs out. */
function TimerPill({
  seconds,
  roundDuration,
}: {
  seconds: number;
  roundDuration: number;
}) {
  const frac = seconds / Math.max(1, roundDuration);
  const tone =
    frac > 0.5
      ? "bg-teal-500/15 ring-teal-500/30 text-teal-300"
      : frac > 0.25
        ? "bg-amber-500/15 ring-amber-500/30 text-amber-300"
        : "bg-red-500/15 ring-red-500/40 text-red-300";
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${tone} ${
        seconds <= 10 ? "animate-pulse" : ""
      }`}
    >
      <Clock className="size-3.5" />
      <span className="font-mono text-sm font-bold tabular-nums">{seconds}s</span>
    </div>
  );
}

// ── Seconds countdown ────────────────────────────────────────────────────────

function useSecondsLeft(
  roundStartedAt: string | null,
  roundDuration: number,
  onExpire: () => void
) {
  const [seconds, setSeconds] = useState(roundDuration);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    if (!roundStartedAt) { setSeconds(roundDuration); return; }
    const start = new Date(roundStartedAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, roundDuration - elapsed);
      setSeconds(Math.ceil(left));
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [roundStartedAt, roundDuration, onExpire]);

  return seconds;
}

// ── Guessing phase ───────────────────────────────────────────────────────────

function GuessingView({
  round,
  roundIdx,
  totalRounds,
  players,
  roundGuesses,
  handle,
  roundDuration,
  roundStartedAt,
  onLockIn,
  onReveal,
  hasGuessed,
}: {
  round: GeoRound;
  roundIdx: number;
  totalRounds: number;
  players: string[];
  roundGuesses: Record<string, unknown>;
  handle: string;
  roundDuration: number;
  roundStartedAt: string | null;
  onLockIn: (lat: number, lng: number) => void;
  onReveal: () => void;
  hasGuessed: boolean;
}) {
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number } | null>(null);

  // Reset pending pin when round changes
  useEffect(() => { setPendingPin(null); }, [roundIdx]);

  // Any client triggers the reveal on expiry — reveal() is idempotent (guarded
  // by phase + FOR UPDATE in SQL). Gating this on !hasGuessed used to hang the
  // round if every remaining player had already guessed but auto-reveal never
  // fired (e.g. an un-guessed player disconnected).
  const handleExpire = useCallback(() => {
    onReveal();
  }, [onReveal]);

  const seconds = useSecondsLeft(roundStartedAt, roundDuration, handleExpire);
  const guessedCount = Object.keys(roundGuesses).length;
  // Joined the room after the game started → can watch but not score.
  const isSpectator = players.length > 0 && !players.includes(handle);

  // "Round N" splash on each new round (GuessingView remounts per round).
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    setShowSplash(true);
    const t = setTimeout(() => setShowSplash(false), 1400);
    return () => clearTimeout(t);
  }, [roundIdx]);

  // Enter locks in the pending guess.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && pendingPin && !hasGuessed && !isSpectator) {
        onLockIn(pendingPin.lat, pendingPin.lng);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingPin, hasGuessed, isSpectator, onLockIn]);

  return (
    <div className="relative flex h-full flex-col">
      {/* HUD */}
      <div className="relative z-[600] flex items-center gap-3 border-b border-white/5 bg-background/70 px-3 py-2.5 backdrop-blur-md sm:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-teal-500/25 bg-teal-500/10">
          <Globe2 className="size-4 text-teal-400" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Geo Challenge</p>
          <div className="mt-1.5">
            <RoundPips current={roundIdx} total={totalRounds} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Who's locked in (desktop) */}
          <div className="hidden items-center -space-x-1.5 sm:flex">
            {players.map((p) => {
              const locked =
                !!roundGuesses[p] &&
                Object.keys(roundGuesses[p] as object).length > 0;
              return (
                <div key={p} className="relative" title={p}>
                  <UserAvatar
                    name={p}
                    className={`size-6 ring-2 ring-background transition ${
                      locked ? "" : "opacity-35 grayscale"
                    }`}
                  />
                  {locked && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-3 place-items-center rounded-full bg-teal-500 ring-1 ring-background">
                      <Check className="size-2 text-white" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Count (mobile) */}
          <div className="flex items-center gap-1 rounded-full border border-border bg-elevated/70 px-2 py-1 sm:hidden">
            <Lock className="size-3 text-muted" />
            <span className="text-xs tabular-nums text-muted">
              {guessedCount}/{players.length}
            </span>
          </div>
          <TimerPill seconds={seconds} roundDuration={roundDuration} />
        </div>
      </div>
      <TimerBar roundStartedAt={roundStartedAt} roundDuration={roundDuration} />

      {/* Round splash */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key={`splash-${roundIdx}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-[1500] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.85, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 1.05, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="rounded-2xl border border-white/10 bg-black/70 px-8 py-5 text-center shadow-2xl backdrop-blur-md"
            >
              <p className="terminal-badge text-teal-300/80">round</p>
              <p className="font-display text-4xl font-bold tabular-nums text-white">
                {roundIdx + 1}
                <span className="text-xl text-white/40"> / {totalRounds}</span>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Split: street view (left/top) + map (right/bottom) */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Interactive street view */}
        <div className="relative min-h-[200px] flex-1 overflow-hidden bg-black md:min-h-0">
          <MapillaryViewer imageId={round.mapillaryId} />

          {!hasGuessed && (
            <div className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 shadow-lg backdrop-blur-md">
              <Navigation className="size-3.5 text-teal-300" />
              <span className="text-xs font-medium text-white/90">
                Look around — where are you?
              </span>
            </div>
          )}
          {hasGuessed && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4"
            >
              <p className="terminal-badge text-teal-300/80">location</p>
              <p className="font-display text-lg font-semibold leading-tight text-white">
                {round.name}
              </p>
              <p className="text-sm text-white/70">{round.country}</p>
            </motion.div>
          )}
        </div>

        {/* Divider */}
        <div className="hairline md:hidden" />
        <div className="hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent md:block" />

        {/* Map */}
        <div className="relative min-h-[300px] flex-1 md:min-h-0">
          <MapView
            mode="guessing"
            pendingPin={pendingPin}
            onMapClick={(lat, lng) => {
              if (!hasGuessed && !isSpectator) setPendingPin({ lat, lng });
            }}
          />

          {/* Lock In overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[1000] flex justify-center px-4">
            {isSpectator ? (
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm font-medium text-white/80 shadow-xl backdrop-blur-md">
                <Eye className="size-4" />
                Spectating — you joined after the game started
              </div>
            ) : hasGuessed ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/15 px-4 py-2 text-sm font-semibold text-teal-200 shadow-xl backdrop-blur-md"
              >
                <Lock className="size-4" />
                Locked in — waiting for others…
              </motion.div>
            ) : (
              <Button
                size="lg"
                className="pointer-events-auto shadow-[0_10px_40px_-10px_rgba(245,158,11,0.7)]"
                disabled={!pendingPin}
                onClick={() => {
                  if (pendingPin) onLockIn(pendingPin.lat, pendingPin.lng);
                }}
              >
                <MapPin className="mr-1.5 size-4" />
                {pendingPin ? "Lock In Guess" : "Tap the map to drop your pin"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Revealing phase ──────────────────────────────────────────────────────────

function RevealingView({
  round,
  roundIdx,
  totalRounds,
  players,
  roundGuesses,
  roundScores,
  scores,
  handle,
  onNextRound,
  busy,
}: {
  round: GeoRound;
  roundIdx: number;
  totalRounds: number;
  players: string[];
  roundGuesses: Record<string, { lat?: number; lng?: number }>;
  roundScores: Record<string, number>;
  scores: Record<string, number>;
  handle: string;
  onNextRound: () => void;
  busy: boolean;
}) {
  const playerPins = players.map((p) => {
    const guess = roundGuesses[p];
    return {
      handle: p,
      lat: guess?.lat ?? 0,
      lng: guess?.lng ?? 0,
      score: roundScores[p] ?? 0,
    };
  });

  const sortedByRound = [...players].sort(
    (a, b) => (roundScores[b] ?? 0) - (roundScores[a] ?? 0)
  );

  const overall = [...players]
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    .slice(0, 3);

  // Auto-advance so an idle table never stalls on the reveal. Any client firing
  // nextRound() is safe (guarded by phase in SQL). onNextRound is an unstable
  // inline prop, so drive it through a ref to keep the countdown from resetting.
  const AUTO_ADVANCE = 12;
  const [autoLeft, setAutoLeft] = useState(AUTO_ADVANCE);
  const nextRef = useRef(onNextRound);
  nextRef.current = onNextRound;
  useEffect(() => {
    setAutoLeft(AUTO_ADVANCE);
    const started = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, AUTO_ADVANCE - Math.floor((Date.now() - started) / 1000));
      setAutoLeft(left);
      if (left <= 0) {
        clearInterval(id);
        nextRef.current();
      }
    }, 500);
    return () => clearInterval(id);
  }, [roundIdx]);

  const isLast = roundIdx + 1 >= totalRounds;

  return (
    <div className="flex h-full flex-col">
      {/* Header — the answer */}
      <div className="relative z-[600] flex items-center gap-3 border-b border-white/5 bg-background/70 px-3 py-2 backdrop-blur-md sm:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <Target className="size-4 text-amber-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="terminal-badge text-amber-400/80">the answer</p>
          <p className="truncate font-display text-sm font-semibold leading-tight">
            {round.name} <span className="text-muted">· {round.country}</span>
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={() => nextRef.current()}>
          {isLast ? "See Results" : "Next Round"}
          <span className="ml-1 font-mono text-xs opacity-70 tabular-nums">{autoLeft}s</span>
          <ChevronRight className="ml-0.5 size-4" />
        </Button>
      </div>

      {/* Map — full width */}
      <div className="relative min-h-0 flex-1">
        <MapView
          mode="revealing"
          correctLat={round.lat}
          correctLng={round.lng}
          playerPins={playerPins}
        />
      </div>

      {/* Round results */}
      <div className="relative z-[600] border-t border-white/5 bg-background/90 p-3 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="terminal-badge text-muted">round {roundIdx + 1} results</p>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Trophy className="size-3 shrink-0 text-amber-400/70" />
            <span className="truncate">
              {overall.map((p) => `${p} ${(scores[p] ?? 0).toLocaleString()}`).join("  ·  ")}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {sortedByRound.map((p, rank) => {
            const guess = roundGuesses[p];
            const hasGuess = guess && "lat" in guess;
            const distKm = hasGuess
              ? haversineKm(
                  (guess as { lat: number; lng: number }).lat,
                  (guess as { lat: number; lng: number }).lng,
                  round.lat,
                  round.lng
                )
              : null;
            const color = PLAYER_COLORS[players.indexOf(p) % PLAYER_COLORS.length];

            return (
              <motion.div
                key={p}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: rank * 0.09, type: "spring", stiffness: 280, damping: 24 }}
                className={`relative overflow-hidden rounded-xl border px-3 py-2.5 ${
                  p === handle
                    ? "border-teal-500/40 bg-teal-500/10"
                    : "border-border bg-elevated/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{medal(rank)}</span>
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-2 ring-white/20"
                    style={{ background: color }}
                  />
                  <span className="truncate text-xs font-semibold">
                    {p}
                    {p === handle && <span className="text-teal-400"> (you)</span>}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {hasGuess ? formatKm(distKm!) : "No guess"}
                  </span>
                  <span className="font-mono text-sm font-bold text-amber-300">
                    +<CountUp value={roundScores[p] ?? 0} />
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Finished phase ───────────────────────────────────────────────────────────

function FinishedView({
  players,
  scores,
  handle,
  onRematch,
  onExit,
  busy,
  error,
}: {
  players: string[];
  scores: Record<string, number>;
  handle: string;
  onRematch: () => void;
  onExit: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const ranked = [...players].sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)
  );
  const winner = ranked[0];
  const maxScore = Math.max(1, scores[winner] ?? 0);

  const [copied, setCopied] = useState(false);
  const myRank = ranked.indexOf(handle) + 1;
  const share = async () => {
    const lines = [
      "🌍 Geo Challenge · recess",
      ...ranked
        .slice(0, 3)
        .map((p, i) => `${medal(i)} ${p} — ${(scores[p] ?? 0).toLocaleString()}`),
    ];
    if (myRank > 3) {
      lines.push(`#${myRank}/${ranked.length} ${handle} — ${(scores[handle] ?? 0).toLocaleString()}`);
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-7 overflow-y-auto p-6">
      {/* Ambient background */}
      <div className="grid-faint pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute left-1/2 top-8 size-72 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl"
        style={{ animation: "geo-drift 9s ease-in-out infinite" }}
      />

      {/* Winner spotlight */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="relative text-center"
      >
        <div className="relative mx-auto grid size-20 place-items-center">
          <span className="absolute inset-0 rounded-full bg-amber-500/25 blur-xl" />
          <UserAvatar name={winner} className="size-20 ring-2 ring-amber-400/60" />
          <motion.div
            initial={{ y: -6, opacity: 0, rotate: -12 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
            className="absolute -top-3.5 left-1/2 -translate-x-1/2"
          >
            <Crown className="size-6 fill-amber-400/30 text-amber-400" />
          </motion.div>
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">
          {winner === handle ? "You won!" : `${winner} wins!`}
        </h2>
        <p className="mt-0.5 font-mono text-sm text-amber-300">
          <CountUp value={scores[winner] ?? 0} suffix=" pts" />
        </p>
      </motion.div>

      {/* Leaderboard — bars scale to score */}
      <div className="relative w-full max-w-sm space-y-2">
        {ranked.map((p, rank) => {
          const pct = ((scores[p] ?? 0) / maxScore) * 100;
          return (
            <motion.div
              key={p}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + rank * 0.1 }}
              className={`relative overflow-hidden rounded-2xl border ${
                rank === 0
                  ? "border-amber-500/40"
                  : p === handle
                    ? "border-teal-500/40"
                    : "border-border"
              }`}
            >
              {/* score fill */}
              <motion.div
                className={`absolute inset-y-0 left-0 ${
                  rank === 0
                    ? "bg-gradient-to-r from-amber-500/20 to-transparent"
                    : p === handle
                      ? "bg-gradient-to-r from-teal-500/15 to-transparent"
                      : "bg-white/[0.03]"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 0.3 + rank * 0.1, duration: 0.7, ease: "easeOut" }}
              />
              <div className="relative flex items-center gap-3 p-3">
                <span className="w-7 text-center text-lg">{medal(rank)}</span>
                <UserAvatar name={p} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p}
                    {p === handle && (
                      <span className="ml-1.5 terminal-badge text-teal-400">you</span>
                    )}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums">
                  <CountUp value={scores[p] ?? 0} />
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="relative flex flex-col items-center gap-2">
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="secondary" onClick={onExit}>
            <ArrowLeft className="mr-1.5 size-4" />
            Leave
          </Button>
          <Button variant="outline" onClick={share}>
            {copied ? (
              <>
                <Check className="mr-1.5 size-4 text-teal-400" />
                Copied!
              </>
            ) : (
              <>
                <Share2 className="mr-1.5 size-4" />
                Share
              </>
            )}
          </Button>
          <Button disabled={busy} onClick={onRematch}>
            <RotateCcw className={`mr-1.5 size-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Loading…" : "Play Again"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4">
      <div className="grid-faint pointer-events-none absolute inset-0" />
      <div className="relative grid size-14 place-items-center rounded-2xl border border-teal-500/25 bg-teal-500/10">
        <span className="absolute inset-0 rounded-2xl bg-teal-500/10 blur-xl" />
        <Globe2 className="size-6 animate-spin text-teal-400" style={{ animationDuration: "3s" }} />
      </div>
      <p className="relative terminal-badge text-muted">preparing your journey…</p>
    </div>
  );
}

// ── Main board ───────────────────────────────────────────────────────────────

export function GeoChallengeBoard({
  roomKey,
  handle,
  onExit,
}: GameBoardProps) {
  const {
    phase,
    currentRound,
    round,
    totalRounds,
    players,
    scores,
    roundScores,
    roundGuesses,
    roundDuration,
    roundStartedAt,
    busy,
    error,
    submitGuess,
    reveal,
    nextRound,
    rematch,
  } = useGeoChallenge(roomKey, handle);

  const hasGuessed = !!roundGuesses[handle] && Object.keys(roundGuesses[handle] as object).length > 0;
  const rounds = totalRounds || 5;

  const [rematchError, setRematchError] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);

  const handleRematch = async () => {
    setRematchError(null);
    setRematching(true);
    try {
      // Keep the same round count and timer as the game just played.
      const next = await buildGeoRounds(rounds);
      if (next.length < rounds) {
        setRematchError("Couldn't load enough street-view spots — try again.");
        return;
      }
      await rematch(next, roundDuration);
    } finally {
      setRematching(false);
    }
  };

  if (!round && phase !== "finished") return <LoadingView />;

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence mode="wait">
        {phase === "guessing" && round && (
          <motion.div
            key={`guess-${currentRound}`}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <GuessingView
              round={round}
              roundIdx={currentRound}
              totalRounds={rounds}
              players={players}
              roundGuesses={roundGuesses}
              handle={handle}
              roundDuration={roundDuration}
              roundStartedAt={roundStartedAt}
              onLockIn={(lat, lng) => void submitGuess(lat, lng)}
              onReveal={() => void reveal()}
              hasGuessed={hasGuessed}
            />
          </motion.div>
        )}

        {phase === "revealing" && round && (
          <motion.div
            key={`reveal-${currentRound}`}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <RevealingView
              round={round}
              roundIdx={currentRound}
              totalRounds={rounds}
              players={players}
              roundGuesses={roundGuesses as Record<string, { lat?: number; lng?: number }>}
              roundScores={roundScores}
              scores={scores}
              handle={handle}
              onNextRound={() => void nextRound()}
              busy={busy}
            />
          </motion.div>
        )}

        {phase === "finished" && (
          <motion.div
            key="finished"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <FinishedView
              players={players}
              scores={scores}
              handle={handle}
              onRematch={() => void handleRematch()}
              onExit={() => onExit?.()}
              busy={busy || rematching}
              error={rematchError}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transient RPC error toast */}
      <AnimatePresence>
        {error && phase !== "finished" && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-none absolute bottom-4 left-1/2 z-[2000] -translate-x-1/2"
          >
            <div className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 shadow-xl backdrop-blur-md">
              <AlertTriangle className="size-4" />
              Connection hiccup — retrying is safe.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
