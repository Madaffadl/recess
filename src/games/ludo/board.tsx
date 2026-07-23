"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  Copy,
  Crown,
  Dice5,
  Loader2,
  Play,
  Star,
  Trophy,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { GameBoardProps } from "../types";
import { useLudoGame } from "./use-ludo-game";
import {
  BASE_BOX,
  BASE_SLOTS,
  CENTER,
  GRID,
  HOME_PATH,
  SAFE_CELLS,
  TRACK,
  movableTokens,
  tokenCell,
  type Cell,
  type LudoColor,
  type LudoPlayer,
} from "./logic";

/* ============================================================================
 * Ludo owns its own visual identity — a cozy tabletop: green felt table, warm
 * wood frame, cream board, glossy clay tokens. It deliberately shares NONE of
 * the host site's design tokens (no glass / bg-elevated / border-border /
 * text-muted / amber primary / font-display). Everything below is scoped to
 * this component via inline hex + the `--lu-*` CSS variables on the root.
 * ==========================================================================*/

const T = {
  feltTop: "#1b6e46",
  feltBottom: "#0e4a2e",
  wood: "#6f4a22",
  woodDark: "#4f3316",
  board: "#efe3c6",
  tile: "#fdf8ec",
  ink: "#37271a",
  inkSoft: "#7a6448",
  cream: "#f6efdd",
  gold: "#e7b23f",
  goldDark: "#b98418",
  line: "rgba(55,39,26,0.16)",
};

type PlayerTheme = {
  name: string;
  base: string;
  light: string;
  dark: string;
};

// Classic, saturated board-game colours — distinct from the site palette.
const PLAYER: readonly PlayerTheme[] = [
  { name: "red", base: "#e23b34", light: "#f47b74", dark: "#a3201a" },
  { name: "green", base: "#38a24a", light: "#6fc47e", dark: "#23702f" },
  { name: "yellow", base: "#f0b310", light: "#ffd257", dark: "#b8850a" },
  { name: "blue", base: "#2f7fd1", light: "#6ba7e6", dark: "#1f5896" },
];

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function tokenStyle(t: PlayerTheme): React.CSSProperties {
  return {
    background: `radial-gradient(circle at 33% 27%, ${t.light}, ${t.base} 56%, ${t.dark} 100%)`,
    borderColor: "rgba(255,255,255,0.65)",
    boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.35), 0 3px 7px rgba(0,0,0,0.4)`,
  };
}

// ─── Static board classification (built once) ───────────────────────────────

const key = (r: number, c: number) => `${r},${c}`;
const START_ABS_TO_COLOR: Record<number, LudoColor> = { 0: 0, 13: 1, 26: 2, 39: 3 };

const TRACK_MAP = new Map<
  string,
  { abs: number; safe: boolean; startColor: LudoColor | null }
>();
TRACK.forEach(([r, c], abs) => {
  TRACK_MAP.set(key(r, c), {
    abs,
    safe: SAFE_CELLS.has(abs),
    startColor: START_ABS_TO_COLOR[abs] ?? null,
  });
});

const HOME_MAP = new Map<string, LudoColor>();
HOME_PATH.forEach((cells, color) =>
  cells.forEach(([r, c]) => HOME_MAP.set(key(r, c), color as LudoColor))
);

function baseColorAt(r: number, c: number): LudoColor | null {
  for (let color = 0; color < 4; color++) {
    const [br, bc] = BASE_BOX[color];
    if (r >= br && r < br + 6 && c >= bc && c < bc + 6) return color as LudoColor;
  }
  return null;
}

type CellKind =
  | { kind: "center" }
  | { kind: "base"; color: LudoColor }
  | { kind: "home"; color: LudoColor }
  | { kind: "track"; abs: number; safe: boolean; startColor: LudoColor | null }
  | { kind: "blank" };

function classify(r: number, c: number): CellKind {
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { kind: "center" };
  const base = baseColorAt(r, c);
  if (base !== null) return { kind: "base", color: base };
  const home = HOME_MAP.get(key(r, c));
  if (home !== undefined) return { kind: "home", color: home };
  const track = TRACK_MAP.get(key(r, c));
  if (track) return { kind: "track", ...track };
  return { kind: "blank" };
}

const pct = (cell: Cell) => ({
  left: `${((cell[1] + 0.5) / GRID) * 100}%`,
  top: `${((cell[0] + 0.5) / GRID) * 100}%`,
});

function stackOffset(i: number, n: number): { dx: number; dy: number } {
  if (n <= 1) return { dx: 0, dy: 0 };
  const r = 1.35;
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

// ─── Themed primitives ────────────────────────────────────────────────────────

function LudoButton({
  variant = "primary",
  className,
  style,
  ...props
}: React.ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(${T.gold}, ${T.goldDark})`,
      color: "#3a2a12",
      boxShadow: `0 3px 0 ${T.goldDark}, 0 6px 14px rgba(0,0,0,0.35)`,
    },
    secondary: {
      background: T.cream,
      color: "#4a3826",
      border: "2px solid #cbb489",
      boxShadow: "0 2px 0 rgba(0,0,0,0.18)",
    },
    ghost: {
      background: "rgba(255,255,255,0.12)",
      color: T.cream,
      border: "1px solid rgba(255,255,255,0.2)",
    },
  };
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold transition-transform duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      style={{ fontFamily: "var(--lu-display)", ...variants[variant], ...style }}
      {...props}
    />
  );
}

function Die({ value }: { value: number }) {
  const PIPS: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  const on = new Set((PIPS[value] ?? []).map(([r, c]) => r * 3 + c));
  return (
    <motion.div
      key={value}
      initial={{ rotate: -120, scale: 0.5, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 15 }}
      className="grid size-12 grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl p-2"
      style={{
        background: "linear-gradient(150deg, #fffdf6, #ece0c4)",
        border: `2px solid ${T.goldDark}`,
        boxShadow: `inset 0 2px 3px rgba(255,255,255,0.9), 0 5px 12px rgba(0,0,0,0.45)`,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="grid place-items-center">
          {on.has(i) && (
            <span
              className="size-1.5 rounded-full"
              style={{ background: T.ink, boxShadow: "inset 0 1px 1px rgba(0,0,0,0.5)" }}
            />
          )}
        </span>
      ))}
    </motion.div>
  );
}

function SeatChip({
  player,
  you,
  active,
  winner,
}: {
  player: LudoPlayer;
  you: boolean;
  active: boolean;
  winner: boolean;
}) {
  const t = PLAYER[player.color];
  const home = player.tokens.filter((p) => p === 57).length;
  return (
    <div
      className="relative flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 transition-all duration-300"
      style={{
        background: active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)",
        border: active ? `1.5px solid ${T.gold}` : "1.5px solid rgba(255,255,255,0.12)",
      }}
    >
      <div className="relative shrink-0">
        <span
          className="block size-3 rounded-full"
          style={{ background: t.base, boxShadow: `0 0 0 2px ${rgba(t.light, 0.5)}` }}
        />
        {active && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ background: t.base }}
            animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate text-[12px] font-semibold leading-none"
          style={{ color: T.cream, fontFamily: "var(--lu-display)" }}
        >
          {player.handle}
        </span>
        <span className="text-[10px] leading-tight" style={{ color: rgba(T.cream, 0.7) }}>
          {home}/4 home
        </span>
      </div>
      {winner && <Crown className="ml-1 size-3.5 shrink-0" style={{ color: T.gold }} />}
      {you && (
        <span
          className="absolute -right-1.5 -top-1.5 rounded-full px-1 py-px text-[9px] font-bold leading-tight"
          style={{ background: T.gold, color: "#3a2a12" }}
        >
          you
        </span>
      )}
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <LudoButton variant="secondary" onClick={copy} className="h-10 px-4 text-sm">
      {copied ? <Check /> : <Copy />}
      <span translate="no">{copied ? "Copied" : "Copy invite link"}</span>
    </LudoButton>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────────

export function LudoBoard({ roomKey, handle }: GameBoardProps) {
  const { session, uid, ready, busy, error, join, start, roll, move, pass, rematch } =
    useLudoGame({ roomKey, handle });

  const state = session?.state;
  const status = session?.status;
  const players = useMemo(() => state?.players ?? [], [state]);

  const myIndex = uid ? players.findIndex((p) => p.id === uid) : -1;
  const isSeated = myIndex >= 0;
  const isHost = !!state && !!uid && state.hostId === uid;
  const isSpectator = Boolean(session) && !isSeated;

  const turnIndex = state?.turnIndex ?? 0;
  const currentPlayer = players[turnIndex];
  const dice = state?.dice ?? null;
  const myTurn = status === "active" && isSeated && turnIndex === myIndex;
  const needRoll = myTurn && dice == null;
  const needMove = myTurn && dice != null;

  const winner = state?.winner
    ? players.find((p) => p.id === state.winner) ?? null
    : null;

  const activeMovable = useMemo(
    () =>
      status === "active" && currentPlayer && dice != null
        ? movableTokens(currentPlayer.tokens, dice)
        : [false, false, false, false],
    [status, currentPlayer, dice]
  );
  const hasMove = activeMovable.some(Boolean);

  // After rolling, if the active player has no legal move (e.g. any non-6 while
  // every token is still in the yard), show the die briefly then auto-pass.
  // Only the active player's client fires this, so there's no multi-client race.
  useEffect(() => {
    if (!needMove || hasMove) return;
    const t = setTimeout(() => pass(), 1100);
    return () => clearTimeout(t);
  }, [needMove, hasMove, pass]);

  const tokenViews = useMemo(() => {
    const byCell = new Map<string, number>();
    const cells: { pIdx: number; tIdx: number; cell: Cell }[] = [];
    players.forEach((p, pIdx) =>
      p.tokens.forEach((pos, tIdx) => {
        cells.push({ pIdx, tIdx, cell: tokenCell(p.color, pos, tIdx) });
      })
    );
    const totals = new Map<string, number>();
    cells.forEach(({ cell }) => {
      const k = key(cell[0], cell[1]);
      totals.set(k, (totals.get(k) ?? 0) + 1);
    });
    return cells.map(({ pIdx, tIdx, cell }) => {
      const k = key(cell[0], cell[1]);
      const idx = byCell.get(k) ?? 0;
      byCell.set(k, idx + 1);
      const { dx, dy } = stackOffset(idx, totals.get(k) ?? 1);
      return { pIdx, tIdx, cell, dx, dy };
    });
  }, [players]);

  // ── Status banner ──
  let banner: React.ReactNode = null;
  const bannerBase = { color: rgba(T.cream, 0.82) };
  if (!session) {
    banner = <span style={bannerBase}>No game yet — start one and invite up to 3 friends.</span>;
  } else if (status === "waiting") {
    banner = (
      <span style={bannerBase}>
        Waiting for players — {players.length}/4 seated
        {isHost ? " · you can start with 2+." : "."}
      </span>
    );
  } else if (status === "active" && currentPlayer) {
    banner = myTurn ? (
      <span
        className="flex items-center gap-2 font-bold"
        style={{ color: T.cream, fontFamily: "var(--lu-display)" }}
      >
        <span className="size-2.5 rounded-full" style={{ background: PLAYER[currentPlayer.color].base }} />
        {needRoll
          ? "Your turn — roll the die!"
          : hasMove
            ? "Pick a token to move"
            : "No moves — passing…"}
      </span>
    ) : (
      <span style={bannerBase}>
        Waiting for{" "}
        <span className="font-bold" style={{ color: T.cream }}>{currentPlayer.handle}</span>
        {dice != null ? " to move…" : " to roll…"}
      </span>
    );
  } else if (status === "finished" && winner) {
    banner =
      winner.id === uid ? (
        <span
          className="flex items-center gap-2 font-bold"
          style={{ color: T.gold, fontFamily: "var(--lu-display)" }}
        >
          <Crown className="size-4" /> You win!
        </span>
      ) : (
        <span style={bannerBase}>
          <span className="font-bold" style={{ color: T.cream }}>{winner.handle}</span> wins
        </span>
      );
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-3xl"
      style={
        {
          // Self-contained theme variables (inherited by all descendants).
          "--lu-display": '"Fredoka", "Trebuchet MS", system-ui, sans-serif',
          "--lu-body": '"Nunito", system-ui, sans-serif',
          fontFamily: "var(--lu-body)",
          background: `radial-gradient(120% 90% at 50% 0%, ${T.feltTop}, ${T.feltBottom})`,
          border: `1px solid ${rgba("#000000", 0.35)}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 50px -20px rgba(0,0,0,0.6)",
        } as React.CSSProperties
      }
    >
      {/* Ludo fonts — React 19 hoists this <link> into <head> and dedupes it. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&display=swap"
      />

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: `1px solid ${rgba("#ffffff", 0.1)}` }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 place-items-center rounded-xl"
            style={{ background: rgba(T.gold, 0.2), border: `1.5px solid ${rgba(T.gold, 0.55)}` }}
          >
            <Dice5 className="size-4" style={{ color: T.gold }} />
          </span>
          <h2
            className="text-[19px] font-bold tracking-wide"
            style={{ color: T.cream, fontFamily: "var(--lu-display)" }}
          >
            Ludo
          </h2>
        </div>
        {status === "finished" && (
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: rgba(T.gold, 0.16), border: `1px solid ${rgba(T.gold, 0.4)}` }}
          >
            <Trophy className="size-3" style={{ color: T.gold }} />
            <span className="text-[11px] font-semibold" style={{ color: T.gold }}>Game over</span>
          </span>
        )}
      </div>

      {/* Seats */}
      {players.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-5 pt-4 sm:grid-cols-4">
          {players.map((p, i) => (
            <SeatChip
              key={p.id}
              player={p}
              you={p.id === uid}
              active={status === "active" && turnIndex === i}
              winner={status === "finished" && winner?.id === p.id}
            />
          ))}
        </div>
      )}

      {/* Banner */}
      <div className="flex min-h-[22px] items-center justify-center px-5 pb-1 pt-3 text-[13px]">
        {banner}
      </div>

      {/* Board */}
      <div className="flex justify-center px-5 pb-5 pt-2">
        <div className="mx-auto w-full max-w-[500px]">
          {/* Wood frame */}
          <div
            className="rounded-[22px] p-[3.5%]"
            style={{
              background: `linear-gradient(145deg, ${T.wood}, ${T.woodDark})`,
              boxShadow: `inset 0 2px 3px rgba(255,255,255,0.15), inset 0 -3px 6px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.45)`,
            }}
          >
            {/* Cream board */}
            <div
              className="relative aspect-square w-full overflow-hidden rounded-[10px]"
              style={{ background: T.board, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
            >
              {/* Background grid */}
              <div
                className="grid h-full w-full gap-px"
                style={{
                  gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${GRID}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: GRID * GRID }).map((_, i) => {
                  const r = Math.floor(i / GRID);
                  const c = i % GRID;
                  const meta = classify(r, c);
                  let cellStyle: React.CSSProperties = {};
                  let content: React.ReactNode = null;
                  if (meta.kind === "track") {
                    if (meta.startColor !== null) {
                      cellStyle = {
                        background: rgba(PLAYER[meta.startColor].base, 0.55),
                        boxShadow: `inset 0 0 0 1px ${T.line}`,
                      };
                    } else if (meta.safe) {
                      cellStyle = { background: T.tile, boxShadow: `inset 0 0 0 1px ${T.line}` };
                      content = <Star className="size-[55%]" style={{ color: T.gold }} fill={T.gold} />;
                    } else {
                      cellStyle = { background: T.tile, boxShadow: `inset 0 0 0 1px ${T.line}` };
                    }
                  } else if (meta.kind === "home") {
                    cellStyle = {
                      background: rgba(PLAYER[meta.color].base, 0.38),
                      boxShadow: `inset 0 0 0 1px ${T.line}`,
                    };
                  }
                  // base + center + blank stay transparent (drawn as overlays).
                  return (
                    <div key={i} className="grid place-items-center" style={cellStyle}>
                      {content}
                    </div>
                  );
                })}
              </div>

              {/* Base yard panels */}
              <div className="pointer-events-none absolute inset-0">
                {BASE_BOX.map((box, color) => {
                  const [br, bc] = box;
                  const t = PLAYER[color as LudoColor];
                  return (
                    <div
                      key={`base-${color}`}
                      className="absolute grid place-items-center rounded-xl p-[16%]"
                      style={{
                        left: `${(bc / GRID) * 100}%`,
                        top: `${(br / GRID) * 100}%`,
                        width: `${(6 / GRID) * 100}%`,
                        height: `${(6 / GRID) * 100}%`,
                        background: `linear-gradient(145deg, ${t.light}, ${t.base})`,
                        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.35), inset 0 -3px 6px ${rgba(t.dark, 0.6)}`,
                      }}
                    >
                      <div
                        className="size-full rounded-lg"
                        style={{ background: T.tile, boxShadow: `inset 0 0 0 2px ${rgba(t.dark, 0.4)}` }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Base token holders */}
              <div className="pointer-events-none absolute inset-0">
                {BASE_SLOTS.map((slots, color) =>
                  slots.map((slot, si) => {
                    const { left, top } = pct(slot);
                    return (
                      <span
                        key={`holder-${color}-${si}`}
                        className="absolute size-[4.6%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left,
                          top,
                          background: rgba(PLAYER[color as LudoColor].dark, 0.18),
                          boxShadow: `inset 0 0 0 2px ${rgba(PLAYER[color as LudoColor].dark, 0.45)}`,
                        }}
                      />
                    );
                  })
                )}
              </div>

              {/* Centre finish */}
              <div
                className="absolute grid place-items-center"
                style={{
                  left: `${((CENTER[1] - 1 + 0.5) / GRID) * 100}%`,
                  top: `${((CENTER[0] - 1 + 0.5) / GRID) * 100}%`,
                  width: `${(3 / GRID) * 100}%`,
                  height: `${(3 / GRID) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  background: `conic-gradient(from 45deg, ${PLAYER[1].base} 0deg 90deg, ${PLAYER[2].base} 90deg 180deg, ${PLAYER[3].base} 180deg 270deg, ${PLAYER[0].base} 270deg 360deg)`,
                  clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
                  boxShadow: `inset 0 0 0 1px ${T.line}`,
                }}
              >
                <span
                  className="grid size-[52%] place-items-center rounded-full"
                  style={{ background: T.cream, boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}
                >
                  <Trophy className="size-[55%]" style={{ color: T.goldDark }} />
                </span>
              </div>

              {/* Tokens — sized ~65% of a cell so they sit clearly inside it. */}
              <div className="pointer-events-none absolute inset-0">
                {tokenViews.map(({ pIdx, tIdx, cell, dx, dy }) => {
                  const p = players[pIdx];
                  const t = PLAYER[p.color];
                  const isCurrent = pIdx === turnIndex;
                  const canMove = isCurrent && activeMovable[tIdx];
                  const clickable = needMove && pIdx === myIndex && activeMovable[tIdx];
                  const { left, top } = pct(cell);
                  return (
                    <button
                      key={`${pIdx}-${tIdx}`}
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && move(tIdx)}
                      aria-label={`${t.name} token ${tIdx + 1}`}
                      className={cn(
                        "absolute size-[4.3%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[left,top,transform] duration-300 ease-out",
                        clickable
                          ? "pointer-events-auto cursor-pointer hover:scale-110 active:scale-95"
                          : "pointer-events-none"
                      )}
                      style={{
                        left: `calc(${left} + ${dx}%)`,
                        top: `calc(${top} + ${dy}%)`,
                        zIndex: clickable ? 2 : 1,
                        ...tokenStyle(t),
                        ...(clickable
                          ? { outline: `2px solid ${T.gold}`, outlineOffset: "1px" }
                          : {}),
                      }}
                    >
                      {canMove && (
                        <motion.span
                          className="absolute inset-0 rounded-full"
                          style={{ boxShadow: `0 0 0 2px ${T.gold}` }}
                          animate={{ scale: [1, 1.4], opacity: [0.75, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-col items-center gap-3 px-5 py-4"
        style={{ borderTop: `1px solid ${rgba("#ffffff", 0.1)}` }}
      >
        {error && (
          <p className="text-xs font-semibold" style={{ color: "#ffb4a8" }}>
            {error}
          </p>
        )}

        {status === "active" && (
          <div className="flex items-center gap-3">
            <AnimatePresence mode="popLayout">
              {dice != null ? (
                <Die value={dice} />
              ) : (
                <motion.div
                  key="empty-die"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid size-12 place-items-center rounded-2xl"
                  style={{
                    border: `2px dashed ${rgba(T.cream, 0.35)}`,
                    color: rgba(T.cream, 0.5),
                  }}
                >
                  <Dice5 className="size-5" />
                </motion.div>
              )}
            </AnimatePresence>
            {needRoll && (
              <LudoButton onClick={roll}>
                <Dice5 />
                <span translate="no">Roll</span>
              </LudoButton>
            )}
            {needMove && (
              <span className="text-[13px]" style={{ color: rgba(T.cream, 0.82) }}>
                You rolled{" "}
                <span className="font-bold" style={{ color: T.gold }}>{dice}</span>
                {hasMove ? " — tap a glowing token." : " — no moves, passing…"}
              </span>
            )}
          </div>
        )}

        {!ready ? (
          <span className="flex items-center gap-2 text-sm" style={{ color: rgba(T.cream, 0.8) }}>
            <Loader2 className="size-4 animate-spin" />
            <span translate="no">Loading game…</span>
          </span>
        ) : !session ? (
          <LudoButton onClick={join} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Dice5 />}
            <span translate="no">Start Ludo</span>
          </LudoButton>
        ) : status === "waiting" ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!isSeated && players.length < 4 && (
              <LudoButton onClick={join} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Users />}
                <span translate="no">Join game</span>
              </LudoButton>
            )}
            {isHost && (
              <LudoButton onClick={start} disabled={busy || players.length < 2}>
                {busy ? <Loader2 className="animate-spin" /> : <Play />}
                <span translate="no">Start game</span>
              </LudoButton>
            )}
            {isSeated && !isHost && (
              <span className="text-[13px]" style={{ color: rgba(T.cream, 0.7) }}>
                waiting for host to start…
              </span>
            )}
            <CopyLinkButton />
          </div>
        ) : status === "finished" && isSeated ? (
          <LudoButton onClick={rematch} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Dice5 />}
            <span translate="no">Rematch</span>
          </LudoButton>
        ) : isSpectator ? (
          <span
            className="rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(255,255,255,0.1)", color: rgba(T.cream, 0.75) }}
          >
            spectating
          </span>
        ) : null}
      </div>
    </div>
  );
}
