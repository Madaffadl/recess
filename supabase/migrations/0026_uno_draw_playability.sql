-- ============================================================
-- Recess — UNO: Voluntary draw playability for all card types
--
-- In 0023 game_draw's voluntary-draw path only recognises number
-- cards as playable after a draw. Now that Skip, Reverse, Draw Two,
-- Wild, and Wild Draw Four are all in play, the drawn card must be
-- checked with the same rules as canPlayCard() in logic.ts:
--
--   Wild / Wild Draw Four → always playable
--   Any colour card       → same colour as current
--   Number                → same colour OR same value (number-on-number)
--   Action (S/R/D2)       → same colour OR same action type
--
-- Only change from 0023: the v_playable := block (5 lines → 7 lines).
-- Everything else is byte-for-byte identical to 0023.
-- ============================================================

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
  -- forced multi-draw (from 0023)
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

  -- ── Voluntary draw ───────────────────────────────────────────

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

  -- Mirrors canPlayCard() in logic.ts — covers all six card types.
  v_playable :=
    v_card_type in ('wild', 'wild_draw_four')
    or v_card_color = v_curr_color
    or (v_card_type = 'number' and v_curr_type = 'number'
        and v_curr_value is not null and v_curr_value = v_card_value)
    or (v_card_type not in ('number', 'wild', 'wild_draw_four')
        and v_card_type = v_curr_type);

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
