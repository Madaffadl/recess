"use client";

import { useMemo, useState } from "react";
import { Search, SearchX, Shield } from "lucide-react";
import Link from "next/link";

import { PageHeader, PageShell } from "@/components/page-shell";
import { GameCard } from "@/components/game-card";
import { Button } from "@/components/ui/button";
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

  const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const filtering = q !== "" || category !== "All";

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const results = useMemo(
    () =>
      GAMES.filter(
        (g) =>
          (category === "All" || g.category === category) &&
          (q === "" ||
            normalize(g.name).includes(q) ||
            normalize(g.blurb).includes(q) ||
            normalize(g.category).includes(q) ||
            g.id.replace(/-/g, " ").includes(q))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, category]
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="discover"
        title="Find your next game"
        description="Browse everything you can play on your break. Search, filter by category, or pick up where you left off."
      />

      {/* Featured spotlight — Military Zone */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-[#0F3050] bg-[#050F1C]">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8">
          {/* Icon */}
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-[#0F3050] bg-[#091828] text-4xl sm:size-20">
            🎖️
          </div>

          {/* Copy */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-[#00E59A]/60 px-2 py-0.5 font-mono text-[10px] tracking-widest text-[#00E59A]">
                NEW RELEASE
              </span>
              <Shield className="size-3 text-[#2A6090]" />
            </div>
            <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight text-[#8FBCD4]">
              Military Zone
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#2A6090]">
              A two-player naval strategy game. Hide your fleet on a 10×10 grid,
              then hunt down every enemy vessel before they find yours.
              10 seconds per salvo — no hesitation allowed.
            </p>

            {/* Ship legend */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["CARRIER", "BATTLESHIP", "DESTROYER", "SUBMARINE", "PATROL"].map((name) => (
                <span
                  key={name}
                  className="rounded border border-[#0F3050] bg-[#091828] px-1.5 py-0.5 font-mono text-[10px] text-[#8FBCD4]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="shrink-0">
            <Button
              asChild
              className="font-mono tracking-widest text-[#050F1C]"
              style={{ background: "#00E59A" }}
            >
              <Link href="/rooms?game=military-zone">DEPLOY →</Link>
            </Button>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="border-t border-[#0F3050]/30 px-6 py-2 font-mono text-[10px] tracking-widest text-[#2A6090]">
          NAVAL STRATEGY · 2 PLAYERS · LIVE MULTIPLAYER · 10s PER SALVO
        </div>
      </div>

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
