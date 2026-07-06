import { Gamepad2 } from "lucide-react";

/**
 * Placeholder shown in a room whose game isn't playable yet. Keeps the room
 * useful (chat still works) and honest about what's live.
 */
export function GameComingSoon({
  gameName,
  gameEmoji,
}: {
  gameName: string;
  gameEmoji: string;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl p-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-border bg-elevated text-3xl">
        {gameEmoji}
      </span>
      <div>
        <h2 className="font-display text-[15px] font-semibold tracking-tight">
          {gameName}
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-muted">
          <Gamepad2 className="size-3.5" />
          Coming soon
        </p>
      </div>
      <p className="max-w-xs text-[13px] leading-relaxed text-subtle">
        This game isn&apos;t playable yet. Hang out and chat while you wait —
        Connect Four rooms are live now.
      </p>
    </div>
  );
}
