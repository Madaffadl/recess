-- ============================================================
-- Recess — UNO Phase 3D: Draw Two (official Mattel rules)
--
-- Complete, testable feature: playing Draw Two forces the
-- opponent to draw exactly two cards on their turn. No stacking;
-- the opponent cannot respond with another Draw Two.
--
-- ── Official Mattel rules implemented ────────────────────────
--   Draw Two is playable on: matching colour OR another Draw Two.
--   Effect: opponent draws exactly 2 cards, their turn ends.
--   Stacking is NOT allowed — pendingDraw is set to 2 absolutely,
--   never accumulated. All other card plays reset pendingDraw to 0.
--
-- ── _uno_apply_move changes (from 0021) ──────────────────────
--   declare  — v_pending_add renamed to v_pending_val (absolute,
--              not additive); +v_result_color text
--   step 4   — +v_result_color / +v_pending_val on every existing
--              branch; new draw_two branch; no pendingDraw guard
--   step 7   — currentColor: v_card_color → v_result_color
--              pendingDraw: preserved → v_pending_val (explicit)
--
-- ── game_draw changes (from 0018) ────────────────────────────
--   declare  — +3: v_pending int, v_drew_cards text[], j int
--   new block — when pendingDraw > 0: draw all pending cards in
--              a loop (handles mid-draw reshuffle), reset
--              pendingDraw to 0, pass turn, return early.
--              Bypasses the already-drawn check (forced action).
--   existing  — voluntary-draw path is unchanged.
-- ============================================================

-- ── _uno_apply_move ──────────────────────────────────────────

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
  -- result-building variables (from 0021)
  v_result_value int;
  v_result_dir   jsonb;
  v_event_type   text;
  v_next_turn    int;
  -- NEW in 0023
  v_result_color text;  -- currentColor written to the result
  v_pending_val  int;   -- exact pendingDraw written to state (0 or 2)
begin
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
      -- Playable on matching colour or on another Draw Two (Mattel rulebook)
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'draw_two';
      v_next_turn    := null;   -- normal turn flip; opponent resolves the draw
      v_pending_val  := 2;      -- absolute — no stacking

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
          'chosenColor', null,
          'drewCards',   jsonb_build_array()
        )
      )
    );
  end if;

  return jsonb_build_object('result', 'illegal');
end;
$$;

revoke all on function public._uno_apply_move(jsonb, jsonb, int) from public;


-- ── game_draw ────────────────────────────────────────────────

create or replace function public.game_draw(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid    := auth.uid();
  s               record;
  v_turn          int;
  v_hand_key      text;
  v_game          jsonb;
  v_already_drawn boolean;
  v_draw_pile     text[];
  v_disc_pile     text[];
  v_hand          text[];
  v_drawn         text;
  v_new_draw      text[];
  v_new_hand      text[];
  v_parsed        jsonb;
  v_card_color    text;
  v_card_type     text;
  v_card_value    int;
  v_curr_color    text;
  v_curr_type     text;
  v_curr_value    int;
  v_playable      boolean;
  v_new_turn      int;
  -- NEW in 0023: forced multi-draw
  v_pending       int;
  v_drew_cards    text[];
  j               int;
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
  if s.game_id <> 'uno' then
    raise exception 'draw action only applies to uno';
  end if;

  v_turn    := (s.state->>'turn')::int;
  if (s.state->'players'->(v_turn::text)->>'id') <> v_uid::text then
    raise exception 'not your turn';
  end if;

  v_game    := s.state->'game';
  v_pending := coalesce((v_game->>'pendingDraw')::int, 0);

  -- ── Forced draw: resolve pendingDraw ─────────────────────────
  -- Bypasses the already-drawn check; the player has no choice.
  -- Draws v_pending cards one at a time, reshuffling mid-loop if
  -- the draw pile runs out.
  if v_pending > 0 then
    v_hand_key   := v_turn::text;
    v_draw_pile  := array(select jsonb_array_elements_text(v_game->'drawPile'));
    v_disc_pile  := array(select jsonb_array_elements_text(v_game->'discardPile'));
    v_hand       := array(select jsonb_array_elements_text(v_game->'hands'->v_hand_key));
    v_drew_cards := array[]::text[];

    for j in 1..v_pending loop
      if cardinality(v_draw_pile) = 0 then
        if cardinality(v_disc_pile) <= 1 then
          raise exception 'no cards left to draw';
        end if;
        select array_agg(c order by random())
        into v_draw_pile
        from unnest(v_disc_pile[2:cardinality(v_disc_pile)]) as c;
        v_disc_pile := array[v_disc_pile[1]];
      end if;
      v_drew_cards := v_drew_cards || v_draw_pile[1];
      v_draw_pile  := v_draw_pile[2:cardinality(v_draw_pile)];
    end loop;

    update public.game_session
    set state = jsonb_build_object(
                  'players',   s.state->'players',
                  'turn',      3 - v_turn,
                  'startTurn', s.state->'startTurn',
                  'winner',    null,
                  'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                  'game', jsonb_build_object(
                    'drawPile',      to_jsonb(v_draw_pile),
                    'discardPile',   to_jsonb(v_disc_pile),
                    'currentColor',  v_game->'currentColor',
                    'currentType',   v_game->'currentType',
                    'currentValue',  v_game->'currentValue',
                    'hands', jsonb_set(
                      v_game->'hands',
                      array[v_hand_key],
                      to_jsonb(v_hand || v_drew_cards)
                    ),
                    'direction',     v_game->'direction',
                    'pendingDraw',   0,
                    'drawnThisTurn', false,
                    'lastEvent', jsonb_build_object(
                      'seat',        v_turn,
                      'type',        'draw_card',
                      'card',        null,
                      'chosenColor', null,
                      'drewCards',   to_jsonb(v_drew_cards)
                    )
                  )
                )
    where id = p_session;
    return;
  end if;

  -- ── Voluntary draw: original logic (unchanged from 0018) ─────

  v_hand_key      := v_turn::text;
  v_already_drawn := coalesce((v_game->>'drawnThisTurn')::boolean, false);
  if v_already_drawn then
    raise exception 'already drawn this turn';
  end if;

  v_draw_pile := array(select jsonb_array_elements_text(v_game->'drawPile'));
  v_disc_pile := array(select jsonb_array_elements_text(v_game->'discardPile'));
  v_hand      := array(select jsonb_array_elements_text(v_game->'hands'->v_hand_key));

  if cardinality(v_draw_pile) = 0 then
    if cardinality(v_disc_pile) <= 1 then
      raise exception 'no cards left to draw';
    end if;
    select array_agg(c order by random())
    into v_draw_pile
    from unnest(v_disc_pile[2:cardinality(v_disc_pile)]) as c;
    v_disc_pile := array[v_disc_pile[1]];
  end if;

  v_drawn    := v_draw_pile[1];
  v_new_draw := v_draw_pile[2:cardinality(v_draw_pile)];
  v_new_hand := v_hand || v_drawn;

  v_parsed     := public._uno_parse_card(v_drawn);
  v_card_color := v_parsed->>'color';
  v_card_type  := v_parsed->>'type';
  v_card_value := (v_parsed->>'value')::int;
  v_curr_color := v_game->>'currentColor';
  v_curr_type  := v_game->>'currentType';
  v_curr_value := (v_game->>'currentValue')::int;

  v_playable :=
    v_card_type = 'number'
    and (
      v_card_color = v_curr_color
      or (v_curr_type = 'number' and v_curr_value is not null and v_curr_value = v_card_value)
    );

  v_new_turn := case when v_playable then v_turn else 3 - v_turn end;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      v_new_turn,
                'startTurn', s.state->'startTurn',
                'winner',    null,
                'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                'game', jsonb_build_object(
                  'drawPile',      to_jsonb(v_new_draw),
                  'discardPile',   to_jsonb(v_disc_pile),
                  'currentColor',  v_game->'currentColor',
                  'currentType',   v_game->'currentType',
                  'currentValue',  v_game->'currentValue',
                  'hands', jsonb_set(
                    v_game->'hands',
                    array[v_hand_key],
                    to_jsonb(v_new_hand)
                  ),
                  'direction',     v_game->'direction',
                  'pendingDraw',   v_game->'pendingDraw',
                  'drawnThisTurn', v_playable,
                  'lastEvent', jsonb_build_object(
                    'seat',        v_turn,
                    'type',        'draw_card',
                    'card',        null,
                    'chosenColor', null,
                    'drewCards',   jsonb_build_array(v_drawn)
                  )
                )
              )
  where id = p_session;
end;
$$;

grant execute on function public.game_draw(uuid) to authenticated, anon;
