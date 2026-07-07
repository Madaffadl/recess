"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Send, Smile } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMOJIS = [
  "😀", "😂", "😅", "😊", "😍", "😎", "🤔", "🙃",
  "😴", "😭", "👍", "🙌", "👏", "🙏", "🔥", "🎉",
  "☕", "🍕", "🎮", "🎲", "🌎", "🧠", "💀", "✨",
];

const MAX = 300;

export function ChatComposer({
  onSend,
  onTyping,
  placeholder = "Message the lounge…",
  disabled = false,
}: {
  onSend: (text: string) => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const setText = (v: string) => {
    if (disabled) return;
    const next = v.slice(0, MAX);
    setValue(next);
    if (next.trim()) onTyping?.();
    requestAnimationFrame(grow);
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const remaining = MAX - value.length;

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2">
        {/* Emoji picker */}
        <div className="relative">
          <button
            type="button"
            aria-label="Emoji picker"
            onClick={() => setEmojiOpen((v) => !v)}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted transition-colors hover:border-border-strong hover:text-foreground",
              emojiOpen && "border-border-strong text-foreground"
            )}
          >
            <Smile className="size-5" />
          </button>
          {emojiOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setEmojiOpen(false)}
              />
              <div className="absolute bottom-11 left-0 z-20 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-border bg-elevated p-2 shadow-xl">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setText(value + em);
                      ref.current?.focus();
                    }}
                    className="rounded-lg p-1 text-lg transition-transform hover:scale-125 hover:bg-white/[0.06]"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Auto-growing textarea */}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? "Reconnecting…" : placeholder}
          disabled={disabled}
          className="no-scrollbar max-h-[120px] min-h-9 flex-1 resize-none rounded-xl border border-border bg-white/[0.02] px-3.5 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-subtle focus-visible:border-primary/50 focus-visible:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <Button
          type="button"
          size="icon"
          aria-label="Send"
          onClick={submit}
          disabled={!value.trim() || disabled}
          className="size-9 shrink-0"
        >
          <Send className="size-4" />
        </Button>
      </div>

      <div className="mt-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] text-subtle">
          Enter to send · Shift+Enter for a new line
        </span>
        {value.length > MAX - 60 && (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              remaining <= 0 ? "text-primary" : "text-subtle"
            )}
          >
            {remaining}
          </span>
        )}
      </div>
    </div>
  );
}
