# Supabase

## Running migrations

Migrations live in `migrations/`. Run them manually in the Supabase Dashboard:

1. Open **SQL Editor** in the Supabase Dashboard
2. Click **New query**
3. Paste the contents of `migrations/0001_initial.sql`
4. Click **Run**

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

## Ephemeral vs persistent

- **Chat messages** — ephemeral (Broadcast only, never written to DB). Cheap, low-latency, zero storage.
- **Room presence** — ephemeral (Supabase Presence). Tracks who is online right now.
- **Room records** — Milestone A uses in-memory context (`lib/api/rooms.ts` mock). Phase 4 swaps to this table.
- **Game state** — Postgres JSONB + Realtime Changes. Phase 3.
