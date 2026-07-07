import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { Room } from "@/lib/data";

function StatusDot({ status }: { status: Room["status"] }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex size-1.5">
        {status === "live" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
      </span>
      <span className="terminal-badge text-muted">{status}</span>
    </span>
  );
}

export function RoomCard({ room }: { room: Room }) {
  // Prefer live DB count; fall back to static participants array for mock rooms.
  const liveCount = room.currentCount ?? room.participants.length;
  const shown = room.participants.slice(0, 4);
  const extra = liveCount - shown.length;

  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border-strong">
      {/* Room name · game type · status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-elevated text-xl">
            {room.gameEmoji}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display text-[15px] font-semibold tracking-tight">
              {room.title}
            </h3>
            <p className="terminal-badge mt-0.5 text-subtle">
              {room.gameName} · {room.category}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {room.visibility === "private" && (
            <Lock className="size-3.5 text-subtle" />
          )}
          <StatusDot status={room.status} />
        </div>
      </div>

      {/* Active users · capacity · Join */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {shown.length > 0 ? (
            <div className="flex -space-x-2">
              {shown.map((p) => (
                <UserAvatar key={p} name={p} className="size-7 ring-2 ring-card" />
              ))}
              {extra > 0 && (
                <span className="grid size-7 place-items-center rounded-lg border border-border bg-elevated text-[10px] font-medium text-muted ring-2 ring-card">
                  +{extra}
                </span>
              )}
            </div>
          ) : (
            // DB room — show numeric count only (no handle list in DB)
            <span className="flex size-7 items-center justify-center rounded-lg border border-border bg-elevated text-[11px] font-semibold text-muted">
              {liveCount}
            </span>
          )}
          <span className="text-xs text-muted">
            <span className="font-semibold text-foreground">{liveCount}</span>/
            {room.capacity}
          </span>
        </div>

        <Button asChild size="sm" variant="secondary">
          <Link href={`/rooms/${room.id}`}>Join</Link>
        </Button>
      </div>
    </div>
  );
}
