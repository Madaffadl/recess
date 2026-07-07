# Supabase

## Running migrations

Migrations live in `migrations/`. Run them **in order** in the Supabase Dashboard:

1. Open **SQL Editor** in the Supabase Dashboard
2. Click **New query**
3. Paste `migrations/0001_initial.sql` → **Run**
4. New query → paste `migrations/0002_game_core.sql` → **Run**
5. New query → paste `migrations/0003_connect_four.sql` → **Run**
6. New query → paste `migrations/0004_room_game_id.sql` → **Run**
7. New query → paste `migrations/0005_room_phase4.sql` → **Run**
8. New query → paste `migrations/0006_room_reconcile_host.sql` → **Run**
9. New query → paste `migrations/0007_room_indexes.sql` → **Run**
10. New query → paste `migrations/0008_room_rls_hardening.sql` → **Run**

Each migration is idempotent (`if not exists` / `create or replace`), so
re-running one is a safe no-op if you're unsure whether it already applied.

> **Fresh setup?** [`../supabase/schema.sql`](schema.sql) is a consolidated
> snapshot of the full schema (all migrations folded in) — run it once on an
> empty project instead of the numbered files. The numbered `migrations/` stay
> the source of truth and history.

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

## Room system (Phase 4)

`room` gains `invite_code` and `current_count` in `0005_room_phase4.sql`, plus
`SECURITY DEFINER` RPCs so occupancy is maintained server-side (clients never
write the count directly):

| Function | Does |
|---|---|
| `room_join(p_slug)` | Race-safe join — `FOR UPDATE` row lock, capacity check, increments `current_count`. Returns `{"ok":true}` or `{"error":"not_found"\|"expired"\|"full"}` |
| `room_leave(p_slug)` | Decrements occupancy (floored at 0) and reopens status when it drops below capacity |
| `room_by_invite(p_code)` | Case-insensitive invite-code lookup; only returns a non-expired room |

Invite codes are unique (partial index on non-empty codes) and are **never**
included in the public room list query — they reach a client only via
`room_by_invite` (an explicit code lookup) or the creator's own session.

### Occupancy reconciliation + host controls (`0006`)

`current_count` is maintained optimistically by join/leave, so it **drifts up**
when a client disconnects without leaving cleanly (crash, closed laptop, dropped
network). Presence knows who is actually connected, so the room's *leader*
client (lowest presence key) periodically pushes the true count back:

| Function | Does |
|---|---|
| `room_sync_count(p_slug, p_count)` | Reconciles `current_count` to the live presence count (clamped `0..capacity`); a no-op when unchanged, so it's cheap to call on every presence change |
| `room_close(p_slug)` | **Host-only** — sets status `closed`. Returns `{"ok":true}` or `{"error":"not_found"\|"forbidden"}` |

`0006` also adds `host_id uuid default auth.uid()` so the creator is identified
by their **stable** anonymous auth id rather than the re-randomised
`host_handle`. Host controls key off `auth.uid() = host_id`:

- **Close room** — enforced server-side by `room_close`; closed rooms drop out
  of the list (`getRooms` filters `status <> 'closed'`) and a `room_closed`
  broadcast navigates present clients away.
- **Kick** — advisory: the host broadcasts a `kick` targeting a specific
  **presence key**, and that tab removes itself. (Presence has no per-peer
  server enforcement, so this relies on the client cooperating.)

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
- **Room presence** — ephemeral (Supabase Presence). Tracks who is online right now, and drives the per-room participant list + activity feed.
- **Room records** — persistent in the `room` table; the list stays live via Postgres Changes (INSERT/UPDATE). When Supabase isn't configured, `lib/api/rooms.ts` falls back to in-memory mock data.
- **Game state** — Postgres JSONB + Realtime Changes. Phase 3.
