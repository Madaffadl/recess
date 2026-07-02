"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";

import { PageHeader, PageShell } from "@/components/page-shell";
import { GameCard } from "@/components/game-card";
import { Input } from "@/components/ui/input";
import {
  GAMES,
  GAME_CATEGORIES,
  NEW_GAMES,
  POPULAR_GAMES,
  RECENTLY_PLAYED,
  type Game,
  type GameCategory,
} from "@/lib/data";
import { cn } from "@/lib/utils";

function GameGrid({ games }: { games: Game[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </div>
  );
}

function SubHeading({
  children,
  count,
}: {
  children: React.ReactNode;
  count: number;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {children}
      </h2>
      <span className="terminal-badge text-subtle">{count}</span>
    </div>
  );
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GameCategory>("All");

  const q = query.trim().toLowerCase();
  const filtering = q !== "" || category !== "All";

  const results = useMemo(
    () =>
      GAMES.filter(
        (g) =>
          (category === "All" || g.category === category) &&
          (q === "" ||
            g.name.toLowerCase().includes(q) ||
            g.blurb.toLowerCase().includes(q) ||
            g.category.toLowerCase().includes(q))
      ),
    [q, category]
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="discover"
        title="Find your next game"
        description="Browse everything you can play on your break. Search, filter by category, or pick up where you left off."
      />

      {/* Search + categories */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games…"
            className="h-11 pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {GAME_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                category === cat
                  ? "border-primary/40 bg-primary/10 text-amber-200"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mt-12 space-y-14">
        {filtering ? (
          results.length > 0 ? (
            <section>
              <SubHeading count={results.length}>Results</SubHeading>
              <GameGrid games={results} />
            </section>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
              <SearchX className="size-7 text-subtle" />
              <p className="mt-4 font-display text-lg font-medium">
                No games match your search
              </p>
              <p className="mt-1 text-sm text-muted">
                Try a different keyword or category.
              </p>
            </div>
          )
        ) : (
          <>
            <section>
              <SubHeading count={POPULAR_GAMES.length}>
                Popular this week
              </SubHeading>
              <GameGrid games={POPULAR_GAMES} />
            </section>
            <section>
              <SubHeading count={NEW_GAMES.length}>New arrivals</SubHeading>
              <GameGrid games={NEW_GAMES} />
            </section>
            <section>
              <SubHeading count={RECENTLY_PLAYED.length}>
                Recently played
              </SubHeading>
              <GameGrid games={RECENTLY_PLAYED} />
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
