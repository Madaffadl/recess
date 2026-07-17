-- Reject guesses from players who are not part of the game.
--
-- geo_challenge_join only adds a player while phase = 'waiting', so anyone who
-- opens the room after the game started is a spectator. The original
-- geo_challenge_guess recorded ANY handle's guess, so a spectator's guess got
-- scored (and could even trip the auto-reveal count) while never appearing in
-- the players list. Guard the insert so only listed players can guess.

create or replace function geo_challenge_guess(
  p_room_key text, p_handle text, p_lat float8, p_lng float8
)
returns jsonb language plpgsql security definer as $$
declare
  v_row       geo_challenge_session%rowtype;
  v_player_ct int;
  v_guess_ct  int;
begin
  -- Record guess (idempotent — first guess wins), members only.
  update geo_challenge_session
  set state = state || jsonb_build_object(
    'roundGuesses',
    coalesce(state->'roundGuesses', '{}'::jsonb)
    || jsonb_build_object(p_handle, jsonb_build_object('lat', p_lat, 'lng', p_lng))
  ),
  updated_at = now()
  where room_key = p_room_key
    and state->>'phase' = 'guessing'
    and state->'players' @> jsonb_build_array(p_handle)
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
