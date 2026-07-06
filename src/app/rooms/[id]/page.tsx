"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Globe, Lock } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import {
  annotateGroups,
  ChatBubble,
  TypingIndicator,
} from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { CHAT_USERS, type ChatMessage, type Room } from "@/lib/data";
import { useRoom } from "@/hooks/use-room";
import { useRooms } from "../rooms-context";

function randomHandle(): string {
  return CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)];
}

function roomSeed(room: Room): ChatMessage[] {
  return [
    {
      id: "r1",
      user: room.host,
      text: `Welcome in! We'll start ${room.gameName} once we have enough players.`,
      time: "12:31 PM",
    },
    {
      id: "r2",
      user: room.participants.find((p) => p !== room.host) ?? "SilentIntern",
      text: "ready when you are 👍",
      time: "12:32 PM",
    },
    {
      id: "r3",
      user: room.participants[2] ?? "TabHoarder",
      text: "count me in for the next round",
      time: "12:33 PM",
    },
  ];
}

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const { rooms, toggleJoin } = useRooms();
  const room = rooms.find((r) => r.id === params.id);

  // Anonymous identity for this room session — same pattern as the lounge.
  const [identity] = useState<string>(() => randomHandle());

  const {
    messages,
    presentHandles,
    onlineCount,
    typingUser,
    connected,
    sendMessage,
    notifyTyping,
  } = useRoom({
    roomId: params.id,
    handle: identity,
    seed: room ? roomSeed(room) : [],
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingUser]);

  if (!room) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24 text-center">
          <p className="font-display text-xl font-semibold">Room not found</p>
          <p className="mt-2 text-sm text-muted">
            It may have closed, or the link expired.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/rooms">
              <ArrowLeft />
              Back to rooms
            </Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const joined = room.participants.includes("You");

  // Live presence list when connected, static fallback when offline.
  const displayParticipants =
    connected && presentHandles.length > 0
      ? presentHandles
      : room.participants.slice(0, 8);

  const participantCount = connected ? onlineCount : room.participants.length;

  const grouped = annotateGroups(messages);

  return (
    <PageShell>
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
                <Badge variant="outline">
                  <Lock />
                  private
                </Badge>
              ) : (
                <Badge>
                  <Globe />
                  public
                </Badge>
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
        <Button
          variant={joined ? "secondary" : "primary"}
          onClick={() => toggleJoin(room.id, "You")}
        >
          {joined ? "Leave room" : "Join room"}
        </Button>
      </div>

      {/* Chat + side panel */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        {/* Chat */}
        <div className="flex h-[540px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold">Room chat</h2>
            <span className="terminal-badge text-subtle">
              you&apos;re{" "}
              <span className="text-muted">{identity}</span>
            </span>
          </div>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          >
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
          />
        </div>

        {/* Side: participants + activity */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">
                Participants
              </h2>
              <span className="terminal-badge text-subtle">
                <span className="tabular-nums">{participantCount}</span>/
                {room.capacity}
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {displayParticipants.map((p) => (
                <li key={p} className="flex items-center gap-3">
                  <UserAvatar name={p} className="size-8" />
                  <span className="flex-1 truncate text-sm">
                    {p === identity ? (
                      <span>
                        {p}{" "}
                        <span className="text-xs text-muted">(you)</span>
                      </span>
                    ) : (
                      p
                    )}
                  </span>
                  {p === room.host && !connected && (
                    <Badge variant="primary">host</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-sm font-semibold">Activity</h2>
            <ul className="mt-4 space-y-3">
              {[
                { id: "1", text: `${room.host} created the room` },
                {
                  id: "2",
                  text: `${room.participants[1] ?? "A player"} joined`,
                },
                {
                  id: "3",
                  text: `${room.participants[2] ?? room.host} is ready to play`,
                },
              ].map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted/50" />
                  <p className="text-[13px] leading-snug text-muted">{a.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
