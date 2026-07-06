"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Dices } from "lucide-react";

import {
  annotateGroups,
  ChatBubble,
  TypingIndicator,
} from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { useLounge } from "@/hooks/use-lounge";
import { ensureAnonymousSession } from "@/lib/api/session";
import { CHAT_SEED, CHAT_USERS } from "@/lib/data";

function randomHandle(exclude?: string): string {
  const pool = exclude ? CHAT_USERS.filter((u) => u !== exclude) : CHAT_USERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function OnlineCount({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
      <span className="size-1.5 rounded-full bg-accent" />
      <span className="terminal-badge text-muted">{count} online</span>
    </span>
  );
}

export function AnonymousLounge() {
  const [identity, setIdentity] = useState<string>(() => randomHandle());
  const { messages, onlineCount, typingUser, sendMessage, notifyTyping } =
    useLounge({ handle: identity, seed: CHAT_SEED });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Establish an anonymous Supabase session (best-effort; foundation for the
  // room + game phases). The lounge itself works with just the anon key.
  useEffect(() => {
    ensureAnonymousSession();
  }, []);

  const shuffleIdentity = useCallback(() => {
    setIdentity((prev) => randomHandle(prev));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingUser]);

  const grouped = annotateGroups(messages);

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">
            Anonymous Lounge
          </h2>
          <OnlineCount count={onlineCount} />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <p className="terminal-badge text-subtle">
            you&apos;re anonymous as{" "}
            <span className="text-muted">{identity}</span>
          </p>
          <button
            type="button"
            onClick={shuffleIdentity}
            aria-label="Shuffle identity"
            className="text-muted transition-colors hover:text-foreground"
          >
            <Dices className="size-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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

      {/* Composer */}
      <ChatComposer
        onSend={sendMessage}
        onTyping={notifyTyping}
        placeholder="Message the lounge…"
      />
    </div>
  );
}
