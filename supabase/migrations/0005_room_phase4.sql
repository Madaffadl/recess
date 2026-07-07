-- ============================================================
-- Recess — Phase 4: Room System
--
-- Adds:
--   • invite_code  — shareable code for private (and public) rooms
--   • current_count — live occupancy, maintained by RPCs
--   • room_join     — race-safe capacity-checked join
--   • room_leave    — decrement occupancy
--   • room_by_invite — look up a room by its invite code
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Schema additions
-- ─────────────────────────────────────────────────────────────

alter table public.room
  add column if not exists invite_code text not null default '',
  add column if not exists current_count int not null default 0
    check (current_count >= 0);

-- Enforce uniqueness only for non-empty codes (existing rows have '').
create unique index if not exists room_invite_code_idx
  on public.room (invite_code)
  where invite_code <> '';

-- ─────────────────────────────────────────────────────────────
-- room_join — race-safe, capacity-checked
-- Returns: {"ok":true} | {"error":"not_found"|"expired"|"full"}
-- ─────────────────────────────────────────────────────────────
create or replace function public.room_join(p_slug text)
returns jsonb language plpgsql security definer as $$
declare
  v_room public.room;
begin
  -- Row-level lock prevents two concurrent joins from both seeing count < capacity.
  select * into v_room from public.room where slug = p_slug for update;

  if not found then
    return '{"error":"not_found"}'::jsonb;
  end if;

  if v_room.expires_at < now() then
    return '{"error":"expired"}'::jsonb;
  end if;

  if v_room.current_count >= v_room.capacity then
    return '{"error":"full"}'::jsonb;
  end if;

  update public.room
  set
    current_count = current_count + 1,
    status = case
      when current_count + 1 >= capacity then 'filling up'
      else status
    end
  where slug = p_slug;

  return '{"ok":true}'::jsonb;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- room_leave — decrement occupancy (fire-and-forget safe)
-- ─────────────────────────────────────────────────────────────
create or replace function public.room_leave(p_slug text)
returns void language plpgsql security definer as $$
begin
  update public.room
  set
    current_count = greatest(0, current_count - 1),
    status = case
      when status = 'filling up' and current_count - 1 < capacity then 'open'
      else status
    end
  where slug = p_slug;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- room_by_invite — resolve invite code → room
-- Case-insensitive; only returns non-expired rooms.
-- ─────────────────────────────────────────────────────────────
create or replace function public.room_by_invite(p_code text)
returns setof public.room language sql security definer stable as $$
  select * from public.room
  where upper(invite_code) = upper(p_code)
    and invite_code <> ''
    and expires_at > now()
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- Grants (anon = signed-in anonymously via Supabase Auth)
-- ─────────────────────────────────────────────────────────────
grant execute on function public.room_join(text)       to authenticated, anon;
grant execute on function public.room_leave(text)      to authenticated, anon;
grant execute on function public.room_by_invite(text)  to authenticated, anon;
