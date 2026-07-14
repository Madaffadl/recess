"use client";

import { Loader2, Swords } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useGameSession } from "../use-game-session";
import type { GameBoardProps } from "../types";
import { UNO_ID, canPlayCard, parseCard, type UnoGame } from "./logic";

const COLOR_DOT: Record<string, string> = {
  red:    "bg-red-500",
  green:  "bg-green-500",
  blue:   "bg-blue-500",
  yellow: "bg-yellow-400",
};

const COLOR_LABEL: Record<string, string> = {
  red:    "Red",
  green:  "Green",
  blue:   "Blue",
  yellow: "Yellow",
};

// Dark-theme card face colors
const CARD_BG: Record<string, string> = {
  red:    "bg-red-500/15    border-red-500/40    text-red-300",
  green:  "bg-green-600/15  border-green-500/40  text-green-300",
  blue:   "bg-blue-500/15   border-blue-500/40   text-blue-300",
  yellow: "bg-yellow-400/15 border-yellow-400/40 text-yellow-300",
};

export function UnoBoard({ roomKey, handle }: GameBoardProps) {
  const { session, myRole, ready, busy, error, join, move } =
    useGameSession<UnoGame>({ roomKey, gameId: UNO_ID, handle });

  if (!ready) {
    return (
      <div className="glass flex items-center justify-center rounded-2xl p-10">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  const state  = session?.state;
  const game   = state?.game;
  const status = session?.status;

  const topCard      = game?.discardPile[0] ?? null;
  const topParsed    = topCard ? parseCard(topCard) : null;
  const currentColor = game?.currentColor ?? null;

  const seatKey  = myRole !== null ? (String(myRole) as "1" | "2") : null;
  const oppKey   = myRole === 1 ? "2" : "1";
  const myHand   = seatKey ? (game?.hands[seatKey] ?? []) : [];
  const oppCount = game?.hands[oppKey]?.length ?? 0;

  const isMyTurn   = state !== undefined && state.turn === myRole;
  const turnSeat   = state ? (String(state.turn) as "1" | "2") : null;
  const turnHandle = turnSeat ? state?.players[turnSeat]?.handle : null;

  return (
    <div className="glass flex flex-col overflow-hidden rounded-2xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span>🃏</span>
          <h2 className="font-display text-[15px] font-semibold tracking-tight">UNO</h2>
        </div>

        {currentColor && (
          <div className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-full", COLOR_DOT[currentColor] ?? "bg-muted")} />
            <span className="terminal-badge text-subtle">
              {COLOR_LABEL[currentColor] ?? currentColor}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col gap-4 p-5">

        {/* No session */}
        {!session && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-muted">No active game session.</p>
            <Button onClick={join} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Swords />}
              Start UNO
            </Button>
          </div>
        )}

        {/* Finished */}
        {session && status === "finished" && state && (
          <div className="py-8 text-center">
            {state.winner === myRole ? (
              <p className="font-display text-lg font-semibold">You win! 🎉</p>
            ) : (
              <p className="font-display text-lg font-semibold">
                <span className="text-foreground">
                  {state.players[String(state.winner) as "1" | "2"]?.handle ?? "Opponent"}
                </span>{" "}
                wins
              </p>
            )}
          </div>
        )}

        {/* Active or waiting */}
        {session && status !== "finished" && (
          <>
            {/* Turn banner */}
            <div className="rounded-xl border border-border bg-elevated px-4 py-2.5 text-center">
              {status === "waiting" ? (
                <p className="text-sm text-muted">
                  {myRole === 1
                    ? "Waiting for an opponent to join…"
                    : "A game is waiting for a second player."}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {isMyTurn ? (
                    <span className="font-medium text-foreground">Your turn</span>
                  ) : (
                    <>
                      Waiting for{" "}
                      <span className="text-foreground">{turnHandle ?? "opponent"}</span>…
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Top card + opponent count */}
            <div className="grid grid-cols-2 gap-3">
              {topCard && (
                <div className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl border p-4",
                  topParsed?.color ? CARD_BG[topParsed.color] : "border-border bg-elevated text-foreground"
                )}>
                  <span className="text-[10px] text-muted">Top card</span>
                  <span className="font-mono text-xl font-bold">{topCard}</span>
                </div>
              )}
              <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-elevated p-4">
                <span className="text-[10px] text-muted">Opponent</span>
                <span className="text-xl font-bold tabular-nums">{oppCount}</span>
                <span className="text-[10px] text-muted">cards</span>
              </div>
            </div>

            {/* Player hand — only shown when active and seated */}
            {seatKey && game && status === "active" && (
              <div>
                <p className="mb-2 text-[11px] text-muted">Your hand ({myHand.length})</p>
                <div className="flex flex-wrap gap-2">
                  {myHand.map((card, idx) => {
                    const p = parseCard(card);
                    const playable =
                      isMyTurn &&
                      !busy &&
                      canPlayCard(card, game.currentColor, game.currentType, game.currentValue);
                    return (
                      <button
                        key={`${card}-${idx}`}
                        type="button"
                        disabled={!playable}
                        onClick={() => move({ type: "play_card", card })}
                        className={cn(
                          "rounded-lg border px-3 py-2 font-mono text-sm font-semibold transition-all",
                          p?.color
                            ? CARD_BG[p.color]
                            : "border-border bg-elevated text-foreground",
                          playable
                            ? "cursor-pointer hover:ring-2 hover:ring-primary/60"
                            : "cursor-not-allowed opacity-40"
                        )}
                      >
                        {card}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Join as second player */}
            {status === "waiting" && myRole !== 1 && (
              <Button onClick={join} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                Join as opponent
              </Button>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
