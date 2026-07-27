"use client";

import { motion, AnimatePresence } from "motion/react";
import { Check, Copy, Crown, Loader2, Swords, Trophy } from "lucide-react";
import { useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGameSession } from "../use-game-session";
import type { GameBoardProps, Player } from "../types";
import {
  CONNECT_FOUR_ID,
  COLS,
  ROWS,
  cellAt,
  columnFull,
  emptyBoard,
  findWinCells,
  type Cell,
  type ConnectFourGame,
} from "./logic";

// P1 = warm gold · P2 = electric blue — complementary warm vs cool contrast
const DISC_FILL: Record<Player, string> = {
  1: "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 shadow-[0_0_0_1px_rgba(245,158,11,0.5),0_2px_14px_rgba(245,158,11,0.35)]",
  2: "bg-gradient-to-br from-blue-300 via-blue-500 to-blue-700 shadow-[0_0_0_1px_rgba(59,130,246,0.5),0_2px_14px_rgba(59,130,246,0.35)]",
};

const DISC_WIN: Record<Player, string> = {
  1: "bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.9),0_0_22px_6px_rgba(245,158,11,0.55)]",
  2: "bg-gradient-to-br from-blue-200 via-blue-400 to-blue-600 shadow-[0_0_0_2px_rgba(59,130,246,0.9),0_0_22px_6px_rgba(59,130,246,0.55)]",
};

const GHOST: Record<Player, string> = {
  1: "border-2 border-amber-400/55 bg-amber-400/20",
  2: "border-2 border-blue-400/55 bg-blue-400/20",
};

const DOT_COLOR: Record<Player, string> = {
  1: "bg-amber-400",
  2: "bg-blue-500",
};

/** Expanding ring colour when disc impacts the board */
const RIPPLE: Record<Player, string> = {
  1: "bg-amber-400/30",
  2: "bg-blue-500/30",
};

const BORDER_ACTIVE: Record<Player, string> = {
  1: "border-amber-500/50 bg-amber-500/[0.06]",
  2: "border-blue-500/50 bg-blue-500/[0.06]",
};

const LABEL: Record<Player, string> = { 1: "gold", 2: "blue" };

/**
 * Empty hole: visible ring + deep recess shadow.
 * Contrast against the navy board (#0d1929) is intentional —
 * the ring makes each cell readable even in dark conditions.
 */
const EMPTY_HOLE =
  "ring-1 ring-inset ring-white/[0.09] bg-[#040c18] shadow-[inset_0_3px_8px_rgba(0,0,0,0.82),inset_0_1px_2px_rgba(0,0,0,0.4)]";

function Disc({
  value,
  drop,
  isWin,
  dimmed,
}: {
  value: Cell;
  drop: boolean;
  isWin?: boolean;
  dimmed?: boolean;
}) {
  const filled = value !== 0;
  const discClass = !filled
    ? EMPTY_HOLE
    : isWin
      ? DISC_WIN[value as Player]
      : DISC_FILL[value as Player];

  return (
    // relative block wrapper so absolute ripple + size-full both work
    <span className="relative block size-full">
      <motion.span
        initial={filled && drop ? { y: -260, opacity: 0.85, scale: 0.92 } : false}
        animate={{
          y: 0,
          opacity: dimmed ? 0.22 : 1,
          scale: isWin ? 1.07 : dimmed ? 0.87 : 1,
        }}
        // underdamped spring: bouncy landing feel
        transition={{ type: "spring", stiffness: 550, damping: 22, mass: 0.9 }}
        className={cn("block size-full rounded-full", discClass)}
      />

      {/* Impact ripple — expands outward on disc landing */}
      <AnimatePresence>
        {filled && drop && (
          <motion.span
            key="ripple"
            initial={{ scale: 0.5, opacity: 0.6 }}
            animate={{ scale: 2.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0, 0.5, 1], delay: 0.18 }}
            className={cn(
              "pointer-events-none absolute inset-0 rounded-full",
              RIPPLE[value as Player]
            )}
          />
        )}
      </AnimatePresence>
    </span>
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
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? <Check /> : <Copy />}
      <span translate="no">{copied ? "Copied" : "Copy invite link"}</span>
    </Button>
  );
}

export function ConnectFourBoard({ roomKey, handle }: GameBoardProps) {
  const { session, myRole, ready, busy, error, join, move, rematch } =
    useGameSession<ConnectFourGame>({
      roomKey,
      gameId: CONNECT_FOUR_ID,
      handle,
    });

  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const state = session?.state;
  const status = session?.status;
  const board = state?.game.board ?? emptyBoard();

  const seat1 = state?.players["1"] ?? null;
  const seat2 = state?.players["2"] ?? null;
  const isSpectator = Boolean(session) && myRole === null;
  const myTurn =
    status === "active" && myRole !== null && state?.turn === myRole;
  const canDrop = myTurn;

  const winCells = useMemo(() => {
    const w = state?.winner;
    if (status !== "finished" || !w) return null;
    return findWinCells(board, w as 1 | 2);
  }, [status, state?.winner, board]);

  const hasWinner = !!(status === "finished" && state?.winner);

  let banner: React.ReactNode = null;
  if (!session) {
    banner = (
      <span className="text-muted">
        No game yet — start one and invite an opponent.
      </span>
    );
  } else if (status === "waiting") {
    banner =
      myRole === 1 ? (
        <span className="text-muted">Waiting for an opponent to join…</span>
      ) : (
        <span className="text-muted">
          A game is waiting for a second player.
        </span>
      );
  } else if (status === "active" && state) {
    const turnSeat = state.players[String(state.turn) as "1" | "2"];
    banner = myTurn ? (
      <span className="flex items-center gap-2">
        <motion.span
          className="size-2 rounded-full bg-accent"
          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="font-semibold text-foreground">Your turn</span>
      </span>
    ) : (
      <span className="text-muted">
        Waiting for{" "}
        <span className="font-medium text-foreground">
          {turnSeat?.handle ?? "opponent"}
        </span>
        …
      </span>
    );
  } else if (status === "finished" && state) {
    if (state.winner === 0) {
      banner = (
        <span className="font-medium text-muted">It&apos;s a draw.</span>
      );
    } else if (state.winner) {
      const won = myRole === state.winner;
      const winnerHandle =
        state.players[String(state.winner) as "1" | "2"]?.handle;
      banner = won ? (
        <span className="flex items-center gap-2 font-bold text-foreground">
          <Crown className="size-4 text-primary" />
          You win!
        </span>
      ) : (
        <span className="text-muted">
          <span className="font-semibold text-foreground">{winnerHandle}</span>{" "}
          wins
        </span>
      );
    }
  }

  return (
    <div className="glass flex flex-col overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Swords className="size-4 text-primary" />
          <h2 className="font-display text-[15px] font-semibold tracking-tight">
            Connect Four
          </h2>
        </div>
        {status === "finished" && (
          <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
            <Trophy className="size-3 text-primary" />
            <span className="terminal-badge text-muted">game over</span>
          </span>
        )}
      </div>

      {/* Players */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-4">
        <SeatChip
          player={1}
          handle={seat1?.handle}
          you={myRole === 1}
          active={status === "active" && state?.turn === 1}
          winner={hasWinner && state?.winner === 1}
        />
        <span className="text-center text-xs text-subtle">vs</span>
        <SeatChip
          player={2}
          handle={seat2?.handle}
          you={myRole === 2}
          active={status === "active" && state?.turn === 2}
          winner={hasWinner && state?.winner === 2}
        />
      </div>

      {/* Status banner */}
      <div className="flex items-center justify-center px-4 pb-1 pt-3 text-[13px]">
        {banner}
      </div>

      {/* Board */}
      <div className="flex justify-center px-4 pb-4 pt-2">
        {/* Navy frame — evokes classic Connect Four blue plastic */}
        <div className="rounded-2xl border border-border bg-[#0d1929] p-3 shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-3.5">
          <div className="flex gap-1 sm:gap-1.5">
            {Array.from({ length: COLS }).map((_, col) => {
              const full = columnFull(board, col);
              const clickable = canDrop && !full;
              return (
                <button
                  key={col}
                  type="button"
                  disabled={!clickable}
                  onClick={() => move({ col })}
                  onMouseEnter={() => setHoverCol(col)}
                  onMouseLeave={() => setHoverCol(null)}
                  aria-label={`Drop in column ${col + 1}`}
                  className={cn(
                    "group flex flex-col items-center gap-1 rounded-xl px-0.5 pb-0.5 pt-1 transition-colors duration-150 sm:gap-1.5",
                    clickable
                      ? "cursor-pointer hover:bg-white/[0.05]"
                      : "cursor-default"
                  )}
                >
                  {/* Ghost disc preview above column on hover */}
                  <span className="flex h-4 w-full items-center justify-center">
                    <AnimatePresence>
                      {hoverCol === col && clickable && myRole && (
                        <motion.span
                          key="ghost"
                          initial={{ opacity: 0, scale: 0.3, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.3, y: -8 }}
                          transition={{ duration: 0.1, ease: "easeOut" }}
                          className={cn("size-3 rounded-full", GHOST[myRole])}
                        />
                      )}
                    </AnimatePresence>
                  </span>

                  {/* Cells — block span so size-full fills correctly */}
                  {Array.from({ length: ROWS }).map((__, row) => {
                    const value = cellAt(board, row, col);
                    const cellIndex = row * COLS + col;
                    const isLast =
                      state?.game.lastRow === row &&
                      state?.game.lastCol === col;
                    const isWin = winCells?.has(cellIndex) ?? false;
                    const dimmed = hasWinner && value !== 0 && !isWin;
                    return (
                      <span
                        key={row}
                        className="block size-8 sm:size-9 md:size-10"
                      >
                        <Disc
                          value={value}
                          drop={isLast}
                          isWin={isWin}
                          dimmed={dimmed}
                        />
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 border-t border-border p-4">
        {error && <p className="text-xs text-red-400">{error}</p>}

        {!ready ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" />
            <span translate="no">Loading game…</span>
          </span>
        ) : !session ? (
          <Button onClick={join} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Swords />}
            <span translate="no">Start Connect Four</span>
          </Button>
        ) : status === "waiting" && myRole === 1 ? (
          <CopyLinkButton />
        ) : status === "waiting" && myRole !== 1 ? (
          <Button onClick={join} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Swords />}
            <span translate="no">Join as opponent</span>
          </Button>
        ) : status === "finished" && myRole !== null ? (
          <Button onClick={rematch} disabled={busy}>
            <Swords />
            <span translate="no">Rematch</span>
          </Button>
        ) : isSpectator ? (
          <span className="terminal-badge text-subtle">spectating</span>
        ) : null}
      </div>
    </div>
  );
}

function SeatChip({
  player,
  handle,
  you,
  active,
  winner,
}: {
  player: Player;
  handle?: string;
  you: boolean;
  active: boolean;
  winner: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 transition-all duration-300",
        active ? BORDER_ACTIVE[player] : "border-border bg-transparent"
      )}
    >
      {/* Radiating pulse when it's this player's turn */}
      <div className="relative shrink-0">
        <span className={cn("block size-2 rounded-full", DOT_COLOR[player])} />
        {active && (
          <motion.span
            className={cn("absolute inset-0 rounded-full", DOT_COLOR[player])}
            animate={{ scale: [1, 3], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </div>

      {/* Name + colour label */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-[12px] font-medium leading-none",
            handle
              ? active
                ? "text-foreground"
                : "text-muted"
              : "italic text-subtle"
          )}
        >
          {handle ?? "open seat"}
        </span>
        <span className="terminal-badge leading-tight text-subtle">
          {LABEL[player]}
        </span>
      </div>

      {winner && <Crown className="ml-1 size-3 shrink-0 text-primary" />}

      {you && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background px-1 py-px font-mono text-[9px] leading-tight text-muted">
          you
        </span>
      )}
    </div>
  );
}
