-- Configurable round duration (host picks in the lobby).
--
-- geo_challenge_start / _rematch now take p_duration and write it into
-- state.roundDuration (previously hard-coded to 60 at join time). Adding a
-- parameter changes the function signature, which would otherwise create a
-- SECOND overload and make PostgREST calls ambiguous — so drop the old 2-arg
-- signatures first, then recreate with the new arg (default 60 for safety).

drop function if exists geo_challenge_start(text, jsonb);
drop function if exists geo_challenge_rematch(text, jsonb);

-- ── geo_challenge_start ────────────────────────────────────────────────────
create or replace function geo_challenge_start(
  p_room_key text, p_rounds jsonb, p_duration int default 60
)
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
    'roundDuration',  greatest(10, least(600, p_duration)),
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

-- ── geo_challenge_rematch ──────────────────────────────────────────────────
create or replace function geo_challenge_rematch(
  p_room_key text, p_rounds jsonb, p_duration int default 60
)
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
    'roundDuration',  greatest(10, least(600, p_duration)),
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

grant execute on function geo_challenge_start(text, jsonb, int)   to authenticated, anon;
grant execute on function geo_challenge_rematch(text, jsonb, int) to authenticated, anon;

-- Force PostgREST to refresh its schema cache so the new 3-arg signatures are
-- immediately callable (otherwise clients get PGRST202 "function not found"
-- until the cache reloads on its own).
notify pgrst, 'reload schema';
