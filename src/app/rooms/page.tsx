"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SearchX } from "lucide-react";

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
import { GAMES, GAME_CATEGORIES, type Room } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useRooms } from "./rooms-context";

function CreateRoomDialog() {
  const { addRoom } = useRooms();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [gameId, setGameId] = useState(GAMES[0].id);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [capacity, setCapacity] = useState(8);

  const create = () => {
    const clean = title.trim();
    if (!clean) return;
    const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0];
    const room: Room = {
      id: `custom-${Date.now()}`,
      title: clean,
      gameId: game.id,
      gameName: game.name,
      gameEmoji: game.emoji,
      host: "You",
      participants: ["You"],
      capacity,
      visibility,
      category: game.category,
      status: "open",
    };
    addRoom(room);
    setOpen(false);
    setTitle("");
    router.push(`/rooms/${room.id}`);
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
          <Button onClick={create} disabled={!title.trim()}>
            Create room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RoomsPage() {
  const { rooms } = useRooms();
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [category, setCategory] = useState("All");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (visibility === "all" || r.visibility === visibility) &&
          (category === "All" || r.category === category) &&
          (q === "" ||
            r.title.toLowerCase().includes(q) ||
            r.gameName.toLowerCase().includes(q))
      ),
    [rooms, q, visibility, category]
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="rooms"
        title="Where coworkers hang out"
        description="The main place to meet on Recess — hop into a public room, spin up a private one for your team, and play together."
        actions={<CreateRoomDialog />}
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
