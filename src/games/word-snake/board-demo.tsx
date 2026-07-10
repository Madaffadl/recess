"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Flag, Globe, Heart, HeartCrack, Loader2, Swords, Timer, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STARTING_LIVES,
  TURN_SECONDS,
  SCORE_FAST_SECS,
  SCORE_MEDIUM_SECS,
  SCORE_FAST_PTS,
  SCORE_MEDIUM_PTS,
  SCORE_SLOW_PTS,
  promptLetter,
  isWordUsed,
  PLAYER_DOT_COLORS,
  type WordSnakePlayer,
  type WordSnakeState,
} from "./logic";
import { playTick, playAccept, playReject } from "./sounds";

// ── Bot word bank (indexed by first letter, all words ≥ 3 chars) ─────────────
const WORD_BANK: Record<string, string[]> = {
  A: ["apple", "arrow", "angel", "album", "alert", "among", "alone", "alter", "arise"],
  B: ["brave", "brush", "blast", "bloom", "brick", "break", "bring", "build", "bunch"],
  C: ["cloud", "crane", "craft", "crisp", "cross", "crown", "curve", "color", "claim"],
  D: ["dance", "delta", "dense", "draft", "drain", "dream", "drive", "doubt", "drawn"],
  E: ["eagle", "early", "earth", "elite", "empty", "error", "every", "event", "exact"],
  F: ["fable", "fancy", "flame", "flare", "flash", "fleet", "float", "frame", "frost"],
  G: ["ghost", "giant", "glass", "glide", "globe", "grace", "grape", "grasp", "greet"],
  H: ["habit", "harsh", "heart", "heavy", "hedge", "horse", "house", "hover", "human"],
  I: ["ideal", "image", "index", "inner", "input", "issue", "ivory", "inlet"],
  J: ["jewel", "joint", "judge", "juice", "jumbo", "jazzy", "joker"],
  K: ["karma", "knack", "knife", "koala", "kudos", "kneel"],
  L: ["lance", "laser", "layer", "legal", "lemon", "level", "light", "limit", "linen"],
  M: ["magic", "major", "maple", "march", "match", "medal", "mercy", "minor", "model"],
  N: ["naive", "nifty", "night", "noble", "noise", "north", "novel", "nexus", "nerve"],
  O: ["ocean", "offer", "olive", "onset", "opera", "orbit", "order", "outer", "oxide"],
  P: ["panel", "peace", "pearl", "phase", "piano", "pilot", "pixel", "plane", "plant"],
  Q: ["query", "quest", "queue", "quick", "quiet", "quota", "quote"],
  R: ["radar", "radio", "rapid", "raven", "reach", "realm", "ridge", "river", "robot"],
  S: ["saint", "scale", "scout", "sense", "shade", "sharp", "shelf", "shift", "stone"],
  T: ["table", "tempo", "tiger", "timer", "title", "token", "trace", "track", "trend"],
  U: ["ultra", "unify", "union", "unite", "upper", "urban", "usual", "utter", "uncle"],
  V: ["valid", "value", "vapor", "vault", "verse", "video", "viral", "visit", "vital"],
  W: ["water", "weave", "whale", "wheat", "where", "white", "whose", "witty", "wound"],
  X: ["xenon", "xerox"],
  Y: ["yield", "young", "youth", "yacht", "yearn"],
  Z: ["zesty", "zilch", "zippy", "zones", "zonal"],
};

function pickBotWord(letter: string, chain: string[]): string | null {
  const bank = WORD_BANK[letter.toUpperCase()] ?? [];
  const lower = chain.map((w) => w.toLowerCase());
  const available = bank.filter((w) => !lower.includes(w));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)]!;
}

// ── State helpers ─────────────────────────────────────────────────────────────
const SEED_WORDS = [
  "ocean", "table", "crane", "flame", "grape", "piano", "storm", "light",
  "dance", "frame", "brush", "clock", "dream", "earth", "music", "night",
  "plant", "radio", "slide", "tiger", "whale", "cloud", "fancy", "river",
];

const UID = "human";

function makePlayers(): WordSnakePlayer[] {
  return [
    { id: UID,       handle: "You",  lives: STARTING_LIVES, score: 0, eliminated: false },
    { id: "bot-aria", handle: "Aria", lives: STARTING_LIVES, score: 0, eliminated: false },
    { id: "bot-rex",  handle: "Rex",  lives: STARTING_LIVES, score: 0, eliminated: false },
  ];
}

function makeIdleState(): WordSnakeState {
  return {
    players: makePlayers(),
    hostId: UID,
    turnIndex: 0,
    winner: null,
    moveCount: 0,
    chain: [],
    turnExpiresAt: null,
    targetScore: null,
    language: "en",
    turnSeconds: TURN_SECONDS,
  };
}

// ── Pure move application (mirrors word_snake_submit SQL logic) ───────────────
function applyMove(state: WordSnakeState, word: string): WordSnakeState {
  const { players, turnIndex, chain } = state;
  const player = players[turnIndex]!;
  const w = word.trim().toLowerCase();
  const prompt = promptLetter(chain);

  const isValid =
    w.length >= 3 &&
    (!prompt || w[0]!.toUpperCase() === prompt) &&
    !isWordUsed(w, chain);

  const newPlayers = players.map((p) => ({ ...p }));

  if (isValid) {
    // Time-based scoring: elapsed seconds since the turn started
    const ts = state.turnSeconds ?? TURN_SECONDS;
    const elapsedS = state.turnExpiresAt
      ? (Date.now() - (state.turnExpiresAt - ts * 1000)) / 1000
      : ts;
    const points =
      elapsedS < SCORE_FAST_SECS   ? SCORE_FAST_PTS :
      elapsedS < SCORE_MEDIUM_SECS ? SCORE_MEDIUM_PTS :
                                     SCORE_SLOW_PTS;
    newPlayers[turnIndex] = {
      ...newPlayers[turnIndex]!,
      score: player.score + points,
    };
  } else {
    const newLives = player.lives - 1;
    newPlayers[turnIndex] = {
      ...newPlayers[turnIndex]!,
      lives: newLives,
      eliminated: newLives <= 0,
    };
  }

  const newChain = isValid ? [...chain, w] : chain;

  // Win condition 1: first to reach target score
  let winner: string | null = null;
  if (isValid && state.targetScore !== null && newPlayers[turnIndex]!.score >= state.targetScore) {
    winner = newPlayers[turnIndex]!.id;
  }
  // Win condition 2: last player standing
  if (!winner) {
    const activeCount = newPlayers.filter((p) => !p.eliminated).length;
    if (activeCount <= 1) winner = newPlayers.find((p) => !p.eliminated)?.id ?? null;
  }

  // Advance to next non-eliminated player
  const total = newPlayers.length;
  let newIdx = turnIndex;
  if (!winner) {
    let iter = 0;
    do {
      newIdx = (newIdx + 1) % total;
      iter++;
    } while (newPlayers[newIdx]!.eliminated && iter < total);
  }

  return {
    ...state,
    players: newPlayers,
    chain: newChain,
    turnIndex: newIdx,
    winner,
    moveCount: state.moveCount + 1,
    turnExpiresAt: Date.now() + (state.turnSeconds ?? TURN_SECONDS) * 1000,
  };
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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
  const dotColor = PLAYER_DOT_COLORS[index % PLAYER_DOT_COLORS.length]!;

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
        "flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all",
        isActiveTurn
          ? "bg-primary/[0.10] shadow-[inset_2px_0_0_0_hsl(var(--color-primary)/0.7)]"
          : "",
        player.eliminated && "opacity-40"
      )}
    >
      <span className={cn("size-2 flex-none rounded-full", dotColor)} />
      {/* Name + turn badge grouped so "Aria turn" reads as a unit */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className={cn("truncate text-[13px]", player.eliminated && "line-through")}>
          {player.handle}
        </span>
        {isActiveTurn && !player.eliminated && (
          <span className="terminal-badge flex-none text-primary">turn</span>
        )}
      </span>
      {isMe && <span className="flex-none text-[10px] text-muted">(you)</span>}
      <HeartsDisplay lives={player.lives} />
      <span className="relative w-10 flex-none text-right tabular-nums text-[11px] text-subtle">
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
  );
}

// ── Demo Board ────────────────────────────────────────────────────────────────

export function WordSnakeDemoBoard() {
  const [status, setStatus] = useState<"waiting" | "active" | "finished">("waiting");
  const [state, setState] = useState<WordSnakeState>(makeIdleState);
  const [inputValue, setInputValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [botThinking, setBotThinking] = useState(false);
  const [targetScore, setTargetScore] = useState<number | null>(30);
  const [language, setLanguage] = useState<"en" | "id">("en");
  const [turnDuration, setTurnDuration] = useState(TURN_SECONDS);

  const inputRef = useRef<HTMLInputElement>(null);
  const chainEndRef = useRef<HTMLDivElement>(null);
  const timerBarRef = useRef<HTMLDivElement>(null);
  const timeoutFiredRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const myIndex = state.players.findIndex((p) => p.id === UID);
  const myPlayer = myIndex >= 0 ? state.players[myIndex] : null;
  const currentTurnPlayer = status === "active" ? (state.players[state.turnIndex] ?? null) : null;
  const isMyTurn =
    status === "active" &&
    state.turnIndex === myIndex &&
    myPlayer !== null &&
    !myPlayer.eliminated;
  const prompt = promptLetter(state.chain);

  // ── Bot turn ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "active") return;
    const cur = stateRef.current;
    const turnPlayer = cur.players[cur.turnIndex];
    if (!turnPlayer || turnPlayer.id === UID) return;

    setBotThinking(true);
    const delay = 900 + Math.random() * 700;
    const t = setTimeout(() => {
      const snap = stateRef.current;
      const p = promptLetter(snap.chain);
      const word = p ? pickBotWord(p, snap.chain) : null;
      const next = applyMove(snap, word ?? "");
      setState(next);
      setBotThinking(false);
      if (next.winner !== null) setStatus("finished");
    }, delay);
    return () => {
      clearTimeout(t);
      setBotThinking(false);
    };
  }, [status, state.turnIndex]);

  // ── Countdown timer ───────────────────────────────────────────────────────
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
        setState((prev) => {
          const next = applyMove(prev, "");
          if (next.winner !== null) setStatus("finished");
          return next;
        });
      }
    };

    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [status, state.turnExpiresAt, isMyTurn]);

  // ── Tick-tock sound for last 3 seconds ───────────────────────────────────
  useEffect(() => {
    if (status !== "active" || timeLeft <= 0 || timeLeft > 3) return;
    playTick(timeLeft);
  }, [timeLeft, status]);

  // ── Focus input when my turn starts ──────────────────────────────────────
  useEffect(() => {
    if (!isMyTurn) return;
    setInputValue("");
    setValidationError(null);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isMyTurn]);

  // ── Auto-scroll chain ─────────────────────────────────────────────────────
  useEffect(() => {
    chainEndRef.current?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
  }, [state.chain.length]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleStart() {
    const seed = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
    setState((prev) => ({
      ...prev,
      chain: [seed],
      turnExpiresAt: Date.now() + turnDuration * 1000,
      turnIndex: 0,
      targetScore,
      language,
      turnSeconds: turnDuration,
    }));
    setStatus("active");
  }

  function handleRematch() {
    const seed = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
    setState({
      ...makeIdleState(),
      chain: [seed],
      turnExpiresAt: Date.now() + turnDuration * 1000,
      targetScore,
      language,
      turnSeconds: turnDuration,
    });
    setStatus("active");
  }

  async function handleSubmit() {
    if (!isMyTurn || validating) return;
    const word = inputValue.trim().toLowerCase();
    if (word.length < 3) { playReject(); setValidationError("Must be at least 3 letters"); return; }
    if (prompt && word[0]!.toUpperCase() !== prompt) {
      playReject(); setValidationError(`Must start with ${prompt}`);
      return;
    }
    if (isWordUsed(word, state.chain)) { playReject(); setValidationError("Already used"); return; }

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
      // Network error — accept the word so an API outage never blocks the player
    }
    setValidating(false);

    playAccept();
    const next = applyMove(state, word);
    setState(next);
    if (next.winner !== null) setStatus("finished");
    setInputValue("");
    setValidationError(null);
  }

  const sortedPlayers = status === "finished"
    ? [...state.players].sort((a, b) => b.score - a.score)
    : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="glass flex flex-col overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🐍</span>
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Word Snake</h2>
          <span className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-subtle">
            demo
          </span>
        </div>
        {status === "finished" && (
          <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
            <Trophy className="size-3 text-primary" />
            <span className="terminal-badge text-muted">game over</span>
          </span>
        )}
        {status === "waiting" && (
          <span className="terminal-badge text-subtle">you + 2 bots</span>
        )}
        {status === "active" && (
          <div className="flex items-center gap-1.5">
            {state.targetScore && (
              <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                <Flag className="size-3 text-primary" />
                <span className="terminal-badge text-primary">{state.targetScore}pt goal</span>
              </span>
            )}
            <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
              <Globe className="size-3 text-muted" />
              <span className="terminal-badge text-subtle">{(state.language ?? "en").toUpperCase()}</span>
            </span>
            <span className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
              <Timer className="size-3 text-muted" />
              <span className="terminal-badge text-subtle">{state.turnSeconds ?? TURN_SECONDS}s</span>
            </span>
            {botThinking && (
              <span className="flex items-center gap-1 text-[11px] text-subtle">
                <Loader2 className="size-3 animate-spin" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Player list — waiting + active */}
      {(status === "waiting" || status === "active") && (
        <div className="flex flex-col gap-0.5 px-2 pt-3">
          {state.players.map((player, i) => (
            <PlayerRow
              key={player.id}
              player={player}
              index={i}
              isMe={player.id === UID}
              isActiveTurn={status === "active" && state.turnIndex === i}
            />
          ))}
        </div>
      )}

      {/* Final scoreboard */}
      {status === "finished" && (
        <div className="flex flex-col gap-0.5 px-2 pt-4">
          <p className="px-3 pb-1 text-[11px] uppercase tracking-wider text-subtle">
            Final scores
          </p>
          {sortedPlayers.map((player, rank) => {
            const isWinner = player.id === state.winner;
            const originalIndex = state.players.indexOf(player);
            const dotColor = PLAYER_DOT_COLORS[originalIndex % PLAYER_DOT_COLORS.length]!;
            return (
              <div
                key={player.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5",
                  isWinner && "bg-white/[0.04]"
                )}
              >
                <span className="w-4 flex-none text-[11px] text-subtle">{rank + 1}.</span>
                <span className={cn("size-2 flex-none rounded-full", dotColor)} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{player.handle}</span>
                {player.id === UID && (
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

      {/* Word chain */}
      {state.chain.length > 0 && (
        <div className="mt-4 overflow-x-auto px-4">
          <div className="flex min-w-0 gap-1.5 pb-1">
            {state.chain.map((word, i) => {
              const isLatest = i === state.chain.length - 1;
              return (
                <span
                  key={`${word}-${i}`}
                  className={cn(
                    "flex-none rounded-lg border px-2.5 py-1 font-mono text-[13px]",
                    isLatest
                      ? "border-border-strong bg-elevated"
                      : "border-border text-muted"
                  )}
                >
                  {isLatest ? (
                    word.length > 1 ? (
                      <>
                        <span>{word.slice(0, -1)}</span>
                        <span className="font-bold text-primary">
                          {word.slice(-1).toUpperCase()}
                        </span>
                      </>
                    ) : (
                      <span className="font-bold text-primary">{word.toUpperCase()}</span>
                    )
                  ) : (
                    word
                  )}
                </span>
              );
            })}
            <div ref={chainEndRef} className="flex-none" />
          </div>
        </div>
      )}

      {/* Active game: prompt + timer + input */}
      {status === "active" && (
        <div className="flex flex-col gap-3 px-4 pb-2 pt-4">
          {prompt && (
            <p className="text-center text-[13px] text-muted">
              Next word must start with{" "}
              <span className="font-display text-[28px] font-bold leading-none text-primary">
                {prompt}
              </span>
            </p>
          )}

          {/* Timer bar */}
          <div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                ref={timerBarRef}
                className={cn(
                  "h-full rounded-full",
                  timeLeft <= 3 ? "bg-red-400" : "bg-primary"
                )}
                style={{ width: `${(timeLeft / TURN_SECONDS) * 100}%` }}
              />
            </div>
            <p
              className={cn(
                "mt-0.5 text-right text-[11px] tabular-nums",
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
              disabled={!isMyTurn || validating}
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
              disabled={!isMyTurn || !inputValue.trim() || validating}
            >
              {validating ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
            </Button>
          </div>

          {validationError && (
            <p className="text-[12px] text-red-400" translate="no">
              {validationError}
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex flex-col items-center gap-2 border-t border-border p-4">
        {status === "waiting" && (
          <div className="flex flex-col items-center gap-3">
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
            <Button onClick={handleStart}>
              <Swords />
              <span translate="no">Start Demo</span>
            </Button>
          </div>
        )}
        {status === "finished" && (
          <div className="flex gap-2">
            <Button onClick={handleRematch}>
              <Swords />
              <span translate="no">Rematch</span>
            </Button>
          </div>
        )}
        {status === "active" && isMyTurn && (
          <p className="text-[11px] text-subtle" translate="no">
            Your turn — type a word and press Enter or Submit
          </p>
        )}
        {status === "active" && !isMyTurn && currentTurnPlayer && (
          <p className="text-[11px] text-subtle" translate="no">
            Waiting for {currentTurnPlayer.handle}…
          </p>
        )}
      </div>
    </div>
  );
}
