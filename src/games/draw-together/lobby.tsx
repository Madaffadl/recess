"use client";

import { useEffect } from "react";
import { Crown, Palette, Play, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useDrawTogetherGame } from "./use-draw-together-game";

type Props = {
  roomKey: string;
  handle: string;
  isHost: boolean;
  onGameStarted: () => void;
};

export function DrawTogetherLobby({ roomKey, handle, isHost, onGameStarted }: Props) {
  const { session, uid, ready, busy, error, join, start, rematch } =
    useDrawTogetherGame({ roomKey, handle });

  // Join the session as soon as the hook is ready
  useEffect(() => {
    if (ready) void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const players = session?.players ?? [];
  // Host detection: the session's host_id (set by the first joiner via RPC) is
  // authoritative. Fall back to the room-level isHost prop before the session
  // has loaded, so the room creator sees the button immediately.
  const amHost = (!!uid && uid === session?.hostId) || (isHost && !session);
  const canStart = amHost && players.length >= 2 && !busy;

  // A game is already underway (someone else started it) → this is a late
  // joiner who should hop straight into the live game rather than a lobby.
  const inProgress =
    session?.status === "word_selection" ||
    session?.status === "drawing" ||
    session?.status === "round_end";
  const finished = session?.status === "finished";

  const handleStart = async () => {
    const ok = await start();
    if (ok) onGameStarted();
  };

  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      {/* Soft amber wash behind the header */}
      <div className="pointer-events-none absolute -left-16 -top-16 size-40 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl border border-primary/25 bg-primary/10">
          <Palette className="size-5 text-primary" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Draw Together</h2>
          <p className="terminal-badge text-subtle">
            {players.length === 0
              ? "joining…"
              : inProgress
                ? "game in progress"
                : finished
                  ? "last game ended"
                  : `${players.length} in lobby`}
          </p>
        </div>
        {inProgress && (
          <span className="ml-auto flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span className="terminal-badge text-accent/90">live</span>
          </span>
        )}
      </div>

      {/* Player list */}
      <div className="relative mt-5">
        <div className="flex items-center gap-1.5 px-0.5">
          <Users className="size-3 text-subtle" />
          <span className="terminal-badge text-subtle">players</span>
        </div>
        {players.length === 0 ? (
          <div className="mt-3 flex items-center gap-2.5">
            <div className="size-8 animate-pulse rounded-lg bg-elevated" />
            <div className="h-3 w-28 animate-pulse rounded bg-elevated" />
          </div>
        ) : (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {players.map((p) => (
                <motion.li
                  key={p.userId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 26 }}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-white/[0.02] px-2.5 py-2"
                >
                  <UserAvatar name={p.handle} className="size-7" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.handle}</span>
                  {p.userId === session?.hostId && <Crown className="size-3.5 shrink-0 text-primary/70" />}
                  {p.userId === uid && <span className="text-[10px] text-subtle">you</span>}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Error surface */}
      {error && (
        <p className="relative mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error.includes("does not exist")
            ? "Game backend not found — apply the draw_together migrations to Supabase."
            : error}
        </p>
      )}

      {/* Action */}
      <div className="relative mt-6">
        {inProgress ? (
          <Button onClick={onGameStarted} className="w-full">
            <Play className="size-4" /> Jump into the game
          </Button>
        ) : finished ? (
          amHost ? (
            <Button onClick={() => void rematch()} disabled={busy} className="w-full">
              {busy ? "…" : "Start a new game"}
            </Button>
          ) : (
            <p className="text-center text-sm text-muted">
              Last game ended — waiting for the host…
            </p>
          )
        ) : amHost ? (
          <Button onClick={handleStart} disabled={!canStart} className="w-full">
            {busy ? (
              "Starting…"
            ) : players.length < 2 ? (
              "Waiting for 2+ players…"
            ) : (
              <>
                <Play className="size-4" /> Start Game
              </>
            )}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Waiting for the host to start…
          </div>
        )}
      </div>
    </div>
  );
}
