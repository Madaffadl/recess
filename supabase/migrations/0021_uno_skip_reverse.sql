-- ============================================================
-- Recess — UNO Phase 3B: Skip + Reverse
--
-- Minimal extension of _uno_apply_move (0010_uno_play_card.sql).
--
-- Changes from 0010:
--   declare  — 4 new variables: v_result_value, v_result_dir,
--              v_event_type, v_next_turn
--   step 4   — replace the 2-line number-only guard with a
--              3-branch dispatch; sets the 4 new variables
--   step 7   — replace 3 hardcoded literals in the existing
--              return with the new variables; add 'nextTurn' key
--
-- All other logic (steps 1-3, 5-6) is unchanged.
--
-- Skip (RS / GS / BS / YS)
--   Playable on: matching colour OR Skip-on-Skip.
--   nextTurn = p_player → current player goes again (opponent skipped).
--
-- Reverse (RR / GR / BR / YR)
--   Playable on: matching colour OR Reverse-on-Reverse.
--   Toggles direction (1 ↔ -1). In 2-player identical to Skip.
--   nextTurn = p_player → current player goes again.
--
-- Requires 0020_uno_next_turn_hint.sql (game_move reads nextTurn).
-- ============================================================

create or replace function public._uno_apply_move(
  p_game   jsonb,
  p_action jsonb,
  p_player int
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_type         text    := p_action->>'type';
  v_card         text;
  v_hand_key     text    := p_player::text;
  v_hand         text[];
  v_new_hand     text[];
  v_parsed       jsonb;
  v_card_color   text;
  v_card_type    text;
  v_card_value   int;
  v_curr_color   text    := p_game->>'currentColor';
  v_curr_type    text    := p_game->>'currentType';
  v_curr_value   int     := (p_game->>'currentValue')::int;
  v_removed      boolean := false;
  i              int;
  -- NEW: result-building variables (set in step 4; shared by the single return)
  v_result_value int;    -- currentValue in the result (null for action cards)
  v_result_dir   jsonb;  -- direction in the result (toggled for Reverse)
  v_event_type   text;   -- lastEvent.type in the result
  v_next_turn    int;    -- nextTurn hint for game_move (null = default flip)
begin
  -- Phase 2A noop — kept for backward compatibility
  if v_type = 'noop' then
    return jsonb_build_object('result', 'continue', 'game', p_game);
  end if;

  if v_type = 'play_card' then
    v_card := p_action->>'card';
    if v_card is null then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- 1. Extract player's hand
    v_hand := array(
      select jsonb_array_elements_text(p_game->'hands'->v_hand_key)
    );

    -- 2. Card must be in hand
    if not (v_card = any(v_hand)) then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- 3. Parse the card
    v_parsed     := public._uno_parse_card(v_card);
    v_card_color := v_parsed->>'color';
    v_card_type  := v_parsed->>'type';
    v_card_value := (v_parsed->>'value')::int;

    -- 4. Type-specific playability check + set result-building variables
    --    (was: 2-line number-only guard in 0010)
    if v_card_type = 'number' then
      if v_card_color <> v_curr_color then
        if v_curr_type <> 'number'
           or v_curr_value is null
           or v_curr_value <> v_card_value
        then
          return jsonb_build_object('result', 'illegal');
        end if;
      end if;
      v_result_value := v_card_value;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'play_card';
      v_next_turn    := null;

    elsif v_card_type in ('skip', 'reverse') then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_value := null;
      v_result_dir   := case when v_card_type = 'reverse'
                             then to_jsonb((p_game->>'direction')::int * -1)
                             else p_game->'direction' end;
      v_event_type   := v_card_type;  -- 'skip' or 'reverse'
      v_next_turn    := p_player;     -- current player goes again

    else
      return jsonb_build_object('result', 'illegal');
    end if;

    -- 5. Remove first occurrence of the card from player's hand
    v_new_hand := array[]::text[];
    v_removed  := false;
    for i in 1..cardinality(v_hand) loop
      if v_hand[i] = v_card and not v_removed then
        v_removed := true;
      else
        v_new_hand := v_new_hand || v_hand[i];
      end if;
    end loop;

    -- 6. Build and return updated game state
    --    nextTurn, currentValue, direction, and lastEvent.type now use
    --    the variables set in step 4 instead of hardcoded values.
    return jsonb_build_object(
      'result',   case when cardinality(v_new_hand) = 0 then 'win' else 'continue' end,
      'nextTurn', v_next_turn,
      'game', jsonb_build_object(
        'drawPile',     p_game->'drawPile',
        'discardPile',  jsonb_build_array(v_card) || (p_game->'discardPile'),
        'currentColor', v_card_color,
        'currentType',  v_card_type,
        'currentValue', v_result_value,
        'hands', jsonb_set(
          p_game->'hands',
          array[v_hand_key],
          to_jsonb(v_new_hand)
        ),
        'direction',   v_result_dir,
        'pendingDraw', p_game->'pendingDraw',
        'lastEvent', jsonb_build_object(
          'seat',        p_player,
          'type',        v_event_type,
          'card',        v_card,
          'chosenColor', null,
          'drewCards',   jsonb_build_array()
        )
      )
    );
  end if;

  -- Unknown action type
  return jsonb_build_object('result', 'illegal');
end;
$$;

-- Re-revoke (create or replace resets grants)
revoke all on function public._uno_apply_move(jsonb, jsonb, int) from public;
