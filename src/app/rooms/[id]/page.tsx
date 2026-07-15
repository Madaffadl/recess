"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Copy, Globe, Lock, UserMinus, Users, X } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  annotateGroups,
  ChatBubble,
  TypingIndicator,
} from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { FloatingLounge } from "@/components/floating-lounge";
import { getGameModule } from "@/games/registry";
import { GameComingSoon } from "@/games/game-coming-soon";
import { DrawTogetherLobby } from "@/games/draw-together/lobby";
import { randomHandle } from "@/lib/data";
import { joinRoom, leaveRoom, closeRoom, getRoomByInviteCode } from "@/lib/api/rooms";
import { useRoom } from "@/hooks/use-room";
import { useRooms } from "../rooms-context";

// ─── Private room gate ──────────────────────────────────────────────────────

function PrivateRoomGate({
  roomId,
  onAccess,
}: {
  roomId: string;
  onAccess: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean || checking) return;
    setChecking(true);
    setError(null);
    try {
      const room = await getRoomByInviteCode(clean);
      if (room && room.id === roomId) {
        onAccess();
      } else {
        setError("Invalid code — check with the room host.");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-8 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border bg-elevated text-2xl">
          <Lock className="size-5 text-muted" />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold">Private room</h2>
        <p className="mt-1 text-sm text-muted">
          Enter the invite code shared by your teammate.
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          <Input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="e.g. A3BX9YZK"
            className="text-center font-mono tracking-widest"
            maxLength={16}
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button onClick={verify} disabled={!code.trim() || checking}>
            {checking ? "Checking…" : "Join room"}
          </Button>
        </div>
        <Link
          href="/rooms"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to rooms
        </Link>
      </div>
    </PageShell>
  );
}

// ─── Invite link copy button ─────────────────────────────────────────────────

function InviteCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?invite=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <Button variant="secondary" size="sm" onClick={copy} className="gap-1.5">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied!" : "Copy invite link"}
    </Button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { rooms, loading } = useRooms();
  const room = rooms.find((r) => r.id === params.id);

  const [identity] = useState<string>(() => randomHandle());

  // Private room access gate
  const inviteParam = searchParams.get("invite")?.toUpperCase() ?? null;
  // Result of the async invite-code validation: null = pending/none.
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  // Granted via the manual gate form (PrivateRoomGate).
  const [manualGrant, setManualGrant] = useState(false);

  // Validate an invite param against the server. Async setState in the
  // resolve callback is fine — only synchronous setState in an effect body
  // triggers cascading renders.
  useEffect(() => {
    if (!room || room.visibility !== "private" || !inviteParam) return;
    let active = true;
    getRoomByInviteCode(inviteParam).then((found) => {
      if (active) setInviteValid(!!found && found.id === params.id);
    });
    return () => { active = false; };
  }, [room, inviteParam, params.id]);

  // Derive access during render — no effect, no cascading setState.
  // null = still deciding (keep content hidden until it resolves to true).
  const accessGranted: boolean | null = !room
    ? null
    : room.visibility === "public" || manualGrant
      ? true
      : inviteParam
        ? inviteValid // null while the lookup is in flight
        : room.inviteCode // creator's own session still holds the code
          ? true
          : false;

  const {
    messages, presentHandles, presentPeers, onlineCount, typingUser,
    connected, activity, selfKey, selfUid, removed,
    gameStarted, notifyGameStarted,
    sendMessage, notifyTyping, kick, closeForAll,
  } = useRoom({ roomId: params.id, handle: identity, seed: [] });

  // Fullpage games: navigate when any client receives game_started broadcast
  useEffect(() => {
    if (gameStarted) {
      sessionStorage.setItem("recess-handle", identity);
      router.push(`/rooms/${params.id}/play`);
    }
  }, [gameStarted, params.id, identity, router]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingUser]);

  // Race-safe join / leave via RPC
  const [joinError, setJoinError] = useState<string | null>(null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    // Only claim a slot once access is granted — never before the gate clears.
    if (!connected || accessGranted !== true || hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    let cancelled = false;

    joinRoom(params.id).then((err) => {
      // Ignore a late resolution from a torn-down connect cycle.
      if (cancelled) return;
      if (err === "full") setJoinError("This room is full.");
      else if (err === "expired") setJoinError("This room has expired.");
      else if (err === "not_found") setJoinError("This room no longer exists.");
      else if (err === "error") {
        // Transient RPC failure — allow a later reconnect to retry the join.
        hasJoinedRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      if (hasJoinedRef.current) {
        hasJoinedRef.current = false;
        leaveRoom(params.id);
      }
    };
  }, [connected, accessGranted, params.id]);

  // ── Loading skeleton ──
  if (!room) {
    if (loading) {
      return (
        <PageShell>
          <div className="h-8 w-24 animate-pulse rounded-lg bg-elevated" />
          <div className="mt-5 flex flex-col gap-5 border-b border-border pb-8">
            <div className="flex items-center gap-4">
              <div className="size-14 animate-pulse rounded-2xl bg-elevated" />
              <div className="flex flex-col gap-2">
                <div className="h-6 w-48 animate-pulse rounded-lg bg-elevated" />
                <div className="h-4 w-64 animate-pulse rounded-lg bg-elevated" />
              </div>
            </div>
          </div>
        </PageShell>
      );
    }
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center">
          <p className="font-display text-xl font-semibold">Room not found</p>
          <p className="mt-2 text-sm text-muted">It may have closed, or the link expired.</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/rooms"><ArrowLeft />Back to rooms</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  // ── Private room access check ──
  // Anything other than an explicit `true` (including the pending `null`)
  // keeps the room content hidden behind the gate.
  if (room.visibility === "private" && accessGranted !== true) {
    return <PrivateRoomGate roomId={params.id} onAccess={() => setManualGrant(true)} />;
  }

  // ── Removed by host (kick / close) ──
  if (removed) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center">
          <p className="font-display text-xl font-semibold">
            {removed === "kicked"
              ? "You were removed from this room"
              : "This room was closed by the host"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {removed === "kicked"
              ? "The host removed you from the room."
              : "The host ended the session."}
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/rooms"><ArrowLeft />Back to rooms</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  // ── Room full / expired ──
  if (joinError) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center">
          <p className="font-display text-xl font-semibold">{joinError}</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/rooms"><ArrowLeft />Back to rooms</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const isHost = !!selfUid && selfUid === room.hostId;
  const joined = connected && presentHandles.includes(identity);
  const gameModule = getGameModule(room.gameId);
  // One row per live connection (with a key for kicking); fall back to self
  // before presence has synced.
  const displayPeers =
    connected && presentPeers.length > 0
      ? presentPeers
      : [{ key: selfKey ?? "self", handle: identity, uid: selfUid ?? undefined }];
  const participantCount = connected ? onlineCount : 1;
  const grouped = annotateGroups(messages);

  const handleCloseRoom = async () => {
    // Tell everyone present immediately, then persist the closed status.
    closeForAll();
    await closeRoom(params.id);
    router.push("/rooms");
  };

  // Invite code: only meaningful for private rooms. Prefer the validated URL
  // param, then the code held in the creator's own session context.
  const inviteCode =
    room.visibility === "private" ? inviteParam ?? room.inviteCode ?? null : null;

  return (
    <div className="w-full px-5 pb-4 pt-12 sm:px-8 lg:pt-16">
      <Link
        href="/rooms"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All rooms
      </Link>

      {/* Room header */}
      <div className="mt-5 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border bg-elevated text-3xl">
            {room.gameEmoji}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {room.title}
              </h1>
              {room.visibility === "private" ? (
                <Badge variant="outline"><Lock />private</Badge>
              ) : (
                <Badge><Globe />public</Badge>
              )}
              {connected && (
                <span className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1">
                  <span className="size-1.5 rounded-full bg-accent" />
                  <span className="terminal-badge text-accent/80">live</span>
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {room.gameName} · hosted by{" "}
              <span className="text-foreground">{room.host}</span> ·{" "}
              <span className="tabular-nums">{participantCount}</span>/
              {room.capacity} players
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Share invite link — visible when we have a code */}
          {inviteCode && (
            <InviteCopyButton code={inviteCode} />
          )}
          {/* Host-only: close the room for everyone */}
          {isHost && (
            <Button
              variant="ghost"
              className="text-red-400 hover:text-red-300"
              onClick={handleCloseRoom}
            >
              <X className="size-4" />
              Close room
            </Button>
          )}
          {/* Leave button — navigates away; presence unsubscribes on unmount */}
          <Button
            variant={joined ? "secondary" : "primary"}
            disabled={!connected}
            onClick={() => { if (joined) router.push("/rooms"); }}
          >
            {!connected ? "Connecting…" : joined ? "Leave room" : "Joining…"}
          </Button>
        </div>
      </div>

      {/* Game — full width, right padding keeps it off the screen edge */}
      <div className="mt-8 pr-1 lg:pr-4">
        {gameModule?.renderMode === "fullpage" ? (
          <DrawTogetherLobby
            roomKey={room.id}
            handle={identity}
            isHost={isHost}
            onGameStarted={() => {
              sessionStorage.setItem("recess-handle", identity);
              notifyGameStarted();
              router.push(`/rooms/${params.id}/play`);
            }}
          />
        ) : gameModule ? (
          <gameModule.Board roomKey={room.id} handle={identity} />
        ) : (
          <GameComingSoon gameName={room.gameName} gameEmoji={room.gameEmoji} />
        )}
      </div>

      {/* Participants · Room chat · Activity — parallel row, 1 : 2 : 1 */}
      <div className="mt-5 grid gap-5 pr-1 lg:grid-cols-[1fr_2fr_1fr] lg:pr-4">
        {/* Participants */}
        <div className="flex h-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted">
              Participants
            </h2>
            <span className="terminal-badge text-subtle">
              <span className="tabular-nums">{participantCount}</span>/{room.capacity}
            </span>
          </div>
          <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {displayPeers.map((peer) => {
              const isSelf = peer.key === selfKey;
              const peerIsHost = !!peer.uid && peer.uid === room.hostId;
              return (
                <li key={peer.key} className="flex items-center gap-2">
                  <UserAvatar name={peer.handle} className="size-6" />
                  <span className="flex-1 truncate text-xs">
                    {isSelf ? (
                      <span>{peer.handle} <span className="text-[10px] text-muted">(you)</span></span>
                    ) : peer.handle}
                  </span>
                  {peerIsHost && <Badge variant="primary">host</Badge>}
                  {isHost && !isSelf && (
                    <button
                      type="button"
                      aria-label={`Remove ${peer.handle}`}
                      onClick={() => kick(peer.key)}
                      className="grid size-6 shrink-0 place-items-center rounded-md border border-border text-subtle transition-colors hover:border-red-500/40 hover:text-red-400"
                    >
                      <UserMinus className="size-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {inviteCode && (
            <div className="mt-3 rounded-xl border border-border bg-elevated px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-subtle">
                Invite code
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold tracking-widest text-foreground">
                {inviteCode}
              </p>
            </div>
          )}
        </div>

        {/* Room chat — the wide center column */}
        <div className="flex h-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted">
              Room chat
            </h2>
            <span className="terminal-badge text-subtle">
              you&apos;re <span className="text-muted">{identity}</span>
            </span>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="pt-4 text-center text-xs text-subtle">
                No messages yet. Say hello!
              </p>
            )}
            {grouped.map(({ message, showHeader, showTime }) => (
              <ChatBubble
                key={message.id}
                message={message}
                showHeader={showHeader}
                showTime={showTime}
              />
            ))}
            <AnimatePresence>
              {typingUser && <TypingIndicator name={typingUser} />}
            </AnimatePresence>
          </div>
          <ChatComposer
            onSend={sendMessage}
            onTyping={notifyTyping}
            placeholder="Message the room…"
            disabled={!connected}
          />
        </div>

        {/* Activity */}
        <div className="flex h-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-muted">
            Activity
          </h2>
          {activity.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <Users className="size-4 text-subtle" />
              <p className="text-xs text-subtle">
                {connected ? "No activity yet." : "Connecting…"}
              </p>
            </div>
          ) : (
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted/50" />
                  <p className="text-[11px] leading-snug text-subtle">{a.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Minimized lounge — floating chat widget, collapsed by default */}
      <FloatingLounge />
    </div>
  );
}
