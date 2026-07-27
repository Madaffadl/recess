-- ============================================================
-- Recess — UNO Phase 2B: Play Number Cards
--
-- Replaces the Phase 2A noop stub for _uno_apply_move with a
-- real implementation that handles:
--   { "type": "play_card", "card": "<card>" }
--
-- Scope: number cards (0–9) only.
-- Action cards (Skip, Reverse, Draw Two, Wild, WD4) continue
-- to return "illegal" and will be added in future phases.
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
  v_type       text    := p_action->>'type';
  v_card       text;
  v_hand_key   text    := p_player::text;
  v_hand       text[];
  v_new_hand   text[];
  v_parsed     jsonb;
  v_card_color text;
  v_card_type  text;
  v_card_value int;
  v_curr_color text    := p_game->>'currentColor';
  v_curr_type  text    := p_game->>'currentType';
  v_curr_value int     := (p_game->>'currentValue')::int;
  v_removed    boolean := false;
  i            int;
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

    -- 4. Phase 2B: only number cards accepted
    if v_card_type <> 'number' then
      return jsonb_build_object('result', 'illegal');
    end if;

    -- 5. Validate playability: color match OR same number on a number card
    if v_card_color <> v_curr_color then
      if v_curr_type <> 'number'
         or v_curr_value is null
         or v_curr_value <> v_card_value
      then
        return jsonb_build_object('result', 'illegal');
      end if;
    end if;

    -- 6. Remove first occurrence of the card from player's hand
    v_new_hand := array[]::text[];
    v_removed  := false;
    for i in 1..cardinality(v_hand) loop
      if v_hand[i] = v_card and not v_removed then
        v_removed := true;
      else
        v_new_hand := v_new_hand || v_hand[i];
      end if;
    end loop;

    -- 7. Build and return updated game state
    return jsonb_build_object(
      'result', case when cardinality(v_new_hand) = 0 then 'win' else 'continue' end,
      'game', jsonb_build_object(
        'drawPile',     p_game->'drawPile',
        'discardPile',  jsonb_build_array(v_card) || (p_game->'discardPile'),
        'currentColor', v_card_color,
        'currentType',  v_card_type,
        'currentValue', v_card_value,
        'hands', jsonb_set(
          p_game->'hands',
          array[v_hand_key],
          to_jsonb(v_new_hand)
        ),
        'direction',   p_game->'direction',
        'pendingDraw', p_game->'pendingDraw',
        'lastEvent', jsonb_build_object(
          'seat',        p_player,
          'type',        'play_card',
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
