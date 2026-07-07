-- ============================================================
-- Recess — Phase 4.1: occupancy reconciliation + host controls
--
-- Adds:
--   • host_id        — stable creator identity (auth.uid), for host controls
--   • status 'closed' — a host can retire a room
--   • room_sync_count — heal current_count drift from the live presence count
--   • room_close      — host-only: mark a room closed
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Host identity
-- `host_handle` is only a display name (and is re-randomised per session),
-- so it can't be trusted for authorization. `host_id` pins the room to the
-- creator's stable anonymous auth user. New rooms are stamped automatically
-- from the caller's JWT via the column default.
-- ─────────────────────────────────────────────────────────────
alter table public.room
  add column if not exists host_id uuid
    references auth.users (id) on delete set null;

alter table public.room
  alter column host_id set default auth.uid();

-- ─────────────────────────────────────────────────────────────
-- Allow a 'closed' status (rebuild the single-column status check).
-- The inline check from 0001 is named room_status_check by Postgres.
-- ─────────────────────────────────────────────────────────────
alter table public.room
  drop constraint if exists room_status_check;

alter table public.room
  add constraint room_status_check
  check (status in ('open', 'filling up', 'live', 'closed'));

-- ─────────────────────────────────────────────────────────────
-- room_sync_count — reconcile occupancy to the true presence count
--
-- current_count is maintained optimistically by room_join/room_leave, which
-- drifts up when a client disconnects without leaving cleanly (crash, closed
-- laptop, dropped network). Presence knows who is actually connected, so the
-- room's "leader" client periodically pushes that count here to self-heal.
-- The write is a no-op when nothing changed, so it's cheap to call often.
-- ─────────────────────────────────────────────────────────────
create or replace function public.room_sync_count(p_slug text, p_count int)
returns void language plpgsql security definer as $$
declare
  v_cap        int;
  v_status     text;
  v_target     int;
  v_new_status text;
begin
  select capacity, status into v_cap, v_status
  from public.room where slug = p_slug;

  -- Never resurrect a closed room or one that no longer exists.
  if not found or v_status = 'closed' then
    return;
  end if;

  v_target := greatest(0, least(p_count, v_cap));
  v_new_status := case
    when v_status = 'live'          then 'live'            -- game in progress, leave it
    when v_target >= v_cap          then 'filling up'
    when v_status = 'filling up'    then 'open'            -- dropped back below capacity
    else v_status
  end;

  update public.room
  set current_count = v_target,
      status        = v_new_status
  where slug = p_slug
    and (current_count is distinct from v_target
         or status is distinct from v_new_status);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- room_close — host-only
-- Returns: {"ok":true} | {"error":"not_found"|"forbidden"}
-- ─────────────────────────────────────────────────────────────
create or replace function public.room_close(p_slug text)
returns jsonb language plpgsql security definer as $$
declare
  v_host uuid;
begin
  select host_id into v_host from public.room where slug = p_slug;

  if not found then
    return '{"error":"not_found"}'::jsonb;
  end if;

  -- Only the room's creator may close it.
  if v_host is null or v_host <> auth.uid() then
    return '{"error":"forbidden"}'::jsonb;
  end if;

  update public.room set status = 'closed' where slug = p_slug;
  return '{"ok":true}'::jsonb;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Grants (anon = signed-in anonymously via Supabase Auth)
-- ─────────────────────────────────────────────────────────────
grant execute on function public.room_sync_count(text, int) to authenticated, anon;
grant execute on function public.room_close(text)           to authenticated, anon;
