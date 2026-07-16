-- ─────────────────────────────────────────────────────────────────────────────
-- Draw Together — standalone multiplayer drawing-and-guessing game
--
-- Unlike Connect Four / Word Snake (which piggyback on game_session),
-- Draw Together has its own tables because it needs:
--   • 2-8 players (not a fixed 2-seat model)
--   • Word secrecy: only the drawer may see the word during a round
--   • Per-round guesses with time-based scoring
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Word bank ───────────────────────────────────────────────────────────────
create table draw_together_word (
  id       serial primary key,
  word     text   not null,
  category text   not null default 'general',
  language text   not null default 'en'
);

insert into draw_together_word (word, category) values
  ('apple','food'),('banana','food'),('pizza','food'),('coffee','food'),
  ('burger','food'),('sushi','food'),('cookie','food'),('pasta','food'),
  ('taco','food'),('waffle','food'),('noodle','food'),('salad','food'),
  ('cat','animals'),('dog','animals'),('elephant','animals'),('tiger','animals'),
  ('penguin','animals'),('dolphin','animals'),('butterfly','animals'),
  ('parrot','animals'),('shark','animals'),('rabbit','animals'),('giraffe','animals'),
  ('rocket','objects'),('bicycle','objects'),('umbrella','objects'),
  ('guitar','objects'),('camera','objects'),('laptop','objects'),
  ('clock','objects'),('compass','objects'),('telescope','objects'),
  ('mountain','nature'),('rainbow','nature'),('volcano','nature'),
  ('snowflake','nature'),('thunder','nature'),('island','nature'),
  ('waterfall','nature'),('desert','nature'),('glacier','nature'),
  ('astronaut','people'),('pirate','people'),('chef','people'),
  ('wizard','people'),('ninja','people'),('doctor','people'),
  ('firefighter','people'),('knight','people'),('clown','people'),
  ('basketball','sports'),('tennis','sports'),('swimming','sports'),
  ('skiing','sports'),('surfing','sports'),('archery','sports'),
  ('airplane','transport'),('submarine','transport'),('helicopter','transport'),
  ('sailboat','transport'),('motorcycle','transport'),('hot air balloon','transport'),
  ('lighthouse','places'),('library','places'),('castle','places'),
  ('stadium','places'),('museum','places'),('jungle','places'),
  ('dragon','fantasy'),('mermaid','fantasy'),('unicorn','fantasy'),
  ('ghost','fantasy'),('vampire','fantasy'),('alien','fantasy'),
  ('keyboard','office'),('meeting','office'),('deadline','office'),
  ('spreadsheet','office'),('presentation','office'),('inbox','office'),
  ('printer','office'),('sticky note','office'),('whiteboard','office');

-- ─── Session ─────────────────────────────────────────────────────────────────
-- room_key is the room's SLUG (text), matching the game_session convention in
-- 0001 — NOT the room uuid, and no FK to room (games work against ephemeral
-- rooms). The client passes room.id, which resolves to the slug (see toRoom()).
create table draw_together_session (
  id                  uuid        primary key default gen_random_uuid(),
  room_key            text        not null,
  status              text        not null default 'waiting',
  -- 'waiting' | 'word_selection' | 'drawing' | 'round_end' | 'finished'
  host_id             uuid        references auth.users(id),
  rounds_per_player   int         not null default 3,
  draw_seconds        int         not null default 60,
  current_round       int         not null default 0,
  current_drawer_id   uuid        references auth.users(id),
  -- visible to everyone: blanks and partially-revealed letters
  current_word_length int,
  current_word_hint   text,
  -- set at round_end so everyone can see the answer
  round_word_revealed text,
  round_started_at    timestamptz,
  -- [{userId, handle, score, hasGuessed}]
  players             jsonb       not null default '[]'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (room_key)
);

-- ─── Round secrets (word only visible to drawer while drawing) ───────────────
create table draw_together_round_secret (
  session_id   uuid   not null references draw_together_session(id) on delete cascade,
  round_num    int    not null,
  drawer_id    uuid   not null references auth.users(id),
  word         text   not null,
  word_options text[] not null,
  primary key (session_id, round_num)
);

-- ─── Guess log ───────────────────────────────────────────────────────────────
create table draw_together_guess (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references draw_together_session(id) on delete cascade,
  user_id        uuid        not null,
  round_num      int         not null,
  handle         text        not null,
  guess_text     text        not null,
  is_correct     boolean     not null default false,
  points_awarded int         not null default 0,
  guessed_at     timestamptz default now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table draw_together_word         enable row level security;
alter table draw_together_session      enable row level security;
alter table draw_together_round_secret enable row level security;
alter table draw_together_guess        enable row level security;

create policy "dt_words_read"    on draw_together_word    for select using (true);
create policy "dt_session_read"  on draw_together_session for select using (true);
create policy "dt_guesses_read"  on draw_together_guess   for select using (true);
-- Only the drawer sees their own round's secret
create policy "dt_secret_drawer" on draw_together_round_secret
  for select using (drawer_id = auth.uid());

create index on draw_together_session (room_key);
create index on draw_together_guess   (session_id, round_num);
create index on draw_together_round_secret (session_id);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function _dt_pick_words(p_count int default 3)
returns text[]
language sql security definer
as $$
  select array_agg(word)
  from (select word from draw_together_word order by random() limit p_count) w;
$$;

create or replace function _dt_make_hint(p_word text)
returns text
language sql security definer
as $$
  select string_agg(case when c = ' ' then '/' else '_' end, ' ')
  from regexp_split_to_table(p_word, '') c;
$$;

-- ─── draw_together_join ───────────────────────────────────────────────────────
-- Create session for room (if none) and register this player.
-- Idempotent: safe to call on every page load.
--
-- Drop the earlier uuid-keyed signature first. `create or replace` only
-- replaces a function with the SAME argument types; changing room_key from
-- uuid→text would otherwise leave TWO overloads and make PostgREST calls
-- ambiguous ("could not choose the best candidate function").
drop function if exists draw_together_join(uuid, text);

create or replace function draw_together_join(
  p_room_key text,
  p_handle   text
)
returns uuid
language plpgsql security definer
as $$
declare
  v_uid     uuid := auth.uid();
  v_session draw_together_session;
  v_player  jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into draw_together_session (room_key, host_id)
  values (p_room_key, v_uid)
  on conflict (room_key) do nothing;

  select * into v_session
  from draw_together_session where room_key = p_room_key;

  -- Add player only if not already present
  if not exists (
    select 1 from jsonb_array_elements(v_session.players) p
    where p->>'userId' = v_uid::text
  ) then
    v_player := jsonb_build_object(
      'userId',     v_uid::text,
      'handle',     p_handle,
      'score',      0,
      'hasGuessed', false
    );
    update draw_together_session
    set players    = players || jsonb_build_array(v_player),
        updated_at = now()
    where id = v_session.id;
  end if;

  return v_session.id;
end;
$$;

-- ─── draw_together_start ──────────────────────────────────────────────────────
-- Host starts the game: picks first drawer, generates word options.
create or replace function draw_together_start(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_uid     uuid := auth.uid();
  v_session draw_together_session;
  v_drawer  jsonb;
  v_words   text[];
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if not found                                   then raise exception 'session_not_found'; end if;
  if v_session.host_id != v_uid                  then raise exception 'not_host'; end if;
  if v_session.status  != 'waiting'              then raise exception 'already_started'; end if;
  if jsonb_array_length(v_session.players) < 2   then raise exception 'not_enough_players'; end if;

  v_drawer := v_session.players -> 0;
  v_words  := _dt_pick_words();

  insert into draw_together_round_secret
    (session_id, round_num, drawer_id, word, word_options)
  values
    (p_session_id, 1, (v_drawer->>'userId')::uuid, v_words[1], v_words);

  update draw_together_session
  set status              = 'word_selection',
      current_round       = 1,
      current_drawer_id   = (v_drawer->>'userId')::uuid,
      current_word_length = null,
      current_word_hint   = null,
      round_word_revealed = null,
      updated_at          = now()
  where id = p_session_id;
end;
$$;

-- ─── draw_together_get_word_options ──────────────────────────────────────────
-- Returns the 3 word choices to the current drawer only.
create or replace function draw_together_get_word_options(p_session_id uuid)
returns text[]
language plpgsql security definer
as $$
declare
  v_uid    uuid := auth.uid();
  v_session draw_together_session;
  v_secret  draw_together_round_secret;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.current_drawer_id  != v_uid        then return null; end if;
  if v_session.status             != 'word_selection' then return null; end if;

  select * into v_secret
  from draw_together_round_secret
  where session_id = p_session_id and round_num = v_session.current_round;

  return v_secret.word_options;
end;
$$;

-- ─── draw_together_select_word ────────────────────────────────────────────────
-- Drawer picks one of the three word options.
create or replace function draw_together_select_word(
  p_session_id uuid,
  p_word       text
)
returns void
language plpgsql security definer
as $$
declare
  v_uid    uuid := auth.uid();
  v_session draw_together_session;
  v_secret  draw_together_round_secret;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.current_drawer_id != v_uid          then raise exception 'not_drawer'; end if;
  if v_session.status            != 'word_selection' then raise exception 'wrong_status'; end if;

  select * into v_secret
  from draw_together_round_secret
  where session_id = p_session_id and round_num = v_session.current_round;

  if not (p_word = any(v_secret.word_options)) then raise exception 'invalid_word'; end if;

  -- Update the chosen word in the secret row
  update draw_together_round_secret
  set word = p_word
  where session_id = p_session_id and round_num = v_session.current_round;

  update draw_together_session
  set status              = 'drawing',
      current_word_length = length(p_word),
      current_word_hint   = _dt_make_hint(p_word),
      round_started_at    = now(),
      round_word_revealed = null,
      updated_at          = now()
  where id = p_session_id;
end;
$$;

-- ─── draw_together_guess ──────────────────────────────────────────────────────
-- A non-drawer player submits a guess.
-- Returns { "correct": bool, "points": int }
create or replace function draw_together_guess(
  p_session_id uuid,
  p_guess      text
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_uid          uuid := auth.uid();
  v_session      draw_together_session;
  v_secret       draw_together_round_secret;
  v_handle       text;
  v_correct      boolean;
  v_points       int := 0;
  v_elapsed      float;
  v_remaining    float;
  v_all_guessed  boolean;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.current_drawer_id = v_uid   then raise exception 'drawer_cannot_guess'; end if;
  if v_session.status            != 'drawing' then raise exception 'not_drawing'; end if;

  -- Block already-correct guessers from spamming
  if exists (
    select 1 from jsonb_array_elements(v_session.players) p
    where p->>'userId' = v_uid::text
      and (p->>'hasGuessed')::boolean = true
  ) then raise exception 'already_guessed'; end if;

  -- Resolve display handle
  select p->>'handle' into v_handle
  from jsonb_array_elements(v_session.players) p
  where p->>'userId' = v_uid::text limit 1;

  select * into v_secret
  from draw_together_round_secret
  where session_id = p_session_id and round_num = v_session.current_round;

  v_correct := lower(trim(p_guess)) = lower(v_secret.word);

  if v_correct then
    v_elapsed   := extract(epoch from now() - v_session.round_started_at);
    v_remaining := greatest(0, v_session.draw_seconds - v_elapsed);
    v_points    := 100 + floor(50.0 * v_remaining / v_session.draw_seconds)::int;
  end if;

  insert into draw_together_guess
    (session_id, user_id, round_num, handle, guess_text, is_correct, points_awarded)
  values
    (p_session_id, v_uid, v_session.current_round,
     coalesce(v_handle, 'anon'), p_guess, v_correct, v_points);

  if v_correct then
    -- Award guesser points
    update draw_together_session
    set players = (
      select jsonb_agg(
        case when p->>'userId' = v_uid::text
          then jsonb_set(
                 jsonb_set(p, '{hasGuessed}', 'true'::jsonb),
                 '{score}',
                 to_jsonb((p->>'score')::int + v_points)
               )
          else p
        end
      ) from jsonb_array_elements(players) p
    ),
    updated_at = now()
    where id = p_session_id;

    -- Award drawer 10 pts per correct guess
    update draw_together_session
    set players = (
      select jsonb_agg(
        case when p->>'userId' = current_drawer_id::text
          then jsonb_set(p, '{score}', to_jsonb((p->>'score')::int + 10))
          else p
        end
      ) from jsonb_array_elements(players) p
    ),
    updated_at = now()
    where id = p_session_id;

    -- Re-fetch to check if all non-drawers have guessed
    select * into v_session from draw_together_session where id = p_session_id;

    select not exists (
      select 1 from jsonb_array_elements(v_session.players) p
      where p->>'userId' != v_session.current_drawer_id::text
        and (p->>'hasGuessed')::boolean = false
    ) into v_all_guessed;

    if v_all_guessed then
      update draw_together_session
      set status              = 'round_end',
          round_word_revealed = v_secret.word,
          updated_at          = now()
      where id = p_session_id;
    end if;
  end if;

  return jsonb_build_object('correct', v_correct, 'points', v_points);
end;
$$;

-- ─── draw_together_end_round ─────────────────────────────────────────────────
-- Called by any client when the draw timer expires. Idempotent.
create or replace function draw_together_end_round(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_session draw_together_session;
  v_secret  draw_together_round_secret;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.status != 'drawing' then return; end if;

  select * into v_secret
  from draw_together_round_secret
  where session_id = p_session_id and round_num = v_session.current_round;

  update draw_together_session
  set status              = 'round_end',
      round_word_revealed = v_secret.word,
      updated_at          = now()
  where id = p_session_id;
end;
$$;

-- ─── draw_together_next_round ─────────────────────────────────────────────────
-- Host advances to next round, or finishes the game.
create or replace function draw_together_next_round(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_uid         uuid := auth.uid();
  v_session     draw_together_session;
  v_total       int;
  v_pc          int;
  v_drawer_idx  int;
  v_next_idx    int;
  v_next_drawer jsonb;
  v_words       text[];
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.host_id != v_uid        then raise exception 'not_host'; end if;
  if v_session.status  != 'round_end'  then raise exception 'wrong_status'; end if;

  v_pc    := jsonb_array_length(v_session.players);
  v_total := v_session.rounds_per_player * v_pc;

  if v_session.current_round >= v_total then
    update draw_together_session
    set status = 'finished', updated_at = now()
    where id = p_session_id;
    return;
  end if;

  -- Rotate to next drawer
  select i into v_drawer_idx
  from generate_series(0, v_pc - 1) i
  where (v_session.players->i->>'userId') = v_session.current_drawer_id::text;

  v_drawer_idx  := coalesce(v_drawer_idx, -1);
  v_next_idx    := (v_drawer_idx + 1) % v_pc;
  v_next_drawer := v_session.players -> v_next_idx;
  v_words       := _dt_pick_words();

  -- Reset hasGuessed for all players
  update draw_together_session
  set players = (
    select jsonb_agg(p || '{"hasGuessed":false}'::jsonb)
    from jsonb_array_elements(players) p
  )
  where id = p_session_id;

  insert into draw_together_round_secret
    (session_id, round_num, drawer_id, word, word_options)
  values
    (p_session_id, v_session.current_round + 1,
     (v_next_drawer->>'userId')::uuid, v_words[1], v_words);

  update draw_together_session
  set status              = 'word_selection',
      current_round       = current_round + 1,
      current_drawer_id   = (v_next_drawer->>'userId')::uuid,
      current_word_length = null,
      current_word_hint   = null,
      round_word_revealed = null,
      round_started_at    = null,
      updated_at          = now()
  where id = p_session_id;
end;
$$;

-- ─── draw_together_rematch ────────────────────────────────────────────────────
-- Host resets session back to waiting (same players, scores cleared).
create or replace function draw_together_rematch(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_uid uuid := auth.uid();
  v_session draw_together_session;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.host_id != v_uid then raise exception 'not_host'; end if;

  update draw_together_session
  set status              = 'waiting',
      current_round       = 0,
      current_drawer_id   = null,
      current_word_length = null,
      current_word_hint   = null,
      round_word_revealed = null,
      round_started_at    = null,
      players             = (
        select jsonb_agg(
          jsonb_set(jsonb_set(p, '{score}', '0'::jsonb), '{hasGuessed}', 'false'::jsonb)
        ) from jsonb_array_elements(players) p
      ),
      updated_at = now()
  where id = p_session_id;

  delete from draw_together_round_secret where session_id = p_session_id;
end;
$$;

-- ─── draw_together_leave ──────────────────────────────────────────────────────
create or replace function draw_together_leave(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_uid uuid := auth.uid();
begin
  update draw_together_session
  set players    = (
    select coalesce(jsonb_agg(p), '[]'::jsonb)
    from jsonb_array_elements(players) p
    where p->>'userId' != v_uid::text
  ),
  updated_at = now()
  where id = p_session_id;
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Recess uses anonymous auth, so every callable RPC must be reachable by both
-- `authenticated` and `anon`. Internal helpers (_dt_*) are left revoked — only
-- the SECURITY DEFINER public functions may invoke them.
revoke execute on function _dt_pick_words(int)  from public;
revoke execute on function _dt_make_hint(text)  from public;

grant execute on function draw_together_join(text, text)             to authenticated, anon;
grant execute on function draw_together_start(uuid)                  to authenticated, anon;
grant execute on function draw_together_get_word_options(uuid)       to authenticated, anon;
grant execute on function draw_together_select_word(uuid, text)      to authenticated, anon;
grant execute on function draw_together_guess(uuid, text)            to authenticated, anon;
grant execute on function draw_together_end_round(uuid)              to authenticated, anon;
grant execute on function draw_together_next_round(uuid)             to authenticated, anon;
grant execute on function draw_together_rematch(uuid)                to authenticated, anon;
grant execute on function draw_together_leave(uuid)                  to authenticated, anon;

-- ─── Realtime publication ─────────────────────────────────────────────────────
-- The client subscribes to postgres_changes on draw_together_session, so the
-- table must be part of the realtime publication (same pattern as game_session).
-- Guarded so re-running the migration doesn't fail if the table is already a
-- publication member (ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS).
do $$
begin
  alter publication supabase_realtime add table public.draw_together_session;
exception
  when duplicate_object then null;
end $$;
