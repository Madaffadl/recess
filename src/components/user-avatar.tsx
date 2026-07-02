import { initials } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Neutral, anonymous avatar — initials on a quiet surface. No rainbow. */
export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-elevated text-[11px] font-semibold text-muted",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
