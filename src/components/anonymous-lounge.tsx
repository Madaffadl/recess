"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Dices } from "lucide-react";

import {
  annotateGroups,
  ChatBubble,
  TypingIndicator,
} from "@/components/chat-message";
import { ChatComposer } from "@/components/chat-composer";
import { useCountUp } from "@/hooks/use-count-up";
import {
  CHAT_LINES,
  CHAT_SEED,
  CHAT_USERS,
  PRESENCE,
  timeLabel,
  type ChatMessage,
} from "@/lib/data";

let uid = 100;

function OnlineCount() {
  const n = useCountUp(PRESENCE.online, { duration: 1400 });
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
      <span className="size-1.5 rounded-full bg-accent" />
      <span className="terminal-badge text-muted">{n} online</span>
    </span>
  );
}

export function AnonymousLounge() {
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_SEED);
  const [typing, setTyping] = useState<string | null>(null);
  const [identity, setIdentity] = useState("CoffeeWizard");
  const scrollRef = useRef<HTMLDivElement>(null);

  const others = useMemo(
    () => CHAT_USERS.filter((u) => u !== identity),
    [identity]
  );

  const shuffleIdentity = useCallback(() => {
    setIdentity(CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)]);
  }, []);

  useEffect(() => {
    shuffleIdentity();
  }, [shuffleIdentity]);

  // Live chat simulation: someone types, then a message lands.
  useEffect(() => {
    let cancelled = false;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;

    const loop = () => {
      t1 = setTimeout(
        () => {
          if (cancelled) return;
          const user = others[Math.floor(Math.random() * others.length)];
          setTyping(user);
          t2 = setTimeout(() => {
            if (cancelled) return;
            setTyping(null);
            const text =
              CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)];
            uid += 1;
            setMessages((prev) =>
              [
                ...prev,
                { id: `sim-${uid}`, user, text, time: timeLabel() },
              ].slice(-40)
            );
            loop();
          }, 1500);
        },
        2800 + Math.random() * 2600
      );
    };

    loop();
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [others]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, typing]);

  const send = (text: string) => {
    uid += 1;
    setMessages((prev) =>
      [
        ...prev,
        { id: `me-${uid}`, user: identity, text, time: timeLabel(), self: true },
      ].slice(-40)
    );
  };

  const grouped = annotateGroups(messages);

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold tracking-tight">
            Anonymous Lounge
          </h2>
          <OnlineCount />
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
          {typing && <TypingIndicator name={typing} />}
        </AnimatePresence>
      </div>

      {/* Composer */}
      <ChatComposer onSend={send} placeholder="Message the lounge…" />
    </div>
  );
}
