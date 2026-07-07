"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hash, Plus, SearchX } from "lucide-react";

import { PageHeader, PageShell } from "@/components/page-shell";
import { RoomCard } from "@/components/room-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GAMES, GAME_CATEGORIES, randomHandle } from "@/lib/data";
import { cn } from "@/lib/utils";
import { createRoom, getRoomByInviteCode } from "@/lib/api/rooms";
import { useRooms } from "./rooms-context";

function JoinByCodeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const join = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean || joining) return;
    setJoining(true);
    setError(null);
    try {
      const room = await getRoomByInviteCode(clean);
      if (!room) {
        setError("Invalid or expired invite code.");
        return;
      }
      setOpen(false);
      setCode("");
      router.push(`/rooms/${room.id}?invite=${clean}`);
    } finally {
      setJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCode(""); setError(null); } }}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Hash />
          Join by code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join with invite code</DialogTitle>
          <DialogDescription>
            Enter the code shared by your teammate to join their room.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-code">Invite code</Label>
          <Input
            id="invite-code"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="e.g. A3BX9YZK"
            className="font-mono tracking-widest"
            maxLength={16}
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={join} disabled={!code.trim() || joining}>
            {joining ? "Looking up…" : "Join room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateRoomDialog() {
  const { addRoom } = useRooms();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [gameId, setGameId] = useState(GAMES[0].id);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [capacity, setCapacity] = useState(8);
  const [creating, setCreating] = useState(false);
  const [host] = useState<string>(() => randomHandle());

  const create = async () => {
    const clean = title.trim();
    if (!clean || creating) return;
    const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
    setCreating(true);
    try {
      const room = await createRoom({
        title: clean,
        gameId: game.id,
        gameName: game.name,
        gameEmoji: game.emoji,
        host,
        capacity,
        visibility,
        category: game.category,
      });
      addRoom(room);
      setOpen(false);
      setTitle("");
      router.push(`/rooms/${room.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Create room
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a room</DialogTitle>
          <DialogDescription>
            Set it up, invite the team, and start playing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="room-title">Room name</Label>
            <Input
              id="room-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Friday Geo Marathon"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="room-game">Game</Label>
            <select
              id="room-game"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-foreground outline-none focus-visible:border-primary/50"
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id} className="bg-elevated">
                  {g.emoji} {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Visibility</Label>
              <div className="flex rounded-xl border border-border bg-card p-1">
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                      visibility === v
                        ? "bg-elevated text-foreground"
                        : "text-muted hover:text-foreground"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="room-capacity">Max players</Label>
              <Input
                id="room-capacity"
                type="number"
                min={2}
                max={20}
                value={capacity}
                onChange={(e) =>
                  setCapacity(
                    Math.max(2, Math.min(20, Number(e.target.value) || 2))
                  )
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={create} disabled={!title.trim() || creating}>
            {creating ? "Creating…" : "Create room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomsPageContent() {
  const { rooms } = useRooms();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [category, setCategory] = useState("All");

  // Pre-filter by game when arriving from a GameCard link. Sync the category
  // chip during render (React's "adjust state from a previous value" pattern)
  // rather than in an effect, so it doesn't trigger a cascading re-render.
  const gameFilter = searchParams.get("game");
  const [syncedGame, setSyncedGame] = useState<string | null>(null);
  if (gameFilter !== syncedGame) {
    setSyncedGame(gameFilter);
    const game = gameFilter ? GAMES.find((g) => g.id === gameFilter) : undefined;
    if (game) setCategory(game.category);
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (visibility === "all" || r.visibility === visibility) &&
          (category === "All" || r.category === category) &&
          (!gameFilter || r.gameId === gameFilter) &&
          (q === "" ||
            r.title.toLowerCase().includes(q) ||
            r.gameName.toLowerCase().includes(q))
      ),
    [rooms, q, visibility, category, gameFilter]
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="rooms"
        title="Where coworkers hang out"
        description="The main place to meet on Recess — hop into a public room, spin up a private one for your team, and play together."
        actions={
          <div className="flex gap-2">
            <JoinByCodeDialog />
            <CreateRoomDialog />
          </div>
        }
      />

      {/* Filters */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rooms…"
          className="h-11 lg:max-w-xs"
        />
        <Tabs value={visibility} onValueChange={setVisibility}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="public">Public</TabsTrigger>
            <TabsTrigger value="private">Private</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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

      {/* Rooms */}
      <div className="mt-10">
        {filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
            <SearchX className="size-7 text-subtle" />
            <p className="mt-4 font-display text-lg font-medium">
              No rooms here yet
            </p>
            <p className="mt-1 text-sm text-muted">
              Adjust your filters, or start a room of your own.
            </p>
            <div className="mt-5">
              <CreateRoomDialog />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

// useSearchParams() requires a Suspense boundary so the static shell can be
// prerendered while the query-string-dependent content renders on the client.
export default function RoomsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageHeader
            eyebrow="rooms"
            title="Where coworkers hang out"
            description="The main place to meet on Recess — hop into a public room, spin up a private one for your team, and play together."
          />
        </PageShell>
      }
    >
      <RoomsPageContent />
    </Suspense>
  );
}
