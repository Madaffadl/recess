-- ============================================================
-- Recess — Schema v1  (Milestone A)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Tables:   profile · room · game_session
-- Realtime: enable via Dashboard → Database → Replication
--           (add room + game_session to the publication)
-- ============================================================

-- UUID helper (already enabled in Supabase by default, but safe to re-run)
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- profile
-- One row per anonymous Supabase auth user.
-- Stores the handle the user picked for their session.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profile (
  id          uuid        primary key references auth.users (id) on delete cascade,
  handle      text        not null,
  created_at  timestamptz not null default now()
);

alter table public.profile enable row level security;

-- Anyone can read handles (shown in chat/presence)
create policy "profiles are publicly readable"
  on public.profile for select
  using (true);

-- Users can only write their own profile
create policy "users manage own profile"
  on public.profile for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────
-- room
-- Ephemeral rooms — expires_at drives cleanup.
-- Rooms created in the UI are ephemeral for Milestone A;
-- in Phase 4 this table becomes the source of truth.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.room (
  id           uuid        primary key default uuid_generate_v4(),
  slug         text        unique not null,
  title        text        not null,
  game_name    text        not null,
  game_emoji   text        not null default '🎮',
  host_handle  text        not null,
  capacity     int         not null default 8
                           check (capacity between 2 and 20),
  visibility   text        not null default 'public'
                           check (visibility in ('public', 'private')),
  category     text        not null,
  status       text        not null default 'open'
                           check (status in ('open', 'filling up', 'live')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '4 hours')
);

alter table public.room enable row level security;

-- Public rooms visible to everyone; private rooms only to authed users
create policy "public rooms are readable by all"
  on public.room for select
  using (visibility = 'public');

create policy "authenticated users can read all rooms"
  on public.room for select
  using (auth.uid() is not null);

-- Any authenticated (including anon) user can create a room
create policy "authenticated users can create rooms"
  on public.room for insert
  with check (auth.uid() is not null);

-- Any authenticated user can update status/capacity (host control in Phase 4)
create policy "authenticated users can update rooms"
  on public.room for update
  using (auth.uid() is not null);

-- ─────────────────────────────────────────────────────────────
-- game_session
-- Created when a game starts inside a room.
-- `state` is a JSONB blob — schema is game-specific (Phase 3).
-- Realtime Changes on this table power the live game board.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.game_session (
  id          uuid        primary key default uuid_generate_v4(),
  room_id     uuid        not null references public.room (id) on delete cascade,
  game_id     text        not null,
  state       jsonb       not null default '{}',
  status      text        not null default 'waiting'
                          check (status in ('waiting', 'active', 'finished')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.game_session enable row level security;

create policy "game sessions readable by authenticated users"
  on public.game_session for select
  using (auth.uid() is not null);

create policy "authenticated users can create game sessions"
  on public.game_session for insert
  with check (auth.uid() is not null);

create policy "authenticated users can update game sessions"
  on public.game_session for update
  using (auth.uid() is not null);

-- Auto-bump updated_at on every state change
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger game_session_updated_at
  before update on public.game_session
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Realtime publication
-- Add room + game_session so Postgres Changes stream to clients.
-- ─────────────────────────────────────────────────────────────
-- NOTE: run this AFTER the tables above are created.
-- If the publication already exists (it does in Supabase projects),
-- just add the tables:
alter publication supabase_realtime add table public.room;
alter publication supabase_realtime add table public.game_session;
