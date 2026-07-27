-- Geo Challenge: a GeoGuessr-style party game.
-- Players view landmark photos and drop a pin on a world map.
-- Score per round = max(0, 5000 − distance_km × 2). 5 rounds, 60 s each.
--
-- State shape (jsonb):
-- {
--   players:        string[],
--   rounds:         { imageId, imageUrl, name, country, lat, lng }[],
--   currentRound:   number,
--   phase:          "waiting" | "guessing" | "revealing" | "finished",
--   roundGuesses:   { [handle]: { lat, lng } | {} },   -- {} = no guess
--   roundScores:    { [handle]: number },               -- current round
--   scores:         { [handle]: number },               -- cumulative
--   roundDuration:  number,                             -- seconds (default 60)
--   roundStartedAt: string | null                       -- ISO-8601 UTC
-- }

create table if not exists geo_challenge_session (
  id           uuid        primary key default gen_random_uuid(),
  room_key     text        not null unique,
  state        jsonb       not null default '{}',
  status       text        not null default 'waiting'
               check (status in ('waiting', 'active', 'finished')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table geo_challenge_session enable row level security;
create policy "anon_read_geo"  on geo_challenge_session for select using (true);
create policy "anon_write_geo" on geo_challenge_session for all    using (true);

-- ── geo_challenge_join ─────────────────────────────────────────────────────
create or replace function geo_challenge_join(p_room_key text, p_handle text)
returns jsonb language plpgsql security definer as $$
declare
  v_row geo_challenge_session%rowtype;
begin
  -- Create session on first join
  insert into geo_challenge_session (room_key, state)
  values (p_room_key, jsonb_build_object(
    'players',        jsonb_build_array(p_handle),
    'rounds',         '[]'::jsonb,
    'currentRound',   0,
    'phase',          'waiting',
    'roundGuesses',   '{}'::jsonb,
    'roundScores',    '{}'::jsonb,
    'scores',         jsonb_build_object(p_handle, 0),
    'roundDuration',  60,
    'roundStartedAt', null
  ))
  on conflict (room_key) do nothing;

  -- Add player if not already listed (only while waiting)
  update geo_challenge_session
  set state = state
    || jsonb_build_object('players',
        case when state->'players' @> to_jsonb(p_handle)
             then state->'players'
             else state->'players' || to_jsonb(p_handle)
        end,
        'scores',
        coalesce(state->'scores', '{}'::jsonb)
        || jsonb_build_object(p_handle,
            coalesce((state->'scores'->>p_handle)::int, 0))
      ),
    updated_at = now()
  where room_key = p_room_key
    and state->>'phase' = 'waiting';

  select * into v_row from geo_challenge_session where room_key = p_room_key;
  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
end;
$$;

-- ── geo_challenge_start ────────────────────────────────────────────────────
-- p_rounds: array of round objects (imageId, imageUrl, name, country, lat, lng)
create or replace function geo_challenge_start(p_room_key text, p_rounds jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_row geo_challenge_session%rowtype;
begin
  update geo_challenge_session
  set state = state || jsonb_build_object(
    'rounds',         p_rounds,
    'currentRound',   0,
    'phase',          'guessing',
    'roundGuesses',   '{}'::jsonb,
    'roundScores',    '{}'::jsonb,
    'roundStartedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  status = 'active',
  updated_at = now()
  where room_key = p_room_key
    and state->>'phase' = 'waiting';

  select * into v_row from geo_challenge_session where room_key = p_room_key;
  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
end;
$$;

-- ── geo_challenge_reveal_internal ──────────────────────────────────────────
-- Scores all guesses for the current round and transitions to "revealing".
-- Called by both geo_challenge_guess (auto) and geo_challenge_reveal (timeout).
create or replace function geo_challenge_reveal_internal(p_room_key text)
returns void language plpgsql security definer as $$
declare
  v_row          geo_challenge_session%rowtype;
  v_round        jsonb;
  v_correct_lat  float8;
  v_correct_lng  float8;
  v_guesses      jsonb;
  v_new_scores   jsonb;
  v_round_scores jsonb;
  v_player       text;
  v_entry        record;
  v_dist_km      float8;
  v_score        int;
begin
  select * into v_row from geo_challenge_session
  where room_key = p_room_key for update;

  if not found or v_row.state->>'phase' != 'guessing' then
    return;
  end if;

  v_round       := v_row.state->'rounds'->((v_row.state->>'currentRound')::int);
  v_correct_lat := (v_round->>'lat')::float8;
  v_correct_lng := (v_round->>'lng')::float8;
  v_guesses     := coalesce(v_row.state->'roundGuesses', '{}'::jsonb);
  v_new_scores  := coalesce(v_row.state->'scores', '{}'::jsonb);
  v_round_scores := '{}'::jsonb;

  -- Assign empty-object sentinel to players who didn't guess
  for v_player in
    select * from jsonb_array_elements_text(coalesce(v_row.state->'players', '[]'::jsonb))
  loop
    if not (v_guesses ? v_player) then
      v_guesses := v_guesses || jsonb_build_object(v_player, '{}'::jsonb);
    end if;
  end loop;

  -- Score each player
  for v_entry in select key, value from jsonb_each(v_guesses)
  loop
    -- {} sentinel means no guess → 0 pts
    if not (v_entry.value ? 'lat') then
      v_score := 0;
    else
      -- Haversine distance in km
      v_dist_km := 2.0 * 6371.0 * asin(sqrt(
        power(sin(radians(((v_entry.value->>'lat')::float8 - v_correct_lat) / 2.0)), 2) +
        cos(radians(v_correct_lat)) *
        cos(radians((v_entry.value->>'lat')::float8)) *
        power(sin(radians(((v_entry.value->>'lng')::float8 - v_correct_lng) / 2.0)), 2)
      ));
      v_score := greatest(0, 5000 - (v_dist_km * 2.0)::int);
    end if;

    v_round_scores := v_round_scores || jsonb_build_object(v_entry.key, v_score);
    v_new_scores   := v_new_scores   || jsonb_build_object(
      v_entry.key,
      coalesce((v_new_scores->>v_entry.key)::int, 0) + v_score
    );
  end loop;

  update geo_challenge_session
  set state = state || jsonb_build_object(
        'phase',        'revealing',
        'roundGuesses', v_guesses,
        'roundScores',  v_round_scores,
        'scores',       v_new_scores
      ),
      updated_at = now()
  where id = v_row.id;
end;
$$;

-- ── geo_challenge_guess ────────────────────────────────────────────────────
create or replace function geo_challenge_guess(
  p_room_key text, p_handle text, p_lat float8, p_lng float8
)
returns jsonb language plpgsql security definer as $$
declare
  v_row       geo_challenge_session%rowtype;
  v_player_ct int;
  v_guess_ct  int;
begin
  -- Record guess (idempotent — first guess wins)
  update geo_challenge_session
  set state = state || jsonb_build_object(
    'roundGuesses',
    coalesce(state->'roundGuesses', '{}'::jsonb)
    || jsonb_build_object(p_handle, jsonb_build_object('lat', p_lat, 'lng', p_lng))
  ),
  updated_at = now()
  where room_key = p_room_key
    and state->>'phase' = 'guessing'
    and not (state->'roundGuesses' ? p_handle);

  -- Auto-reveal if all players have guessed
  select * into v_row from geo_challenge_session where room_key = p_room_key;
  v_player_ct := jsonb_array_length(coalesce(v_row.state->'players', '[]'::jsonb));
  select count(*) into v_guess_ct
  from jsonb_object_keys(coalesce(v_row.state->'roundGuesses', '{}'::jsonb));

  if v_player_ct > 0 and v_guess_ct >= v_player_ct and v_row.state->>'phase' = 'guessing' then
    perform geo_challenge_reveal_internal(p_room_key);
    select * into v_row from geo_challenge_session where room_key = p_room_key;
  end if;

  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
end;
$$;

-- ── geo_challenge_reveal ───────────────────────────────────────────────────
-- Called by any client when the round timer expires.
create or replace function geo_challenge_reveal(p_room_key text)
returns jsonb language plpgsql security definer as $$
declare
  v_row geo_challenge_session%rowtype;
begin
  perform geo_challenge_reveal_internal(p_room_key);
  select * into v_row from geo_challenge_session where room_key = p_room_key;
  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
end;
$$;

-- ── geo_challenge_next_round ───────────────────────────────────────────────
create or replace function geo_challenge_next_round(p_room_key text)
returns jsonb language plpgsql security definer as $$
declare
  v_row        geo_challenge_session%rowtype;
  v_next_round int;
  v_total      int;
begin
  select * into v_row from geo_challenge_session
  where room_key = p_room_key for update;

  if not found or v_row.state->>'phase' != 'revealing' then
    if found then
      return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
    end if;
    return null;
  end if;

  v_next_round := (v_row.state->>'currentRound')::int + 1;
  v_total      := jsonb_array_length(coalesce(v_row.state->'rounds', '[]'::jsonb));

  if v_next_round >= v_total then
    update geo_challenge_session
    set state  = state || jsonb_build_object('phase', 'finished'),
        status = 'finished',
        updated_at = now()
    where id = v_row.id;
  else
    update geo_challenge_session
    set state = state || jsonb_build_object(
          'currentRound',   v_next_round,
          'phase',          'guessing',
          'roundGuesses',   '{}'::jsonb,
          'roundScores',    '{}'::jsonb,
          'roundStartedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        updated_at = now()
    where id = v_row.id;
  end if;

  select * into v_row from geo_challenge_session where room_key = p_room_key;
  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
end;
$$;

-- ── geo_challenge_rematch ──────────────────────────────────────────────────
create or replace function geo_challenge_rematch(p_room_key text, p_rounds jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_row geo_challenge_session%rowtype;
begin
  select * into v_row from geo_challenge_session where room_key = p_room_key;

  update geo_challenge_session
  set state = state || jsonb_build_object(
    'rounds',         p_rounds,
    'currentRound',   0,
    'phase',          'guessing',
    'roundGuesses',   '{}'::jsonb,
    'roundScores',    '{}'::jsonb,
    'scores', (
      select coalesce(jsonb_object_agg(key, 0), '{}'::jsonb)
      from jsonb_each(coalesce(v_row.state->'scores', '{}'::jsonb))
    ),
    'roundStartedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  status = 'active',
  updated_at = now()
  where room_key = p_room_key
    and state->>'phase' = 'finished';

  select * into v_row from geo_challenge_session where room_key = p_room_key;
  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'status', v_row.status);
end;
$$;
