-- Fix geo_challenge_join: replace `array @> scalar` with `array @> array`
-- The original used `state->'players' @> to_jsonb(p_handle)` which tests
-- jsonb-array containment against a scalar. PostgreSQL returns false for
-- `["X"] @> "X"`, so the duplicate guard never fired and every join()
-- call appended the handle again. The correct containment check wraps the
-- handle in a single-element array: `["X"] @> ["X"]` → true.

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

  -- Add player only if not already listed (idempotent) and still waiting.
  -- Use jsonb_build_array(p_handle) so @> tests array-contains-array (correct).
  update geo_challenge_session
  set state = state
    || jsonb_build_object('players',
        case when state->'players' @> jsonb_build_array(p_handle)
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
