-- ============================================================
-- Recess — full schema snapshot
--
-- This is a CONSOLIDATED, readable view of the current database, folding in
-- every migration (0001–0008): the final column set, indexes, RLS policies,
-- and functions.
--
-- • The numbered files in `migrations/` remain the source of truth and the
--   append-only history. This file is a convenience baseline for fresh setups
--   and onboarding.
-- • The authoritative way to regenerate it from a live database is
--   `supabase db dump --schema public` (or `pg_dump --schema-only`).
-- • Safe to run top-to-bottom on an EMPTY project. On an existing database the
--   publication lines at the bottom may error ("already a member") — that's
--   expected; add the tables via Dashboard → Database → Replication instead.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- profile — one row per anonymous auth user
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profile (
  id          uuid        primary key references auth.users (id) on delete cascade,
  handle      text        not null,
  created_at  timestamptz not null default now()
);

alter table public.profile enable row level security;

create policy "profiles are publicly readable"
  on public.profile for select
  using (true);

create policy "users manage own profile"
  on public.profile for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────
-- room — persistent, ephemeral (expires_at drives cleanup)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.room (
  id            uuid        primary key default uuid_generate_v4(),
  slug          text        unique not null,
  title         text        not null,
  game_name     text        not null,
  game_emoji    text        not null default '🎮',
  host_handle   text        not null,
  capacity      int         not null default 8
                            check (capacity between 2 and 20),
  visibility    text        not null default 'public'
                            check (visibility in ('public', 'private')),
  category      text        not null,
  status        text        not null default 'open'
                            check (status in ('open', 'filling up', 'live', 'closed')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '4 hours'),
  game_id       text        not null default '',
  invite_code   text        not null default '',
  current_count int         not null default 0
                            check (current_count >= 0),
  -- Stable creator identity for host controls (not the display handle).
  host_id       uuid        default auth.uid()
                            references auth.users (id) on delete set null
);

-- Case-insensitive uniqueness for non-empty invite codes; also backs the
-- upper(invite_code) lookup in room_by_invite.
create unique index if not exists room_invite_code_key
  on public.room (upper(invite_code))
  where invite_code <> '';

-- Backs getRooms(): active rooms ordered by recency.
create index if not exists room_active_list_idx
  on public.room (created_at desc)
  where status <> 'closed';

alter table public.room enable row level security;

-- Public rooms visible to all; any signed-in (incl. anon) user sees all rooms.
create policy "rooms are readable"
  on public.room for select
  using (visibility = 'public' or auth.uid() is not null);

-- Any authenticated (incl. anon) user can create a room. host_id is stamped
-- from the JWT via the column default.
create policy "authenticated users can create rooms"
  on public.room for insert
  with check (auth.uid() is not null);

-- NOTE: there is intentionally NO client UPDATE/DELETE policy on room. All
-- mutations go through the SECURITY DEFINER RPCs below.

-- ─────────────────────────────────────────────────────────────
-- game_session — game state blob, streamed via Realtime Changes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.game_session (
  id          uuid        primary key default uuid_generate_v4(),
  room_key    text        not null,
  game_id     text        not null,
  state       jsonb       not null default '{}',
  status      text        not null default 'waiting'
                          check (status in ('waiting', 'active', 'finished')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists game_session_room_key_idx
  on public.game_session (room_key, status);

alter table public.game_session enable row level security;

create policy "game sessions readable by authenticated users"
  on public.game_session for select
  using (auth.uid() is not null);

-- NOTE: no client write policy — all writes go through the SECURITY DEFINER
-- functions below, which enforce seating, turn order, and move legality.

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_session_updated_at on public.game_session;
create trigger game_session_updated_at
  before update on public.game_session
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Game core — generic, game-agnostic RPCs (dispatch by game_id)
-- ============================================================

create or replace function public.game_join(
  p_room_key text,
  p_game_id  text,
  p_handle   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  s            record;
  v_session_id uuid;
  v_initial    jsonb;
  v_init_fn    text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_handle is null or length(trim(p_handle)) = 0 then
    raise exception 'handle required';
  end if;

  v_init_fn := '_' || replace(p_game_id, '-', '_') || '_initial_state';
  if to_regprocedure(format('%I()', v_init_fn)) is null then
    raise exception 'unknown game: %', p_game_id;
  end if;

  select * into s
  from public.game_session
  where room_key = p_room_key
    and game_id  = p_game_id
    and status in ('waiting', 'active')
  order by created_at desc
  limit 1
  for update;

  if found then
    if (s.state->'players'->'1'->>'id') = v_uid::text
       or (s.state->'players'->'2'->>'id') = v_uid::text then
      return s.id;
    end if;

    if s.status = 'waiting'
       and (s.state->'players'->'2'->>'id') is null then
      update public.game_session
      set state = jsonb_set(
                    jsonb_set(
                      state,
                      '{players,2}',
                      jsonb_build_object('id', v_uid::text, 'handle', p_handle)
                    ),
                    '{turn}',
                    to_jsonb((state->>'startTurn')::int)
                  ),
          status = 'active'
      where id = s.id;
      return s.id;
    end if;

    return s.id;
  end if;

  execute format('select %I()', v_init_fn) into v_initial;

  insert into public.game_session (room_key, game_id, state, status)
  values (
    p_room_key,
    p_game_id,
    jsonb_build_object(
      'players',   jsonb_build_object(
                     '1', jsonb_build_object('id', v_uid::text, 'handle', p_handle),
                     '2', null
                   ),
      'turn',      1,
      'startTurn', 1,
      'winner',    null,
      'moveCount', 0,
      'game',      v_initial
    ),
    'waiting'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.game_move(
  p_session uuid,
  p_action  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  s          record;
  v_turn     int;
  v_apply_fn text;
  v_res      jsonb;
  v_result   text;
  v_win      boolean;
  v_draw     boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into s
  from public.game_session
  where id = p_session
  for update;

  if not found then
    raise exception 'session not found';
  end if;
  if s.status <> 'active' then
    raise exception 'game is not active';
  end if;

  v_turn := (s.state->>'turn')::int;
  if (s.state->'players'->(v_turn::text)->>'id') <> v_uid::text then
    raise exception 'not your turn';
  end if;

  v_apply_fn := '_' || replace(s.game_id, '-', '_') || '_apply_move';
  if to_regprocedure(format('%I(jsonb,jsonb,integer)', v_apply_fn)) is null then
    raise exception 'unknown game: %', s.game_id;
  end if;

  execute format('select %I($1,$2,$3)', v_apply_fn)
    into v_res
    using (s.state->'game'), p_action, v_turn;

  v_result := v_res->>'result';
  if v_result = 'illegal' then
    raise exception 'illegal move';
  end if;

  v_win  := v_result = 'win';
  v_draw := v_result = 'draw';

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      case when v_win or v_draw then v_turn else 3 - v_turn end,
                'startTurn', s.state->'startTurn',
                'winner',    case when v_win then v_turn when v_draw then 0 else null end,
                'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                'game',      v_res->'game'
              ),
      status = case when v_win or v_draw then 'finished' else 'active' end
  where id = p_session;
end;
$$;

create or replace function public.game_rematch(p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  s            record;
  v_next_start int;
  v_initial    jsonb;
  v_init_fn    text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into s
  from public.game_session
  where id = p_session
  for update;

  if not found then
    raise exception 'session not found';
  end if;
  if s.status <> 'finished' then
    raise exception 'game is not finished';
  end if;
  if (s.state->'players'->'1'->>'id') <> v_uid::text
     and (s.state->'players'->'2'->>'id') <> v_uid::text then
    raise exception 'only players can rematch';
  end if;

  v_init_fn := '_' || replace(s.game_id, '-', '_') || '_initial_state';
  execute format('select %I()', v_init_fn) into v_initial;

  v_next_start := case when (s.state->>'startTurn')::int = 1 then 2 else 1 end;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      v_next_start,
                'startTurn', v_next_start,
                'winner',    null,
                'moveCount', 0,
                'game',      v_initial
              ),
      status = 'active'
  where id = p_session;

  return p_session;
end;
$$;

grant execute on function public.game_join(text, text, text) to authenticated, anon;
grant execute on function public.game_move(uuid, jsonb)       to authenticated, anon;
grant execute on function public.game_rematch(uuid)           to authenticated, anon;

-- ============================================================
-- Connect Four — per-game logic dispatched by game core
-- (private helpers; never granted to clients)
-- ============================================================

create or replace function public._connect_four_initial_state()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'board',   to_jsonb(array_fill(0, array[42])),
    'lastCol', null,
    'lastRow', null
  );
$$;

create or replace function public._connect_four_check_win(p_board int[], p_player int)
returns boolean
language plpgsql
immutable
as $$
declare
  r int;
  c int;
begin
  -- horizontal
  for r in 0..5 loop
    for c in 0..3 loop
      if p_board[r*7+c+1] = p_player
         and p_board[r*7+c+2] = p_player
         and p_board[r*7+c+3] = p_player
         and p_board[r*7+c+4] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  -- vertical
  for c in 0..6 loop
    for r in 0..2 loop
      if p_board[r*7+c+1] = p_player
         and p_board[(r+1)*7+c+1] = p_player
         and p_board[(r+2)*7+c+1] = p_player
         and p_board[(r+3)*7+c+1] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  -- diagonal down-right
  for r in 0..2 loop
    for c in 0..3 loop
      if p_board[r*7+c+1] = p_player
         and p_board[(r+1)*7+c+2] = p_player
         and p_board[(r+2)*7+c+3] = p_player
         and p_board[(r+3)*7+c+4] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  -- diagonal down-left
  for r in 0..2 loop
    for c in 3..6 loop
      if p_board[r*7+c+1] = p_player
         and p_board[(r+1)*7+c] = p_player
         and p_board[(r+2)*7+c-1] = p_player
         and p_board[(r+3)*7+c-2] = p_player then
        return true;
      end if;
    end loop;
  end loop;

  return false;
end;
$$;

create or replace function public._connect_four_apply_move(
  p_game   jsonb,
  p_action jsonb,
  p_player int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_col   int := (p_action->>'col')::int;
  v_board int[];
  v_row   int := -1;
  r       int;
  v_win   boolean;
  v_full  boolean;
begin
  if v_col is null or v_col < 0 or v_col > 6 then
    return jsonb_build_object('result', 'illegal');
  end if;

  v_board := array(select jsonb_array_elements_text(p_game->'board'))::int[];

  for r in reverse 5..0 loop
    if v_board[r*7 + v_col + 1] = 0 then
      v_row := r;
      exit;
    end if;
  end loop;

  if v_row = -1 then
    return jsonb_build_object('result', 'illegal');
  end if;

  v_board[v_row*7 + v_col + 1] := p_player;

  v_win  := public._connect_four_check_win(v_board, p_player);
  v_full := not exists (select 1 from unnest(v_board) x where x = 0);

  return jsonb_build_object(
    'result', case when v_win then 'win' when v_full then 'draw' else 'continue' end,
    'game',   jsonb_build_object(
                'board',   to_jsonb(v_board),
                'lastCol', v_col,
                'lastRow', v_row
              )
  );
end;
$$;

revoke all on function public._connect_four_initial_state()               from public;
revoke all on function public._connect_four_check_win(int[], int)         from public;
revoke all on function public._connect_four_apply_move(jsonb, jsonb, int) from public;

-- ============================================================
-- Room system — occupancy + invites + host controls
-- ============================================================

-- Race-safe join. Returns {"ok":true} | {"error":"not_found"|"expired"|"full"}
create or replace function public.room_join(p_slug text)
returns jsonb language plpgsql security definer as $$
declare
  v_room public.room;
begin
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

-- Decrement occupancy (fire-and-forget safe).
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

-- Resolve invite code → room (case-insensitive; non-expired only).
create or replace function public.room_by_invite(p_code text)
returns setof public.room language sql security definer stable as $$
  select * from public.room
  where upper(invite_code) = upper(p_code)
    and invite_code <> ''
    and expires_at > now()
  limit 1;
$$;

-- Reconcile occupancy to the true presence count (idempotent no-op when equal).
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

  if not found or v_status = 'closed' then
    return;
  end if;

  v_target := greatest(0, least(p_count, v_cap));
  v_new_status := case
    when v_status = 'live'       then 'live'
    when v_target >= v_cap       then 'filling up'
    when v_status = 'filling up' then 'open'
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

-- Host-only. Returns {"ok":true} | {"error":"not_found"|"forbidden"}
create or replace function public.room_close(p_slug text)
returns jsonb language plpgsql security definer as $$
declare
  v_host uuid;
begin
  select host_id into v_host from public.room where slug = p_slug;

  if not found then
    return '{"error":"not_found"}'::jsonb;
  end if;

  if v_host is null or v_host <> auth.uid() then
    return '{"error":"forbidden"}'::jsonb;
  end if;

  update public.room set status = 'closed' where slug = p_slug;
  return '{"ok":true}'::jsonb;
end;
$$;

grant execute on function public.room_join(text)           to authenticated, anon;
grant execute on function public.room_leave(text)          to authenticated, anon;
grant execute on function public.room_by_invite(text)      to authenticated, anon;
grant execute on function public.room_sync_count(text, int) to authenticated, anon;
grant execute on function public.room_close(text)          to authenticated, anon;

-- ============================================================
-- Realtime publication (fresh projects only — see header note)
-- ============================================================
alter publication supabase_realtime add table public.room;
alter publication supabase_realtime add table public.game_session;
