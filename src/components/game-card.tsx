import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isPlayable } from "@/games/registry";
import type { Game } from "@/lib/data";

export function GameCard({ game }: { game: Game }) {
  const playable = isPlayable(game.id);

  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-elevated text-2xl">
          {game.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-[15px] font-semibold tracking-tight">
              {game.name}
            </h3>
            {game.isNew && <Badge variant="accent">new</Badge>}
          </div>
          <p className="terminal-badge mt-1 text-subtle">
            {game.category} · {game.players} playing
          </p>
        </div>
      </div>

      <p className="mt-3.5 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">
        {game.blurb}
      </p>

      {playable ? (
        <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
          <Link href={`/rooms?game=${game.id}`}>Play</Link>
        </Button>
      ) : (
        <Button variant="secondary" size="sm" className="mt-4 w-full" disabled>
          Coming soon
        </Button>
      )}
    </div>
  );
}
