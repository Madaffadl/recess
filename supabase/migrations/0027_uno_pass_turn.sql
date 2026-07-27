-- ============================================================
-- Recess — UNO: Pass turn after drawing a playable card
--
-- Official rule: after drawing voluntarily, if the drawn card is
-- playable the player MAY play it immediately, but is not required
-- to. Playing noop passes the turn without playing.
--
-- Bug fixed: when noop was processed, p_game was returned
-- unchanged — including drawnThisTurn: true. game_move then wrote
-- that flag to the next player's state. On their turn, game_draw's
-- "already drawn this turn" guard fired incorrectly.
--
-- Change from 0025: noop handler resets drawnThisTurn to false
-- (explicit, not absent) so the flag never leaks across a turn
-- boundary while keeping the state schema consistent.
-- All other logic is byte-for-byte identical to 0025.
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
  -- result-building variables (from 0021 / 0023 / 0024)
  v_result_value int;
  v_result_dir   jsonb;
  v_event_type   text;
  v_next_turn    int;
  v_result_color text;
  v_pending_val  int;
  v_chosen_color text;
begin
  if v_type = 'noop' then
    -- Reset drawnThisTurn to false so it cannot block the next player
    -- from drawing. Explicit false (not absent) keeps the schema consistent.
    return jsonb_build_object(
      'result', 'continue',
      'game', jsonb_set(p_game, '{drawnThisTurn}', 'false'::jsonb)
    );
  end if;

  if v_type = 'play_card' then
    v_card         := p_action->>'card';
    v_chosen_color := p_action->>'chosenColor';
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

    -- 4. Type-specific playability check + set result variables
    if v_card_type = 'number' then
      if v_card_color <> v_curr_color then
        if v_curr_type <> 'number'
           or v_curr_value is null
           or v_curr_value <> v_card_value
        then
          return jsonb_build_object('result', 'illegal');
        end if;
      end if;
      v_result_color := v_card_color;
      v_result_value := v_card_value;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'play_card';
      v_next_turn    := null;
      v_pending_val  := 0;

    elsif v_card_type in ('skip', 'reverse') then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := case when v_card_type = 'reverse'
                             then to_jsonb((p_game->>'direction')::int * -1)
                             else p_game->'direction' end;
      v_event_type   := v_card_type;
      v_next_turn    := p_player;
      v_pending_val  := 0;

    elsif v_card_type = 'draw_two' then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'draw_two';
      v_next_turn    := null;
      v_pending_val  := 2;

    elsif v_card_type = 'wild' then
      if v_chosen_color is null
         or v_chosen_color not in ('red', 'green', 'blue', 'yellow')
      then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_chosen_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'wild';
      v_next_turn    := null;
      v_pending_val  := 0;

    elsif v_card_type = 'wild_draw_four' then
      if v_chosen_color is null
         or v_chosen_color not in ('red', 'green', 'blue', 'yellow')
      then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_chosen_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'wild_draw_four';
      v_next_turn    := null;
      v_pending_val  := 4;

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
    return jsonb_build_object(
      'result',   case when cardinality(v_new_hand) = 0 then 'win' else 'continue' end,
      'nextTurn', v_next_turn,
      'game', jsonb_build_object(
        'drawPile',     p_game->'drawPile',
        'discardPile',  jsonb_build_array(v_card) || (p_game->'discardPile'),
        'currentColor', v_result_color,
        'currentType',  v_card_type,
        'currentValue', v_result_value,
        'hands', jsonb_set(
          p_game->'hands',
          array[v_hand_key],
          to_jsonb(v_new_hand)
        ),
        'direction',   v_result_dir,
        'pendingDraw', v_pending_val,
        'lastEvent', jsonb_build_object(
          'seat',        p_player,
          'type',        v_event_type,
          'card',        v_card,
          'chosenColor', v_chosen_color,
          'drewCards',   jsonb_build_array()
        )
      )
    );
  end if;

  return jsonb_build_object('result', 'illegal');
end;
$$;

revoke all on function public._uno_apply_move(jsonb, jsonb, int) from public;
