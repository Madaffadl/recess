"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Check, Copy, Flag, Globe, Heart, HeartCrack, Loader2, Swords, Timer, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GameBoardProps } from "../types";
import { useWordSnakeGame } from "./use-word-snake-game";
import {
  STARTING_LIVES,
  TURN_SECONDS,
  emptyWordSnakeState,
  promptLetter,
  isWordUsed,
  PLAYER_DOT_COLORS,
  type WordSnakePlayer,
} from "./logic";
import { playTick, playAccept, playReject } from "./sounds";

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? <Check /> : <Copy />}
      <span translate="no">{copied ? "Copied" : "Copy invite link"}</span>
    </Button>
  );
}

function HeartsDisplay({ lives }: { lives: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: STARTING_LIVES }).map((_, i) => {
        const isActive = i < lives;
        return (
          <span key={i} className="relative inline-flex size-3.5 items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {isActive ? (
                <motion.span
                  key="full"
                  className="absolute inset-0 flex items-center justify-center"
                  exit={{
                    scale: [1, 1.5, 1.2, 0],
                    rotate: [0, -25, 25, 0],
                    opacity: [1, 1, 1, 0],
                  }}
                  transition={{ duration: 0.38, ease: "easeIn" }}
                >
                  <Heart className="size-3 fill-rose-400 text-rose-400" />
                </motion.span>
              ) : (
                <motion.span
                  key="broken"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.4 }}
                  transition={{ duration: 0.22 }}
                >
                  <HeartCrack className="size-3 text-rose-400" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

function PlayerRow({
  player,
  index,
  isMe,
  isActiveTurn,
}: {
  player: WordSnakePlayer;
  index: number;
  isMe: boolean;
  isActiveTurn: boolean;
}) {
  const dotColor = PLAYER_DOT_COLORS[index % PLAYER_DOT_COLORS.length];

  // Floating +N score animation
  const prevScoreRef = useRef(player.score);
  const [scoreFlash, setScoreFlash] = useState<{ delta: number; key: number } | null>(null);
  useEffect(() => {
    const delta = player.score - prevScoreRef.current;
    prevScoreRef.current = player.score;
    if (delta <= 0) return;
    setScoreFlash({ delta, key: Date.now() });
    const t = setTimeout(() => setScoreFlash(null), 1200);
    return () => clearTimeout(t);
  }, [player.score]);

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between gap-2 rounded-xl border px-3 py-2.5 transition-all",
        isActiveTurn
          ? "border-primary/60 bg-primary/[0.08] shadow-[0_0_0_1px_hsl(var(--color-primary)/0.35)]"
          : "border-border bg-white/[0.02]",
        player.eliminated && "opacity-40"
      )}
    >
      {/* Name row */}
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2.5 flex-none rounded-full", dotColor)} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-medium",
            player.eliminated && "line-through"
          )}
        >
          {player.handle}
        </span>
        {isActiveTurn && !player.eliminated && (
          <span className="terminal-badge flex-none text-primary">turn</span>
        )}
        {isMe && <span className="flex-none text-[10px] text-muted">(you)</span>}
      </div>

      {/* Lives + score row */}
      <div className="flex items-center justify-between gap-2">
        <HeartsDisplay lives={player.lives} />
        <span className="relative tabular-nums text-[11px] text-subtle">
          {scoreFlash && (
            <motion.span
              key={scoreFlash.key}
              className="pointer-events-none absolute -top-4 right-0 text-[11px] font-bold text-primary"
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -14 }}
              transition={{ duration: 1.0, ease: "easeOut" }}
            >
              +{scoreFlash.delta}
            </motion.span>
          )}
          {player.score}pt
        </span>
      </div>
    </div>
  );
}

// ── Word pile ───────────────────────────────────────────────────────────────
// Deterministic scatter position for the word at chain index `i`. Derived from
// the index (not Math.random) so words keep their spot across re-renders while
// still piling up and overlapping — a "tumpukan" of used words.
function wordScatter(i: number) {
  const frac = (n: number) => n - Math.floor(n);
  const seed = i + 1;
  const left = 3 + frac(Math.sin(seed * 12.9898) * 43758.5453) * 84; // 3%–87%
  const top = 6 + frac(Math.sin(seed * 78.233) * 43758.5453) * 62; // 6%–68%
  const rot = (frac(Math.sin(seed * 3.14159) * 43758.5453) * 2 - 1) * 10; // ±10°
  return { left, top, rot };
}

// ── Board ─────────────────────────────────────────────────────────────────────

export function WordSnakeBoard({ roomKey, handle }: GameBoardProps) {
  const router = useRouter();
  const { session, uid, ready, busy, error, join, start, submit, triggerTimeout, rematch } =
    useWordSnakeGame({ roomKey, handle });

  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [targetScore, setTargetScore] = useState<number | null>(30);
  const [language, setLanguage] = useState<"en" | "id">("en");
  const [turnDuration, setTurnDuration] = useState(TURN_SECONDS);

  const triggerTimeoutRef = useRef(triggerTimeout);
  const timeoutFiredRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    triggerTimeoutRef.current = triggerTimeout;
  }, [triggerTimeout]);

  const state = session?.state ?? emptyWordSnakeState();
  const status = session?.status;

  const myIndex = state.players.findIndex((p) => p.id === uid);
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const isHost = state.hostId === uid;
  const isInGame = myIndex >= 0;
  const isSpectator = Boolean(session) && !isInGame && status === "active";
  const currentTurnPlayer =
    status === "active" ? state.players[state.turnIndex] ?? null : null;
  const isMyTurn =
    status === "active" &&
    state.turnIndex === myIndex &&
    myPlayer !== null &&
    !myPlayer.eliminated;

  // ── Countdown timer ─────────────────────────────────────────────────────
  useEffect(() => {
    const ts = state.turnSeconds ?? TURN_SECONDS;
    if (status !== "active" || !state.turnExpiresAt) {
      setTimeLeft(ts);
      timeoutFiredRef.current = false;
      return;
    }
    timeoutFiredRef.current = false;

    const tick = () => {
      const ms = state.turnExpiresAt! - Date.now();
      const secs = Math.max(0, Math.ceil(ms / 1000));
      // Drive the bar directly — no re-render, perfectly smooth
      if (timerBarRef.current) {
        const pct = Math.max(0, Math.min(100, (ms / (ts * 1000)) * 100));
        timerBarRef.current.style.width = `${pct}%`;
      }
      setTimeLeft(secs);
      if (secs <= 0 && isMyTurn && !timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        triggerTimeoutRef.current().catch(() => {});
      }
    };

    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [status, state.turnExpiresAt, isMyTurn]);

  // ── Focus input when my turn starts ─────────────────────────────────────
  useEffect(() => {
    if (!isMyTurn) return;
    setInputValue("");
    setValidationError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isMyTurn]);

  // ── Tick-tock sound for last 3 seconds ──────────────────────────────────
  useEffect(() => {
    if (status !== "active" || timeLeft <= 0 || timeLeft > 3) return;
    playTick(timeLeft);
  }, [timeLeft, status]);

  const prompt = promptLetter(state.chain);

  // ── Word submission ──────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isMyTurn || validating || busy) return;
    const word = inputValue.trim().toLowerCase();

    if (word.length < 3) {
      playReject(); setValidationError("Must be at least 3 letters");
      return;
    }
    if (prompt && word[0].toUpperCase() !== prompt) {
      playReject(); setValidationError(`Must start with ${prompt}`);
      return;
    }
    if (isWordUsed(word, state.chain)) {
      playReject(); setValidationError("Already used");
      return;
    }

    setValidating(true);
    setValidationError(null);
    try {
      const res = await fetch(
        `/api/word-snake/validate?word=${encodeURIComponent(word)}&lang=${state.language ?? "en"}`
      );
      const data = (await res.json()) as { valid: boolean };
      if (!data.valid) {
        playReject();
        setValidationError("Not a real word");
        setValidating(false);
        return;
      }
    } catch {
      // Network error — accept the word so a third-party outage never
      // blocks a player's turn
    }
    setValidating(false);

    playAccept();
    await submit(word);
    setInputValue("");
    setValidationError(null);
  }

  // ── Final scoreboard (sorted by score, winner first) ────────────────────
  const sortedPlayers = status === "finished"
    ? [...state.players].sort((a, b) => b.score - a.score)
    : [];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="glass flex min-h-[580px] flex-col overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-lg leading-none">🐍</span>
          <h2 className="font-display text-base font-semibold tracking-tight">
            Word Snake
          </h2>
        </div>
        {status === "finished" && (
          <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
            <Trophy className="size-3 text-primary" />
            <span className="terminal-badge text-muted">game over</span>
          </span>
        )}
        {status === "waiting" && state.players.length > 0 && (
          <span className="terminal-badge text-subtle">
            {state.players.length}/8 players
          </span>
        )}
        {status === "active" && (
          <div className="flex items-center gap-1.5">
            {state.targetScore && (
              <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                <Flag className="size-3 text-primary" />
                <span className="terminal-badge text-primary">{state.targetScore}pt goal</span>
              </span>
            )}
            {state.language && (
              <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                <Globe className="size-3 text-muted" />
                <span className="terminal-badge text-subtle">{state.language.toUpperCase()}</span>
              </span>
            )}
            <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
              <Timer className="size-3 text-muted" />
              <span className="terminal-badge text-subtle">{state.turnSeconds ?? TURN_SECONDS}s</span>
            </span>
          </div>
        )}
      </div>

      {/* Player grid — shown during waiting + active. Up to 8 seats laid out
          across the top band (2 rows of 4 on wide screens). */}
      {(status === "waiting" || status === "active") &&
        state.players.length > 0 && (
          <div className="grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-3 lg:grid-cols-4">
            {state.players.map((player, i) => (
              <PlayerRow
                key={player.id}
                player={player}
                index={i}
                isMe={player.id === uid}
                isActiveTurn={status === "active" && state.turnIndex === i}
              />
            ))}
          </div>
        )}

      {/* Game over — final scoreboard */}
      {status === "finished" && sortedPlayers.length > 0 && (
        <div className="flex flex-col gap-0.5 px-4 pt-5">
          <p className="px-3 pb-1 text-[11px] uppercase tracking-wider text-subtle">
            Final scores
          </p>
          {sortedPlayers.map((player, rank) => {
            const isWinner = player.id === state.winner;
            const originalIndex = state.players.indexOf(player);
            const dotColor =
              PLAYER_DOT_COLORS[originalIndex % PLAYER_DOT_COLORS.length];
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5",
                  isWinner && "bg-white/[0.04]"
                )}
              >
                <span className="w-4 flex-none text-[11px] text-subtle">
                  {rank + 1}.
                </span>
                <span className={cn("size-2 flex-none rounded-full", dotColor)} />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {player.handle}
                </span>
                {player.id === uid && (
                  <span className="text-[10px] text-muted">(you)</span>
                )}
                {isWinner && (
                  <span className="terminal-badge text-primary">winner</span>
                )}
                <span className="w-12 flex-none text-right tabular-nums text-[13px] font-semibold">
                  {player.score}pt
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Word pile — used words scatter and stack up ("tumpukan"), newest on top */}
      {state.chain.length > 0 && (
        <div className="relative mx-6 mt-5 h-40 overflow-hidden rounded-xl border border-border/60 bg-white/[0.015]">
          {state.chain.map((word, i) => {
            const isLatest = i === state.chain.length - 1;
            const { left, top, rot } = wordScatter(i);
            return (
              <motion.span
                key={`${word}-${i}`}
                initial={{ scale: 0.5, opacity: 0, rotate: rot }}
                animate={{ scale: 1, opacity: isLatest ? 1 : 0.8, rotate: rot }}
                transition={{ type: "spring", stiffness: 380, damping: 20 }}
                className={cn(
                  "absolute whitespace-nowrap rounded-lg border px-2.5 py-1 font-mono text-[14px] shadow-md",
                  isLatest
                    ? "border-primary/50 bg-elevated text-foreground shadow-primary/10"
                    : "border-border bg-card/90 text-muted"
                )}
                style={{ left: `${left}%`, top: `${top}%`, zIndex: i }}
              >
                {isLatest && word.length > 1 ? (
                  <>
                    <span>{word.slice(0, -1)}</span>
                    <span className="font-bold text-primary">
                      {word.slice(-1).toUpperCase()}
                    </span>
                  </>
                ) : (
                  word
                )}
              </motion.span>
            );
          })}
        </div>
      )}

      {/* Active game: prompt + timer + input */}
      {status === "active" && (
        <div className="flex flex-col gap-4 px-6 pb-4 pt-6">
          {prompt && (
            <div className="flex flex-col items-center gap-1.5 py-4">
              <span className="text-[11px] uppercase tracking-widest text-subtle">
                next word starts with
              </span>
              <span className="font-display text-[72px] font-bold leading-none text-primary">
                {prompt}
              </span>
            </div>
          )}

          {/* Timer bar — visible to all players. Width is driven imperatively
              by the countdown effect via `timerBarRef` (ms-precise, no jitter);
              we deliberately do NOT bind width in JSX, or the once-a-second
              re-render would snap it back and cause a visible stutter. */}
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                ref={timerBarRef}
                className={cn(
                  "h-full w-full rounded-full transition-colors",
                  timeLeft <= 3 ? "bg-red-400" : "bg-primary"
                )}
              />
            </div>
            <p
              className={cn(
                "mt-1 text-right text-[11px] tabular-nums",
                timeLeft <= 3 ? "text-red-400" : "text-subtle"
              )}
            >
              {timeLeft}s
            </p>
          </div>

          {/* Input row */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value.replace(/[^a-zA-Z]/g, ""));
                if (validationError) setValidationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
              disabled={!isMyTurn || busy || validating}
              placeholder={
                isMyTurn
                  ? `Starts with ${prompt ?? "?"}…`
                  : currentTurnPlayer
                    ? `${currentTurnPlayer.handle}'s turn…`
                    : "Waiting…"
              }
              className={cn(
                "h-10 min-w-0 flex-1 rounded-xl border border-border bg-white/[0.03] px-3 text-sm",
                "placeholder:text-subtle",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
              maxLength={32}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={!isMyTurn || !inputValue.trim() || busy || validating}
            >
              {validating || busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Submit"
              )}
            </Button>
          </div>

          {validationError && (
            <p className="text-[12px] text-red-400" translate="no">
              {validationError}
            </p>
          )}
        </div>
      )}

      {/* Actions footer */}
      <div className="mt-auto flex flex-col items-center gap-3 border-t border-border px-6 py-5">
        {error && (
          <p className="text-xs text-red-400" translate="no">
            {error}
          </p>
        )}

        {!ready ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" />
            <span translate="no">Loading game…</span>
          </span>
        ) : !session || (!isInGame && status === "waiting") ? (
          // No session yet, or waiting session the player hasn't joined
          <div className="flex flex-col items-center gap-2">
            <Button onClick={() => void join()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Swords />}
              <span translate="no">
                {!session ? "Start Word Snake" : "Join game"}
              </span>
            </Button>
            {session && <CopyLinkButton />}
          </div>
        ) : status === "waiting" && isInGame ? (
          // In the waiting lobby
          <div className="flex flex-col items-center gap-3">
            {isHost && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Flag className="size-3.5 flex-none text-muted" />
                <span className="text-[12px] text-muted">Race to</span>
                <div className="flex gap-1">
                  {[30, 50, 70].map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      onClick={() => setTargetScore(pts)}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        targetScore === pts
                          ? "bg-primary text-background"
                          : "text-muted hover:bg-white/[0.06] hover:text-foreground"
                      )}
                    >
                      {pts}pt
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isHost && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Globe className="size-3.5 flex-none text-muted" />
                <span className="text-[12px] text-muted">Language</span>
                <div className="flex gap-1">
                  {([ ["en", "English"], ["id", "Indonesia"] ] as const).map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLanguage(code)}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        language === code
                          ? "bg-primary text-background"
                          : "text-muted hover:bg-white/[0.06] hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isHost && (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Timer className="size-3.5 flex-none text-muted" />
                <span className="text-[12px] text-muted">Turn time</span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setTurnDuration((d) => Math.max(10, d - 1))}
                    disabled={turnDuration <= 10}
                    className="rounded-md p-0.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-[11px] font-semibold tabular-nums text-foreground">
                    {turnDuration}s
                  </span>
                  <button
                    type="button"
                    onClick={() => setTurnDuration((d) => Math.min(20, d + 1))}
                    disabled={turnDuration >= 20}
                    className="rounded-md p-0.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
            {isHost ? (
              <Button
                onClick={() => void start(targetScore, language, turnDuration)}
                disabled={busy || state.players.length < 2}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                <span translate="no">
                  {state.players.length < 2
                    ? "Waiting for players…"
                    : "Start Game"}
                </span>
              </Button>
            ) : (
              <p className="text-[13px] text-muted" translate="no">
                Waiting for the host to start…
              </p>
            )}
            <CopyLinkButton />
          </div>
        ) : status === "finished" ? (
          // Game over
          <div className="flex gap-2">
            {isInGame && (
              <Button onClick={() => void rematch()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                <span translate="no">Rematch</span>
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => router.push("/discover")}
            >
              <span translate="no">Leave</span>
            </Button>
          </div>
        ) : isSpectator ? (
          <span className="terminal-badge text-subtle">spectating</span>
        ) : null}
      </div>
    </div>
  );
}
