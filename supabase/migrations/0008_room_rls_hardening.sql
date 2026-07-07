-- ============================================================
-- Recess — Phase 4.3: room RLS hardening
--
-- All room writes now flow through SECURITY DEFINER RPCs
-- (room_join / room_leave / room_sync_count / room_close), which run as the
-- function owner and bypass RLS. The broad client UPDATE policy from 0001 is
-- therefore unused — and lets any signed-in user mutate any room, which the
-- RPCs were built to prevent. Drop it.
--
-- Also fold the two permissive SELECT policies into one (they were OR'd
-- anyway) for a single, clearer rule.
-- ============================================================

-- Remove the overly-permissive direct UPDATE path.
drop policy if exists "authenticated users can update rooms" on public.room;

-- Consolidate SELECT: public rooms are visible to everyone; any signed-in
-- (incl. anonymous) user can see all rooms.
drop policy if exists "public rooms are readable by all"      on public.room;
drop policy if exists "authenticated users can read all rooms" on public.room;

create policy "rooms are readable"
  on public.room for select
  using (visibility = 'public' or auth.uid() is not null);

-- INSERT policy from 0001 ("authenticated users can create rooms") is kept:
-- createRoom() inserts directly, and host_id defaults to auth.uid().
