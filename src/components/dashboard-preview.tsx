import { Activity, DoorOpen, Gamepad2 } from "lucide-react";

import { ACTIVITY_SEED, POPULAR_GAMES, ROOMS } from "@/lib/data";
import { cn } from "@/lib/utils";

function ColumnHeader({
  icon: Icon,
  label,
  meta,
}: {
  icon: typeof Activity;
  label: string;
  meta: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon className="size-3.5" />
        <span className="terminal-badge uppercase tracking-wider">{label}</span>
      </div>
      <span className="terminal-badge text-subtle">{meta}</span>
    </div>
  );
}

export function DashboardPreview({ className }: { className?: string }) {
  const rooms = ROOMS.slice(0, 3);
  const games = POPULAR_GAMES.slice(0, 3);
  const activity = ACTIVITY_SEED.slice(0, 3);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card",
        className
      )}
    >
      {/* Window bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-white/10" />
          <span className="size-2.5 rounded-full bg-white/10" />
          <span className="size-2.5 rounded-full bg-white/10" />
        </div>
        <span className="terminal-badge text-subtle">recess / dashboard</span>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent" />
          <span className="terminal-badge text-muted">live</span>
        </div>
      </div>

      {/* Three quiet columns */}
      <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {/* Active rooms */}
        <div className="p-4">
          <ColumnHeader icon={DoorOpen} label="Rooms" meta={`${ROOMS.length}`} />
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li key={room.id} className="flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-elevated text-sm">
                  {room.gameEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {room.title}
                  </p>
                  <p className="terminal-badge text-subtle">
                    {room.participants.length}/{room.capacity} players
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Trending games */}
        <div className="p-4">
          <ColumnHeader icon={Gamepad2} label="Trending" meta="today" />
          <ul className="space-y-3">
            {games.map((game) => (
              <li key={game.id} className="flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-elevated text-sm">
                  {game.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{game.name}</p>
                  <p className="terminal-badge text-subtle">
                    {game.players} playing
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent activity */}
        <div className="p-4">
          <ColumnHeader icon={Activity} label="Activity" meta="now" />
          <ul className="space-y-3">
            {activity.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted/50" />
                <p className="text-[13px] leading-snug text-muted">
                  <span className="font-medium text-foreground">
                    {item.user}
                  </span>{" "}
                  {item.action}{" "}
                  <span className="text-foreground/80">{item.target}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
