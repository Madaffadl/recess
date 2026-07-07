-- Add game_id to room so the client can look up the game module from the registry.
-- The column is nullable for rows created before this migration.
alter table public.room
  add column if not exists game_id text not null default '';
