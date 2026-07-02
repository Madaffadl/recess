import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Retro-through-typography wordmark: a small pixel motif + "recess" with a
 * blinking terminal cursor. No arcade icons.
 */
export function Logo({
  className,
  showCursor = true,
}: {
  className?: string;
  showCursor?: boolean;
}) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)}>
      <span className="grid size-8 place-items-center rounded-lg border border-border bg-elevated transition-colors group-hover:border-border-strong">
        <span className="grid grid-cols-2 gap-[3px]">
          <i className="size-[5px] rounded-[1px] bg-primary" />
          <i className="size-[5px] rounded-[1px] bg-muted/40" />
          <i className="size-[5px] rounded-[1px] bg-muted/40" />
          <i className="size-[5px] rounded-[1px] bg-muted/70" />
        </span>
      </span>
      <span className="flex items-center font-display text-[17px] font-bold tracking-tight text-foreground">
        recess
        {showCursor && (
          <span className="ml-1 h-4 w-[7px] translate-y-px animate-blink rounded-[1px] bg-primary" />
        )}
      </span>
    </Link>
  );
}
