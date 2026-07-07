# 🎮 Recess

**Take a break. Stay connected.**

Recess is the digital break room for coworkers — one calm place to play quick
multiplayer games, drop into rooms, and chat anonymously during downtime.

The interface is **~70% modern SaaS, ~30% retro nostalgia** — think
_Linear · Notion · Arc · Discord_ with subtle retro personality expressed
through typography, not stickers.

## ✨ Design principles

- **Quiet, mature UI** — flat cards, generous whitespace, no floating decor or
  neon explosions.
- **Minimal color** — amber is reserved for the primary CTA and active nav;
  green is only for status. Everything else is neutral.
- **Retro through typography** — a pixel wordmark with a blinking terminal
  cursor, monospace "terminal" status badges, and a vintage amber/green palette.

## 🗺 Pages

| Route            | What it does                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| `/`              | Hero, a single clean dashboard preview, and the **Anonymous Lounge**    |
| `/discover`      | Browse games — search, category filters, popular / new / recently played |
| `/rooms`         | The main hangout — create, join by invite code, filter (public/private + category), and join rooms |
| `/rooms/[id]`    | Room detail — live game board, real-time chat, presence-driven participants, private invite gate, and activity feed |
| `/about`         | Story, mission, why it exists, FAQ, and a contact form                  |

Recess is built around three pillars — **Games, Rooms, and Anonymous Chat**.
Rooms are the main place coworkers interact.

**Anonymous Lounge** (the highlight): a messenger-style chat (WhatsApp / Discord
/ Slack feel) — left/right bubbles, consecutive-message grouping, a live typing
indicator, subtle timestamps, an online count, and a composer with an emoji
picker, enter-to-send, an auto-growing textarea, and a character limit. The same
chat powers each room.

## 🧱 Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui-style components (Radix primitives: dialog, accordion, tabs, …)
- [Motion](https://motion.dev) (Framer Motion) for restrained animation
- [lucide-react](https://lucide.dev) icons
- [Supabase](https://supabase.com) — Postgres, Realtime (Broadcast + Presence +
  Postgres Changes), and anonymous Auth

## 🎨 Palette

| Token       | Value                   |
| ----------- | ----------------------- |
| Background  | `#0B0D12`               |
| Card        | `#12151D`               |
| Border      | `rgba(255,255,255,0.08)`|
| Primary     | `#F59E0B` (amber)       |
| Accent      | `#22C55E` (green)       |
| Text        | `#F8FAFC` / `#94A3B8`   |

## 🚀 Getting started

```bash
npm install
npm run dev      # http://localhost:3000

npm run build    # production build
npm start        # serve the production build
npm run lint     # eslint
```

### Supabase (optional but recommended)

Rooms, live game state, presence, and realtime chat are backed by Supabase.
**Without it the app still runs** — it gracefully falls back to in-memory mock
rooms (guarded by `isSupabaseConfigured`) — but rooms won't persist and counts
won't be live across clients.

1. Create a Supabase project.
2. Copy `.env.example` → `.env.local` and fill in the two public values from
   **Project Settings → API**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
   ```
   Both are public (anon key) and safe in the browser — the database is
   protected by Row Level Security.
3. Run the migrations in order via the Dashboard **SQL Editor**
   (`supabase/migrations/0001…0008`, or run the consolidated
   `supabase/schema.sql` once). See [`supabase/README.md`](supabase/README.md).
4. Enable Realtime for the `room` and `game_session` tables under
   **Database → Replication**.

## 🌐 Backend architecture

The frontend degrades gracefully: every backend call is guarded so the UI works
with or without Supabase configured.

- **Chat & typing** — ephemeral **Broadcast** (never written to the DB).
- **Online count & participants** — ephemeral **Presence** (per-room and lounge).
- **Rooms** — persistent Postgres rows; the list stays live via **Postgres
  Changes** (INSERT for new rooms, UPDATE for occupancy/status).
- **Joins** — race-safe `SECURITY DEFINER` RPC (`room_join`) using a `FOR UPDATE`
  row lock for capacity checks; `room_leave` decrements occupancy.
- **Self-healing occupancy** — the count would drift up when clients crash, so
  the room's *leader* client reconciles `current_count` to the true presence
  count (`room_sync_count`), correcting the drift.
- **Private rooms** — 8-char invite codes (`room_by_invite` RPC); the code is
  never shipped in the public room list, only to the creator's session or a
  validated `?invite=` link.
- **Host controls** — the creator is pinned by `host_id` (stable auth id, not
  the display handle). The host can **close** the room (enforced by `room_close`,
  keyed on `auth.uid()`) or **kick** a participant (advisory presence broadcast).
- **Games** — server-authoritative state via generic `SECURITY DEFINER` RPCs
  (`game_join` / `game_move` / `game_rematch`); the board syncs over Realtime.
  Adding a game = one migration + one client module registered in
  `src/games/registry.ts`.
- **Auth** — anonymous Supabase sessions; realtime channels reconnect with
  exponential backoff.

## 🗂 Structure

```
src/
├── app/
│   ├── layout.tsx            # fonts, metadata, shared shell (nav + footer)
│   ├── page.tsx              # homepage (65/35 grid)
│   ├── globals.css           # design tokens + quiet utilities
│   ├── discover/page.tsx
│   ├── rooms/                # rooms-context, list page, [id] detail
│   └── about/page.tsx
├── components/
│   ├── navbar.tsx            # sticky, route-aware
│   ├── hero.tsx              # headline + CTAs + dashboard preview
│   ├── dashboard-preview.tsx # single Arc-style preview card
│   ├── anonymous-lounge.tsx  # ⭐ the always-on anonymous chat sidebar
│   ├── chat-message.tsx · chat-composer.tsx  # messenger-style chat pieces
│   ├── game-card.tsx · room-card.tsx · page-shell.tsx · logo.tsx …
│   └── ui/                   # shadcn/ui base components
├── games/                    # pluggable game engines
│   ├── registry.ts           # game_id → client module
│   ├── use-game-session.ts   # realtime board state hook
│   └── connect-four/         # reference game (board · logic)
├── hooks/
│   ├── use-lounge.ts         # lounge chat channel (Broadcast + backoff)
│   ├── use-room.ts           # per-room chat, presence, activity
│   ├── use-online-count.ts   # Presence-based online count
│   └── use-count-up.ts
└── lib/
    ├── data.ts               # static seed data + helpers
    ├── utils.ts              # cn()
    ├── api/                  # rooms + anonymous session (Supabase)
    └── supabase/client.ts    # browser client + isSupabaseConfigured

supabase/
├── migrations/               # 0001…0008 — run in order (SQL Editor)
├── schema.sql                # consolidated snapshot (fresh-setup baseline)
└── README.md                 # schema + RPC reference
```

> With Supabase configured, rooms, game state, presence, and chat are backed by
> a real Postgres + Realtime backend. Without it, the app falls back to
> in-memory mock data so the UI stays fully explorable with no backend required.
