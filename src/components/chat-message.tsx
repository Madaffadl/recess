"use client";

import React from "react";
import { motion } from "motion/react";

import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type ChatBubbleMessage = {
  id: string;
  user: string;
  text: string;
  time?: string;
  self?: boolean;
};

/** Add messenger-style grouping flags to a list of messages. */
export function annotateGroups<T extends ChatBubbleMessage>(messages: T[]) {
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const samePrev =
      !!prev && prev.user === message.user && !!prev.self === !!message.self;
    const sameNext =
      !!next && next.user === message.user && !!next.self === !!message.self;
    return { message, showHeader: !samePrev, showTime: !sameNext };
  });
}

const URL_RE = /https?:\/\/[^\s<>"{}|\\^[\]`]+/g;

function renderTextWithLinks(text: string, self: boolean) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "underline underline-offset-2 break-all",
          self ? "text-amber-200 hover:text-amber-100" : "text-primary hover:text-primary/80"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

export function ChatBubble({
  message,
  showHeader,
  showTime,
}: {
  message: ChatBubbleMessage;
  showHeader: boolean;
  showTime: boolean;
}) {
  const self = !!message.self;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex w-full gap-2.5",
        self ? "justify-end" : "justify-start",
        showHeader ? "mt-3 first:mt-0" : "mt-0.5"
      )}
    >
      {!self && (
        <div className="w-7 shrink-0">
          {showHeader && <UserAvatar name={message.user} className="size-7" />}
        </div>
      )}

      <div
        className={cn(
          "flex max-w-[78%] flex-col",
          self ? "items-end" : "items-start"
        )}
      >
        {showHeader && !self && (
          <span className="mb-1 px-1 text-xs font-semibold text-foreground">
            {message.user}
          </span>
        )}

        <div
          className={cn(
            "px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm",
            self
              ? "rounded-2xl rounded-br-md border border-primary/25 bg-primary/15 text-amber-50"
              : "rounded-2xl rounded-tl-md border border-border bg-white/[0.04] text-foreground/90"
          )}
        >
          {renderTextWithLinks(message.text, self)}
        </div>

        {showTime && message.time && (
          <span className="mt-1 px-1 text-[10px] tabular-nums text-subtle">
            {message.time}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function TypingIndicator({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-3 flex items-end gap-2.5"
    >
      <div className="w-7 shrink-0">
        <UserAvatar name={name} className="size-7" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border bg-white/[0.04] px-3.5 py-2.5 shadow-sm">
        <span className="text-xs text-muted">
          <span className="font-medium text-foreground/90">{name}</span> is
          typing
        </span>
        <span className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-muted"
              animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  );
}
