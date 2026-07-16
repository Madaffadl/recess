"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, Crown, Eraser, Loader2, Palette, Pencil,
  Sparkles, Trash2, Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { BRUSH_SIZES, COLORS, type DrawTogetherPlayer } from "./logic";
import { DrawingCanvas } from "./canvas";
import { useDrawTogetherGame } from "./use-draw-together-game";
import {
  playCorrect, playFanfare, playPick, playRoundEnd, playTick, playYourTurn,
} from "./sounds";

type Props = {
  roomKey: string;
  handle: string;
  onExit: () => void;
};

export function DrawTogetherBoard({ roomKey, handle, onExit }: Props) {
  const {
    session, wordOptions, secretWord, uid, ready, busy,
    join, start, selectWord, submitGuess, endRound, nextRound, rematch,
    leave, revealHint,
    sendStroke, sendClear, incomingStrokes, clearSignal, guessFeed,
  } = useDrawTogetherGame({ roomKey, handle });

  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [guess, setGuess] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const barRef = useRef<HTMLDivElement>(null);
  const endRoundCalledRef = useRef(false);
  const guessScrollRef = useRef<HTMLDivElement>(null);

  const isDrawer = !!uid && uid === session?.currentDrawerId;
  const status = session?.status;
  const myPlayer = session?.players.find((p) => p.userId === uid);
  const hasGuessed = myPlayer?.hasGuessed ?? false;
  const totalRounds = session ? session.roundsPerPlayer * session.players.length : 0;
  const urgent = typeof timeLeft === "number" && timeLeft <= 10;

  // Join on mount
  useEffect(() => {
    if (ready) void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ── Timer: drives the countdown number, the smooth (imperative) bar, the
  //    tick sound, auto end-round, and the drawer's hint reveal. ────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    endRoundCalledRef.current = false;
    if (status !== "drawing" || !session?.roundStartedAt) {
      setTimeLeft(null);
      if (barRef.current) barRef.current.style.width = "100%";
      return;
    }
    const startedAt = new Date(session.roundStartedAt).getTime();
    const total = session.drawSeconds;
    let lastSec = Infinity;
    let lastReveal = 0;
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, total - elapsed);
      const sec = Math.ceil(remaining);
      setTimeLeft(sec); // React bails when the integer is unchanged
      if (barRef.current) {
        barRef.current.style.width = `${Math.max(0, (remaining / total) * 100)}%`;
      }
      if (sec !== lastSec && sec <= 5 && sec > 0) playTick(sec);
      lastSec = sec;
      if (remaining <= 0 && !endRoundCalledRef.current) {
        endRoundCalledRef.current = true;
        void endRound();
      }
      if (isDrawer && Date.now() - lastReveal >= 3000) {
        lastReveal = Date.now();
        void revealHint();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 100);
    return () => clearInterval(timerRef.current);
  }, [status, session?.roundStartedAt, session?.drawSeconds, isDrawer, endRound, revealHint]);

  // ── Sound cues on phase / turn / guess changes ──────────────────────────
  const prevRoundStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = `${session?.currentRound}:${status}:${isDrawer}`;
    if (prevRoundStatus.current === key) return;
    prevRoundStatus.current = key;
    if ((status === "word_selection" || status === "drawing") && isDrawer) playYourTurn();
    if (status === "round_end") playRoundEnd();
    if (status === "finished") playFanfare();
  }, [session?.currentRound, status, isDrawer]);

  const processedCorrect = useRef(0);
  useEffect(() => {
    const correctCount = guessFeed.filter((g) => g.correct).length;
    if (correctCount > processedCorrect.current) playCorrect();
    processedCorrect.current = correctCount;
  }, [guessFeed]);

  // Leave the roster on unmount (exit / navigation)
  useEffect(() => {
    return () => { void leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll guess feed
  useEffect(() => {
    const el = guessScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [guessFeed.length]);

  const handleGuess = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = guess.trim();
      if (!text || hasGuessed || busy) return;
      setGuess("");
      await submitGuess(text);
    },
    [guess, hasGuessed, busy, submitGuess],
  );

  // ── Connecting ──────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <Shell onExit={onExit}>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Connecting…
          </div>
        </div>
      </Shell>
    );
  }

  const players = session?.players ?? [];
  const isHost = uid === session?.hostId;
  const drawerName =
    players.find((p) => p.userId === session?.currentDrawerId)?.handle ?? "Someone";

  // ── WAITING ───────────────────────────────────────────────────────────
  if (!session || status === "waiting") {
    return (
      <Shell onExit={onExit}>
        <div className="flex flex-1 items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass w-full max-w-sm rounded-2xl p-8 text-center"
          >
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-elevated">
              <Palette className="size-5 text-primary" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">Waiting for players</p>
            <p className="terminal-badge mt-1 text-subtle">{players.length} / 8 joined</p>
            <ul className="mt-5 space-y-2 text-left">
              {players.map((p) => (
                <li key={p.userId} className="flex items-center gap-2.5">
                  <UserAvatar name={p.handle} className="size-7" />
                  <span className="text-sm">{p.handle}</span>
                  {p.userId === uid && <span className="text-[11px] text-subtle">you</span>}
                </li>
              ))}
            </ul>
            {isHost ? (
              <Button className="mt-6 w-full" disabled={players.length < 2 || busy}
                onClick={() => void start()}>
                {busy ? "Starting…" : players.length < 2 ? "Need 2+ players" : "Start Game"}
              </Button>
            ) : (
              <p className="mt-6 text-sm text-muted">Waiting for the host to start…</p>
            )}
          </motion.div>
        </div>
      </Shell>
    );
  }

  // ── WORD SELECTION ────────────────────────────────────────────────────
  if (status === "word_selection") {
    return (
      <Shell onExit={onExit} round={session.currentRound} total={totalRounds} phase="picking">
        <div className="flex flex-1 items-center justify-center p-8">
          {isDrawer && wordOptions ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl text-center"
            >
              <p className="terminal-badge text-primary">your turn to draw</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                Choose a word
              </h2>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {wordOptions.map((w, i) => (
                  <motion.button
                    key={w}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22, delay: i * 0.06 }}
                    whileHover={{ y: -4 }}
                    onClick={() => { playPick(); void selectWord(w); }}
                    disabled={busy}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 transition-colors hover:border-primary/50 hover:bg-primary/[0.06] disabled:opacity-50"
                  >
                    <span className="block font-display text-xl font-semibold capitalize text-foreground group-hover:text-primary">
                      {w}
                    </span>
                    <span className="mt-2 block font-mono text-[11px] tracking-widest text-subtle">
                      {w.replace(/[^ ]/g, "•").replace(/ /g, "  ")} · {w.replace(/ /g, "").length}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <ChoosingIndicator name={drawerName} />
          )}
        </div>
      </Shell>
    );
  }

  // ── FINISHED ──────────────────────────────────────────────────────────
  if (status === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <Shell onExit={onExit} phase="final">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
          <Confetti />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="glass relative z-10 w-full max-w-md rounded-2xl p-8"
          >
            <div className="flex flex-col items-center">
              <motion.span
                initial={{ rotate: -12, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 }}
                className="grid size-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10"
              >
                <Trophy className="size-7 text-primary" />
              </motion.span>
              <h2 className="mt-3 font-display text-2xl font-semibold">Game Over</h2>
              {sorted[0] && (
                <p className="mt-1 text-sm text-muted">
                  <span className="font-semibold text-foreground">{sorted[0].handle}</span> wins!
                </p>
              )}
            </div>

            <Podium players={sorted} uid={uid} />

            <div className="mt-7 flex flex-col gap-2">
              {isHost && (
                <Button onClick={() => void rematch()} disabled={busy} className="w-full">
                  <Sparkles className="size-4" /> Play Again
                </Button>
              )}
              <Button variant="secondary" onClick={onExit} className="w-full">
                Exit to Room
              </Button>
            </div>
          </motion.div>
        </div>
      </Shell>
    );
  }

  // ── DRAWING + ROUND_END (canvas layout) ─────────────────────────────────
  return (
    <Shell
      onExit={onExit}
      round={session.currentRound}
      total={totalRounds}
      phase={status === "round_end" ? "reveal" : "drawing"}
      timeLeft={status === "drawing" ? timeLeft : null}
      urgent={urgent}
      barRef={barRef}
    >
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Canvas column */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 lg:p-6">
          <div className="w-full max-w-3xl">
            <DrawingCanvas
              isDrawer={isDrawer && status === "drawing"}
              color={color}
              size={brushSize}
              tool={tool}
              incomingStrokes={incomingStrokes}
              clearSignal={clearSignal}
              onStroke={sendStroke}
              onClear={sendClear}
            />
          </div>

          {/* Word / hint */}
          <WordDisplay
            isDrawer={isDrawer}
            secretWord={secretWord}
            hint={session.currentWordHint}
          />

          {/* Toolbar dock (drawer, while drawing) */}
          <AnimatePresence>
            {isDrawer && status === "drawing" && (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                className="glass flex flex-wrap items-center justify-center gap-2 rounded-2xl px-3 py-2.5 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)]"
              >
                <div className="flex gap-1">
                  <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
                    <Pencil className="size-4" />
                  </ToolBtn>
                  <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser">
                    <Eraser className="size-4" />
                  </ToolBtn>
                  <ToolBtn active={false} danger onClick={sendClear} label="Clear all">
                    <Trash2 className="size-4" />
                  </ToolBtn>
                </div>

                <span className="mx-1 h-6 w-px bg-border" />

                <div className="flex items-center gap-1.5">
                  {BRUSH_SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setBrushSize(s)}
                      title={`${s}px`}
                      className={`grid size-8 place-items-center rounded-lg border transition-colors ${
                        brushSize === s
                          ? "border-primary/50 bg-primary/10"
                          : "border-border hover:border-border-strong"
                      }`}
                    >
                      <span className="block rounded-full bg-foreground"
                        style={{ width: Math.min(s, 18), height: Math.min(s, 18) }} />
                    </button>
                  ))}
                </div>

                <span className="mx-1 h-6 w-px bg-border" />

                <div className="flex flex-wrap items-center gap-1.5">
                  {COLORS.map((c) => {
                    const selected = color === c && tool === "pen";
                    return (
                      <button
                        key={c}
                        onClick={() => { setColor(c); setTool("pen"); }}
                        title={c}
                        style={{ background: c }}
                        className={`size-6 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110 ${
                          selected ? "scale-110 ring-foreground" : "ring-transparent"
                        } ${c === "#ffffff" ? "border border-border" : ""}`}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isDrawer && status === "drawing" && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Pencil className="size-3 text-primary" /> {drawerName} is drawing
            </p>
          )}
        </div>

        {/* Right rail */}
        <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-border p-3 lg:w-80 lg:border-l lg:border-t-0">
          <PlayerRail
            players={players}
            uid={uid}
            drawerId={session.currentDrawerId}
            hostId={session.hostId}
          />
          <GuessChat
            feed={guessFeed}
            scrollRef={guessScrollRef}
            isDrawer={isDrawer}
            canGuess={!isDrawer && status === "drawing"}
            hasGuessed={hasGuessed}
            guess={guess}
            setGuess={setGuess}
            onSubmit={handleGuess}
            busy={busy}
          />
        </aside>

        {/* Round-end reveal overlay */}
        <AnimatePresence>
          {status === "round_end" && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 grid place-items-center bg-background/70 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="glass w-full max-w-sm rounded-2xl p-7 text-center"
              >
                <p className="terminal-badge text-subtle">the word was</p>
                <p className="mt-1 font-display text-3xl font-bold capitalize text-primary">
                  {session.roundWordRevealed}
                </p>
                <div className="hairline my-5" />
                <ul className="space-y-2 text-left">
                  {[...players].sort((a, b) => b.score - a.score).map((p) => (
                    <li key={p.userId} className="flex items-center gap-2.5">
                      <span className={`size-1.5 rounded-full ${p.hasGuessed || p.userId === session.currentDrawerId ? "bg-accent" : "bg-subtle"}`} />
                      <span className="flex-1 truncate text-sm">
                        {p.handle}
                        {p.userId === uid && <span className="text-[11px] text-subtle"> you</span>}
                      </span>
                      <span className="font-display text-sm tabular-nums">{p.score}</span>
                    </li>
                  ))}
                </ul>
                {isHost ? (
                  <Button className="mt-6 w-full" onClick={() => void nextRound()} disabled={busy}>
                    {busy ? "…" : session.currentRound >= totalRounds ? "See Results" : "Next Round →"}
                  </Button>
                ) : (
                  <p className="mt-6 text-sm text-muted">Waiting for the host…</p>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Shell>
  );
}

// ─── Shell (background + top bar) ───────────────────────────────────────────────

function Shell({
  children, onExit, round, total, phase, timeLeft, urgent, barRef,
}: {
  children: React.ReactNode;
  onExit: () => void;
  round?: number;
  total?: number;
  phase?: string;
  timeLeft?: number | null;
  urgent?: boolean;
  barRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="grid-faint pointer-events-none absolute inset-0" />
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <button onClick={onExit}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Exit
        </button>
        <span className="h-4 w-px bg-border" />
        <Palette className="size-4 text-primary" />
        <span className="font-display text-sm font-semibold tracking-tight">Draw Together</span>

        <div className="ml-auto flex items-center gap-2">
          {round !== undefined && total !== undefined && (
            <span className="terminal-badge rounded-md border border-border bg-white/[0.03] px-2 py-0.5 text-muted">
              round {round}/{total}
            </span>
          )}
          {phase && (
            <span className="terminal-badge hidden rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-amber-300 sm:inline">
              {phase}
            </span>
          )}
          {typeof timeLeft === "number" && (
            <span className={`min-w-[3rem] text-right font-display text-lg font-bold tabular-nums ${urgent ? "text-red-400" : "text-foreground"}`}>
              {timeLeft}<span className="text-xs text-subtle">s</span>
            </span>
          )}
        </div>

        {/* Imperative timer bar */}
        {barRef && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-transparent">
            <div ref={barRef}
              className={`h-full transition-colors duration-300 ${urgent ? "bg-red-400" : "bg-primary"}`}
              style={{ width: "100%" }} />
          </div>
        )}
      </header>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

// ─── Word / hint display ────────────────────────────────────────────────────────

function WordDisplay({
  isDrawer, secretWord, hint,
}: {
  isDrawer: boolean;
  secretWord: string | null;
  hint: string | null;
}) {
  if (isDrawer) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2">
        <Pencil className="size-3.5 text-primary" />
        <span className="text-[11px] uppercase tracking-widest text-subtle">draw</span>
        <span className="font-display text-lg font-semibold capitalize text-primary">
          {secretWord ?? "…"}
        </span>
      </div>
    );
  }
  const tokens = hint ? hint.split(" ") : [];
  return (
    <div className="flex flex-wrap items-end justify-center gap-1.5">
      {tokens.map((t, i) =>
        t === "/" ? (
          <span key={i} className="w-3" />
        ) : (
          <span
            key={i}
            className="grid h-9 w-7 place-items-center rounded-md border border-border bg-white/[0.03] font-mono text-base font-semibold uppercase text-foreground"
          >
            {t === "_" ? "" : t}
          </span>
        ),
      )}
      {tokens.length > 0 && (
        <span className="ml-2 self-center font-mono text-[11px] text-subtle">
          {tokens.filter((t) => t !== "/").length}
        </span>
      )}
    </div>
  );
}

// ─── Choosing indicator (non-drawers during word selection) ─────────────────────

function ChoosingIndicator({ name }: { name: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
      <div className="relative mx-auto grid size-16 place-items-center">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-primary/30"
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="grid size-12 place-items-center rounded-full border border-border bg-elevated">
          <Pencil className="size-5 text-primary" />
        </span>
      </div>
      <p className="mt-4 font-display text-lg font-semibold">{name} is choosing a word…</p>
      <p className="terminal-badge mt-1 text-subtle">get ready to guess</p>
    </motion.div>
  );
}

// ─── Player rail ──────────────────────────────────────────────────────────────

function PlayerRail({
  players, uid, drawerId, hostId,
}: {
  players: DrawTogetherPlayer[];
  uid: string | null;
  drawerId: string | null;
  hostId: string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center justify-between px-1">
        <span className="terminal-badge text-subtle">players</span>
        <span className="terminal-badge text-subtle">{players.length}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {sorted.map((p) => {
          const isDrawer = p.userId === drawerId;
          return (
            <li key={p.userId}
              className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors ${
                isDrawer ? "bg-primary/[0.08]" : p.hasGuessed ? "bg-accent/[0.06]" : ""
              }`}>
              <div className="relative">
                <UserAvatar name={p.handle} className="size-8" />
                {isDrawer && (
                  <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Pencil className="size-2.5" />
                  </span>
                )}
                {!isDrawer && p.hasGuessed && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Check className="size-2.5" strokeWidth={3} />
                  </motion.span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[13px] font-medium">{p.handle}</span>
                {p.userId === hostId && <Crown className="size-3 shrink-0 text-primary/70" />}
                {p.userId === uid && <span className="text-[10px] text-subtle">you</span>}
              </div>
              <ScoreCell value={p.score} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScoreCell({ value }: { value: number }) {
  const prev = useRef(value);
  const [pop, setPop] = useState<number | null>(null);
  useEffect(() => {
    if (value > prev.current) {
      const delta = value - prev.current;
      setPop(delta);
      const t = setTimeout(() => setPop(null), 1000);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return (
    <span className="relative font-display text-sm font-semibold tabular-nums">
      {value}
      <AnimatePresence>
        {pop != null && (
          <motion.span
            initial={{ y: 0, opacity: 1 }} animate={{ y: -16, opacity: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="absolute -top-0.5 right-0 whitespace-nowrap text-[11px] font-bold text-accent">
            +{pop}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Guess chat ─────────────────────────────────────────────────────────────────

function GuessChat({
  feed, scrollRef, isDrawer, canGuess, hasGuessed, guess, setGuess, onSubmit, busy,
}: {
  feed: { id: string; handle: string; text: string; correct: boolean }[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isDrawer: boolean;
  canGuess: boolean;
  hasGuessed: boolean;
  guess: string;
  setGuess: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <div className="glass flex min-h-0 flex-1 flex-col rounded-2xl">
      <div className="flex items-center px-3 py-2">
        <span className="terminal-badge text-subtle">guesses</span>
      </div>
      <div className="hairline" />
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {feed.length === 0 && (
          <p className="pt-6 text-center text-xs text-subtle">
            {isDrawer ? "Waiting for guesses…" : "Type your guess below!"}
          </p>
        )}
        <AnimatePresence initial={false}>
          {feed.map((g) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="text-[13px]"
            >
              {g.correct ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-2 py-1 font-medium text-emerald-300">
                  <Check className="size-3" strokeWidth={3} /> {g.handle} guessed it!
                </span>
              ) : (
                <span className="text-muted">
                  <span className="font-medium text-foreground">{g.handle}</span> {g.text}
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {canGuess && (
        <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-2.5">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder={hasGuessed ? "You got it! ✅" : "Type your guess…"}
            disabled={hasGuessed || busy}
            className="min-w-0 flex-1 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-sm outline-none transition-colors placeholder:text-subtle focus:border-primary/50 focus:ring-1 focus:ring-primary disabled:opacity-50"
            maxLength={80}
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!guess.trim() || hasGuessed || busy}>
            <ArrowLeft className="size-4 rotate-180" />
          </Button>
        </form>
      )}
    </div>
  );
}

// ─── Podium (finished) ──────────────────────────────────────────────────────────

function Podium({ players, uid }: { players: DrawTogetherPlayer[]; uid: string | null }) {
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);
  // Visual order: 2nd, 1st, 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = { 0: "h-16", 1: "h-24", 2: "h-12" } as const;
  const rank = (p: DrawTogetherPlayer) => players.indexOf(p);
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div className="mt-6">
      <div className="flex items-end justify-center gap-2">
        {order.map((p, idx) => {
          const r = rank(p);
          const h = heights[idx as 0 | 1 | 2];
          return (
            <motion.div
              key={p.userId}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.2 + idx * 0.1 }}
              className="flex w-20 flex-col items-center"
            >
              <span className="text-lg">{medal[r]}</span>
              <UserAvatar name={p.handle} className="my-1 size-9" />
              <span className="max-w-full truncate text-[12px] font-medium">{p.handle}</span>
              <span className="font-display text-sm font-bold text-primary tabular-nums">{p.score}</span>
              <div className={`mt-1.5 w-full rounded-t-lg border border-b-0 border-border bg-gradient-to-b from-primary/20 to-transparent ${h}`} />
            </motion.div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ul className="mt-4 space-y-1">
          {rest.map((p, i) => (
            <li key={p.userId} className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-sm">
              <span className="w-4 text-center text-[12px] text-subtle">{i + 4}</span>
              <span className="flex-1 truncate">
                {p.handle}
                {p.userId === uid && <span className="text-[11px] text-subtle"> you</span>}
              </span>
              <span className="font-display tabular-nums">{p.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

// Deterministic pseudo-random (sin hash) — pure, so it's safe to call during
// render (matches the word-snake scatter pattern; avoids Math.random impurity).
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: (seeded(i + 1) * 2 - 1) * 300,
        rot: seeded(i + 7) * 540,
        color: COLORS[i % COLORS.length],
        delay: seeded(i + 13) * 0.4,
        dur: 1.4 + seeded(i + 21) * 0.8,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: -40, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: p.x, y: 420, opacity: 0, rotate: p.rot, scale: 0.6 }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeOut" }}
          className="absolute size-2 rounded-[2px]"
          style={{ background: p.color }}
        />
      ))}
    </div>
  );
}

// ─── Tool button ────────────────────────────────────────────────────────────────

function ToolBtn({
  active, onClick, children, label, danger,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-lg border transition-colors ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : danger
            ? "border-border text-muted hover:border-red-500/40 hover:text-red-400"
            : "border-border text-muted hover:border-border-strong hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
