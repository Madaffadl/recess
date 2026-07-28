"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
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
  SPOTLIGHT_GAME,
  type Game,
  type GameCategory,
} from "@/lib/data";
import { cn } from "@/lib/utils";

function FeaturedSpotlight({ game }: { game: Game }) {
  const s = game.spotlight!;
  const t = s.theme;
  const Icon = game.icon;
  return (
    <div
      className="mt-8 overflow-hidden rounded-2xl border"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8">
        {/* Icon */}
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-xl border text-4xl sm:size-20"
          style={{ background: t.pillBg, borderColor: t.border }}
        >
          {game.emoji}
        </div>

        {/* Copy */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded border px-2 py-0.5 font-mono text-[10px] tracking-widest"
              style={{ borderColor: `${t.accent}99`, color: t.accent }}
            >
              NEW RELEASE
            </span>
            <Icon className="size-3" style={{ color: t.border }} />
          </div>
          <h2
            className="mt-1.5 font-display text-xl font-semibold tracking-tight"
            style={{ color: t.heading }}
          >
            {game.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: t.body }}>
            {s.description ?? game.blurb}
          </p>

          {s.badges && s.badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    background: t.pillBg,
                    borderColor: t.pillBorder,
                    color: t.pillText,
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="shrink-0">
          <Button
            asChild
            className="font-mono tracking-widest"
            style={{
              background: t.accent,
              color: t.accentText ?? t.bg,
            }}
          >
            <Link href={s.href}>{s.cta}</Link>
          </Button>
        </div>
      </div>

      <div
        className="border-t px-6 py-2 font-mono text-[10px] tracking-widest"
        style={{ borderColor: `${t.footerBorder}4d`, color: t.footerText }}
      >
        {s.tagline}
      </div>
    </div>
  );
}

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

      {/* Featured spotlight — most recently added game with a spotlight config */}
      {SPOTLIGHT_GAME && <FeaturedSpotlight game={SPOTLIGHT_GAME} />}

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
