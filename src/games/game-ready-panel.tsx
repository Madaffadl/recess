"use client";

import { Check, Crown, Loader2, Swords, UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import type { GamePlayers, Player, ReadyMap, RoomParticipant, Seat } from "./types";

type GameReadyPanelProps = {
  /** Generic seating from `state.players`. */
  players: GamePlayers;
  /** Per-seat readiness from `state.ready` (may be absent early). */
  ready?: ReadyMap;
  /** This client's seat, or null when spectating. */
  myRole: Player | null;
  /** Disable actions while an RPC is in flight. */
  busy?: boolean;
  /** Toggle this player's ready flag (calls the hook's `setReady`). */
  onReady: (isReady: boolean) => void;
  /** Take the next open seat, when the caller isn't seated yet. */
  onJoin?: () => void;
  /** Display label, e.g. "UNO". */
  gameLabel?: string;
  /**
   * All participants currently present in the room (from Realtime Presence).
   * When provided, the lobby shows the full room list and uses
   * participants.length as the Y denominator for "Players Ready: X / Y".
   * When absent, falls back to the seat card layout.
   */
  participants?: RoomParticipant[];
  /** The current user's handle — used to mark "YOU" among non-seated participants. */
  myHandle?: string;
  /**
   * Whether this client is the room host.
   *   true  → shows yellow "Start Game" button; no Ready button.
   *   false → shows green "Ready" / "Cancel Ready"; no Start Game.
   *   absent → legacy: Ready button for everyone, no host-controlled start.
   */
  isHost?: boolean;
  /** Host-only: called when the host clicks "Start Game". */
  onStart?: () => void;
};

// ── Seat-grid card ─────────────────────────────────────────────────────────────

function SeatCard({
  player,
  isReady,
  isMe,
  isHost,
}: {
  player: Seat;
  isReady: boolean;
  isMe: boolean;
  isHost: boolean;
}) {
  if (!player) {
    return (
      <div className="group flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white/[0.01] p-4 text-center transition-colors hover:border-border-strong">
        <span className="grid size-14 place-items-center rounded-full border border-dashed border-border text-muted transition-colors group-hover:text-foreground">
          <UserPlus className="size-5" />
        </span>
        <p className="text-sm text-muted">Waiting for player…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-[140px] flex-col justify-between rounded-xl border p-4 transition-colors",
        isReady ? "border-green-500/40 bg-green-500/[0.08]" : "border-border bg-elevated"
      )}
    >
      <div className="flex items-center gap-3">
        <UserAvatar name={player.handle} className="size-14 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold">{player.handle}</p>
          {(isMe || isHost) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {isMe && <Badge variant="accent">YOU</Badge>}
              {isHost && (
                <Badge variant="primary">
                  <Crown />
                  HOST
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {isReady ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
          <span className="size-2 rounded-full bg-green-500" />
          READY
        </span>
      ) : (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1 text-xs font-semibold text-muted">
          <span className="size-2 rounded-full bg-muted" />
          NOT READY
        </span>
      )}
    </div>
  );
}

// ── Room-based participant row ─────────────────────────────────────────────────

function ParticipantRow({
  participant,
  seatInfo,
  isMe,
  isHost,
}: {
  participant: RoomParticipant;
  seatInfo: { seat: string; isReady: boolean } | null;
  isMe: boolean;
  /** True when this participant is in seat "1" — the game session creator. */
  isHost: boolean;
}) {
  const isSeated = seatInfo !== null;
  const isReady = seatInfo?.isReady ?? false;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        isSeated && isReady
          ? "border-green-500/40 bg-green-500/[0.08]"
          : isSeated
            ? "border-border bg-elevated"
            : "border-border/40 bg-white/[0.01]"
      )}
    >
      <UserAvatar name={participant.handle} className="size-9 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{participant.handle}</p>
        {(isMe || isHost) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {isMe && <Badge variant="accent">YOU</Badge>}
            {isHost && (
              <Badge variant="primary">
                <Crown className="size-2.5" />
                HOST
              </Badge>
            )}
          </div>
        )}
      </div>
      {isSeated ? (
        isReady ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400">
            <span className="size-1.5 rounded-full bg-green-500" />
            READY
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-muted">
            <span className="size-1.5 rounded-full bg-muted" />
            NOT READY
          </span>
        )
      ) : (
        <span className="shrink-0 text-xs text-subtle">In lobby</span>
      )}
    </div>
  );
}

/** Match a room participant to their game seat (by uid, falling back to handle). */
function findSeatInfo(
  participant: RoomParticipant,
  players: GamePlayers,
  readyMap: ReadyMap
): { seat: string; isReady: boolean } | null {
  for (const [seat, p] of Object.entries(players)) {
    if (!p) continue;
    const match = participant.uid ? p.id === participant.uid : p.handle === participant.handle;
    if (match) return { seat, isReady: readyMap[seat] ?? false };
  }
  return null;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function GameReadyPanel({
  players,
  ready,
  myRole,
  busy = false,
  onReady,
  onJoin,
  onStart,
  gameLabel = "Game",
  participants,
  myHandle,
  isHost,
}: GameReadyPanelProps) {
  const readyMap: ReadyMap = ready ?? {};

  // Sorted seat keys derived from the live players object.
  const seats = Object.keys(players).sort((a, b) => Number(a) - Number(b));

  const seatedCount   = seats.filter((s) => !!players[s]).length;
  const readyCount    = seats.filter((s) => !!players[s] && (readyMap[s] ?? false)).length;
  const totalCount    = participants ? participants.length : seats.length;

  const iAmSeated = myRole !== null;
  const myReady   = myRole !== null ? (readyMap[String(myRole)] ?? false) : false;
  const enoughPlayers = seatedCount >= 2;
  const notReadySeats = seats.filter((s) => !!players[s] && !(readyMap[s] ?? false));

  // ── Host-controlled start ─────────────────────────────────────────────────
  const hostSeat     = isHost === true && myRole !== null ? String(myRole) : null;
  const nonHostSeats = seats.filter((s) => s !== hostSeat);
  const canStart =
    isHost === true &&
    nonHostSeats.length > 0 &&
    nonHostSeats.every((s) => !!players[s] && (readyMap[s] ?? false));

  // ── Progress bar ──────────────────────────────────────────────────────────
  const progressX = isHost === true
    ? nonHostSeats.filter((s) => !!players[s] && (readyMap[s] ?? false)).length
    : readyCount;
  const progressY = isHost === true ? nonHostSeats.length : totalCount;
  const pct = progressY > 0 ? Math.round((progressX / progressY) * 100) : 0;

  let subtitle: string;
  if (!enoughPlayers) {
    subtitle = "Waiting for players…";
  } else if (isHost === true && canStart) {
    subtitle = "All players are ready!";
  } else if (isHost === false && iAmSeated && myReady) {
    subtitle = "Waiting for host to start…";
  } else if (isHost === undefined && iAmSeated && myReady && notReadySeats.length === 1) {
    subtitle = `Waiting for ${players[notReadySeats[0]]?.handle ?? "opponent"}…`;
  } else {
    subtitle = "Waiting for players to ready up…";
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border border-border bg-elevated text-lg">
            🎮
          </span>
          <div>
            <h3 className="font-display text-sm font-semibold tracking-tight">
              {gameLabel} Lobby
            </h3>
            <p className="text-xs text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            {participants ? "Room Players" : "Game Players"}
          </p>
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {participants ? participants.length : seatedCount} /{" "}
            {participants ? participants.length : seats.length}
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 pt-6">
        {/* Player list */}
        {participants ? (
          <div className="flex flex-col gap-2">
            {participants.map((p) => {
              const seatInfo = findSeatInfo(p, players, readyMap);
              const isMe = myRole !== null
                ? seatInfo?.seat === String(myRole)
                : p.handle === myHandle;
              return (
                <ParticipantRow
                  key={p.uid ?? p.handle}
                  participant={p}
                  seatInfo={seatInfo}
                  isMe={!!isMe}
                  isHost={seatInfo?.seat === "1"}
                />
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {seats.map((seat) => (
              <SeatCard
                key={seat}
                player={players[seat] ?? null}
                isReady={!!players[seat] && (readyMap[seat] ?? false)}
                isMe={myRole === Number(seat)}
                isHost={seat === "1"}
              />
            ))}
          </div>
        )}

        {/* Ready progress */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            {isHost === true ? "Game Players Ready" : "Players Ready"}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {progressX} / {progressY}{" "}
            {isHost === true ? "Game Players" : "Players"} Ready
          </span>
          <div
            className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-elevated"
            role="progressbar"
            aria-valuenow={progressX}
            aria-valuemin={0}
            aria-valuemax={progressY}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Primary action */}
        {isHost === true ? (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={onStart}
              disabled={!canStart || busy}
              className={cn(
                "w-full font-semibold shadow-none transition-all",
                canStart
                  ? "bg-yellow-500 text-zinc-900 hover:bg-yellow-400 hover:shadow-lg hover:shadow-yellow-500/25 active:scale-[0.98]"
                  : "bg-white/[0.04] text-muted"
              )}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Swords />}
              Start Game
            </Button>
            {!canStart && (
              <p className="text-center text-xs text-subtle">
                Waiting for all players to be ready
              </p>
            )}
          </div>
        ) : iAmSeated ? (
          myReady ? (
            <Button
              size="lg"
              variant="outline"
              className="w-full transition-all hover:border-border-strong active:scale-[0.98]"
              onClick={() => onReady(false)}
              disabled={busy}
            >
              Cancel Ready
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full bg-green-600 text-white shadow-none transition-all hover:bg-green-500 hover:shadow-lg hover:shadow-green-500/20 active:scale-[0.98]"
              onClick={() => onReady(true)}
              disabled={busy}
            >
              <Check />
              Ready
            </Button>
          )
        ) : onJoin ? (
          <Button
            size="lg"
            className="w-full transition-all active:scale-[0.98]"
            onClick={onJoin}
            disabled={busy}
          >
            Join Game
          </Button>
        ) : (
          <Button size="lg" variant="secondary" className="w-full" disabled>
            Spectating…
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
