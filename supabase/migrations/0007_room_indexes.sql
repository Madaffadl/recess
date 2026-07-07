-- ============================================================
-- Recess — Phase 4.2: query efficiency
--
-- Additive, safe to run on an existing database.
--   • functional invite-code index (was unused → seq scan)
--   • partial index backing the active-room list query
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Case-insensitive invite lookup
--
-- 0005 indexed `invite_code` verbatim, but room_by_invite matches on
-- `upper(invite_code)`, so the planner couldn't use that index (a seq scan on
-- every join-by-code) and case-only duplicates ('ABCD1234' vs 'abcd1234')
-- slipped past uniqueness. Replace it with a functional unique index on the
-- normalized code, which both backs the lookup and enforces real uniqueness.
-- ─────────────────────────────────────────────────────────────
drop index if exists public.room_invite_code_idx;

create unique index if not exists room_invite_code_key
  on public.room (upper(invite_code))
  where invite_code <> '';

-- ─────────────────────────────────────────────────────────────
-- 2) Active room list
--
-- getRooms() runs `where expires_at > now() and status <> 'closed'
-- order by created_at desc` on every visit to /rooms. This partial index
-- skips closed rooms and pre-orders by recency, backing both the filter and
-- the sort (expires_at is then a cheap residual check).
-- ─────────────────────────────────────────────────────────────
create index if not exists room_active_list_idx
  on public.room (created_at desc)
  where status <> 'closed';
