# Supabase

## Running migrations

Migrations live in `migrations/`. Run them **in order** in the Supabase Dashboard:

1. Open **SQL Editor** in the Supabase Dashboard
2. Click **New query**
3. Paste `migrations/0001_initial.sql` → **Run**
4. New query → paste `migrations/0002_game_core.sql` → **Run**
5. New query → paste `migrations/0003_connect_four.sql` → **Run**

### After running the migration

Enable Realtime for the new tables:
1. Go to **Database → Replication**
2. Toggle on **room** and **game_session** under `supabase_realtime`

(The `ALTER PUBLICATION` lines at the bottom of the migration do this automatically if your SQL user has the right permissions. If they error, do it via the UI instead.)

## Table overview

| Table | Purpose | Phase |
|---|---|---|
| `profile` | Anonymous user handle per Supabase auth user | A |
| `room` | Persistent room records; replaces in-memory context | 4 |
| `game_session` | Game state blob; streamed via Realtime Changes | 3 |

## Server-authoritative games

`game_session` has **no client write policy**. Clients can only read it (for
realtime board sync) and mutate it through the generic `SECURITY DEFINER` RPCs
in `0002_game_core.sql`:

| Function | Does |
|---|---|
| `game_join(room_key, game_id, handle)` | Create a game / take the open seat / spectate |
| `game_move(session, action)` | Submit a move — `action` is game-specific, e.g. `{"col":3}` |
| `game_rematch(session)` | Reset a finished game (previous non-starter goes first) |

Each function checks `auth.uid()` against the seated player, so a client cannot
move out of turn, play an illegal move, or forge an opponent's move.

### Adding a game

The core RPCs dispatch by `game_id` to two per-game functions:

- `_<game_id>_initial_state()` → the empty payload
- `_<game_id>_apply_move(game, action, player)` → `{result, game}` where
  `result ∈ continue|win|draw|illegal`

(hyphens in `game_id` become underscores — `connect-four` → `_connect_four_*`).

So a new game = **one migration** (`000N_<game>.sql`) defining those two
functions + **one client module** (`src/games/<game>/`) registered in
`src/games/registry.ts`. No changes to the core RPCs or the client plumbing.
See `0003_connect_four.sql` as the reference.

## Ephemeral vs persistent

- **Chat messages** — ephemeral (Broadcast only, never written to DB). Cheap, low-latency, zero storage.
- **Room presence** — ephemeral (Supabase Presence). Tracks who is online right now.
- **Room records** — Milestone A uses in-memory context (`lib/api/rooms.ts` mock). Phase 4 swaps to this table.
- **Game state** — Postgres JSONB + Realtime Changes. Phase 3.
