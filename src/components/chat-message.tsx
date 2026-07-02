"use client";

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
          {message.text}
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
      className="mt-3 flex gap-2.5"
    >
      <div className="w-7 shrink-0">
        <UserAvatar name={name} className="size-7" />
      </div>
      <div className="flex flex-col items-start">
        <span className="mb-1 px-1 text-xs font-semibold text-foreground">
          {name}
        </span>
        <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-border bg-white/[0.04] px-3.5 py-3 shadow-sm">
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
        </div>
      </div>
    </motion.div>
  );
}
