-- Gentler, GeoGuessr-style scoring curve.
--
-- The original linear score `max(0, 5000 - dist_km*2)` hit 0 at 2500 km, so on
-- a world map most guesses scored nothing (getting the right continent but the
-- wrong country still felt like a total miss). Switch to smooth exponential
-- decay: 5000 * e^(-dist/2000). Right on the nose ≈ 5000; ~1400 km ≈ 2500;
-- ~5000 km ≈ 410; across the planet still yields a few points. This rewards
-- being "close-ish" and makes reveals far more satisfying.
--
-- Only the scoring line inside geo_challenge_reveal_internal changes; the
-- signature is unchanged so this is a safe create-or-replace.

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
      -- Exponential decay: 5000 points on the spot, tapering with distance.
      v_score := round(5000.0 * exp(-v_dist_km / 2000.0))::int;
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
