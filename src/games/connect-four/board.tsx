"use client";

import { motion } from "motion/react";
import { Check, Copy, Loader2, Swords, Trophy } from "lucide-react";
import { useState } from "react";

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
  type Cell,
  type ConnectFourGame,
} from "./logic";

/** Disc colour classes per player. P1 = amber (brand), P2 = sky. */
const DISC: Record<Player, string> = {
  1: "bg-amber-400 shadow-[0_0_0_1px_rgba(245,158,11,0.4),0_2px_8px_-2px_rgba(245,158,11,0.6)]",
  2: "bg-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.4),0_2px_8px_-2px_rgba(56,189,248,0.6)]",
};
const DOT: Record<Player, string> = { 1: "bg-amber-400", 2: "bg-sky-400" };
const LABEL: Record<Player, string> = { 1: "Amber", 2: "Sky" };

function Disc({ value, drop }: { value: Cell; drop: boolean }) {
  const filled = value !== 0;
  // Always the same element type (motion.span) so a cell going empty → filled
  // is a prop update, never an unmount/remount (which can break DOM ordering).
  return (
    <motion.span
      initial={filled && drop ? { y: -220, opacity: 0.6 } : false}
      animate={filled ? { y: 0, opacity: 1 } : { opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
      className={cn(
        "size-full rounded-full",
        filled ? DISC[value as Player] : "border border-border bg-background/60"
      )}
    />
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

  const state = session?.state;
  const status = session?.status;
  const board = state?.game.board ?? emptyBoard();

  const seat1 = state?.players["1"] ?? null;
  const seat2 = state?.players["2"] ?? null;
  const isSpectator = Boolean(session) && myRole === null;
  const myTurn =
    status === "active" && myRole !== null && state?.turn === myRole;
  const canDrop = myTurn;

  let banner: React.ReactNode = null;
  if (!session) {
    banner = "No game yet — start one and invite an opponent.";
  } else if (status === "waiting") {
    banner =
      myRole === 1
        ? "Waiting for an opponent to join…"
        : "A game is waiting for a second player.";
  } else if (status === "active" && state) {
    const turnSeat = state.players[String(state.turn) as "1" | "2"];
    banner = myTurn ? (
      <span className="text-foreground">Your turn</span>
    ) : (
      <>
        Waiting for{" "}
        <span className="text-foreground">{turnSeat?.handle ?? "opponent"}</span>
      </>
    );
  } else if (status === "finished" && state) {
    if (state.winner === 0) {
      banner = "It's a draw.";
    } else if (state.winner) {
      const won = myRole === state.winner;
      banner = won ? (
        <span className="text-foreground">You win! 🎉</span>
      ) : (
        <>
          <span className="text-foreground">
            {state.players[String(state.winner) as "1" | "2"]?.handle}
          </span>{" "}
          wins
        </>
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
      <div className="flex items-center justify-center gap-3 px-4 pt-4 text-sm">
        <SeatChip
          player={1}
          handle={seat1?.handle}
          you={myRole === 1}
          active={status === "active" && state?.turn === 1}
        />
        <span className="text-xs text-subtle">vs</span>
        <SeatChip
          player={2}
          handle={seat2?.handle}
          you={myRole === 2}
          active={status === "active" && state?.turn === 2}
        />
      </div>

      {/* Banner */}
      <p className="px-4 pt-3 text-center text-[13px] text-muted">
        <span translate="no">{banner}</span>
      </p>

      {/* Board */}
      <div className="flex justify-center p-4">
        <div className="rounded-2xl border border-border bg-elevated p-2 shadow-inner sm:p-2.5">
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
                  aria-label={`Drop in column ${col + 1}`}
                  className={cn(
                    "group flex flex-col gap-1 rounded-lg px-0.5 py-0.5 transition-colors sm:gap-1.5",
                    clickable
                      ? "cursor-pointer hover:bg-primary/10"
                      : "cursor-default"
                  )}
                >
                  {Array.from({ length: ROWS }).map((__, row) => {
                    const value = cellAt(board, row, col);
                    const isLast =
                      state?.game.lastRow === row && state?.game.lastCol === col;
                    return (
                      <span key={row} className="size-8 sm:size-9 md:size-10">
                        <Disc value={value} drop={isLast} />
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
}: {
  player: Player;
  handle?: string;
  you: boolean;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
        active ? "border-border-strong bg-white/[0.04]" : "border-border"
      )}
    >
      <span className={cn("size-2.5 rounded-full", DOT[player])} />
      <span className="max-w-[9rem] truncate text-[13px]">
        {handle ?? "open seat"}
      </span>
      {you && <span className="text-[10px] text-muted">(you)</span>}
      <span className="terminal-badge text-subtle">{LABEL[player]}</span>
    </span>
  );
}
