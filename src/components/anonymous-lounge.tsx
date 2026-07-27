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
import { CHAT_USERS } from "@/lib/data";

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

/**
 * The lounge's inner content — header, message list, composer. Rendered as a
 * bare fragment so the surrounding shell (docked sidebar or floating popover)
 * controls the container size and chrome. Expects a `flex flex-col` parent.
 */
export function LoungePanel() {
  const [identity, setIdentity] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, onlineCount, typingUser, sendMessage, notifyTyping } =
    useLounge({ handle: identity });
  const scrollRef = useRef<HTMLDivElement>(null);

  // randomHandle runs only on the client to avoid SSR/client hydration mismatch.
  // Read from sessionStorage first so lounge and room chat share the same handle.
  useEffect(() => {
    const stored = sessionStorage.getItem("recess-handle");
    setIdentity(stored ?? randomHandle());
  }, []);

  // Persist any handle change so room chat picks it up.
  useEffect(() => {
    if (!identity) return;
    sessionStorage.setItem("recess-handle", identity);
  }, [identity]);

  // Establish an anonymous Supabase session (best-effort; foundation for the
  // room + game phases). The lounge itself works with just the anon key.
  useEffect(() => {
    ensureAnonymousSession();
  }, []);

  const shuffleIdentity = useCallback(() => {
    setIdentity((prev) => randomHandle(prev));
  }, []);

  const startEditing = useCallback(() => {
    setDraft(identity);
    setIsEditing(true);
  }, [identity]);

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) setIdentity(trimmed);
    setIsEditing(false);
  }, [draft]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingUser]);

  const grouped = annotateGroups(messages);

  return (
    <>
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
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                maxLength={16}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="terminal-badge w-32 border-b border-muted bg-transparent text-foreground outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={startEditing}
                onKeyDown={(e) => e.key === "Enter" && startEditing()}
                title="Click to set a custom name"
                className="cursor-text rounded px-0.5 text-muted underline-offset-2 hover:underline"
              >
                {identity}
              </span>
            )}
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
    </>
  );
}

/** Docked lounge — the persistent right-hand sidebar used on most pages. */
export function AnonymousLounge() {
  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      <LoungePanel />
    </div>
  );
}
