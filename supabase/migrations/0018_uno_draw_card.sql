-- ============================================================
-- Recess — UNO Phase 2C: Draw Card
--
-- Adds game_draw(p_session uuid) only. No existing functions
-- are replaced; _uno_initial_state and _uno_apply_move are
-- intentionally untouched.
--
-- drawnThisTurn lifecycle (managed entirely by game_draw):
--   VALIDATED : game_draw — raises if true (blocks second draw)
--   SET true  : game_draw — drawn card is playable, turn kept
--   SET false : game_draw — drawn card is not playable, turn passes
--   RESET     : absent after _uno_apply_move rebuilds game state;
--               coalesce(null, false) in game_draw treats absence
--               as false, so the next player can always draw.
--
-- Run AFTER 0017_game_ready.sql and 0010_uno_play_card.sql.
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

  v_turn := (s.state->>'turn')::int;
  if (s.state->'players'->(v_turn::text)->>'id') <> v_uid::text then
    raise exception 'not your turn';
  end if;

  v_game := s.state->'game';

  -- Enforce draw-once-per-turn server-side.
  -- coalesce handles sessions that pre-date this migration or
  -- whose last action was _uno_apply_move (which does not write
  -- drawnThisTurn, so the field is absent — treated as false).
  v_already_drawn := coalesce((v_game->>'drawnThisTurn')::boolean, false);
  if v_already_drawn then
    raise exception 'already drawn this turn';
  end if;

  v_hand_key  := v_turn::text;
  v_draw_pile := array(select jsonb_array_elements_text(v_game->'drawPile'));
  v_disc_pile := array(select jsonb_array_elements_text(v_game->'discardPile'));
  v_hand      := array(select jsonb_array_elements_text(v_game->'hands'->v_hand_key));

  -- Reshuffle discard pile (except top card) into draw pile when empty.
  -- discardPile is prepend-ordered: index 1 (PL/pgSQL) = index 0 (JS) = top card.
  if cardinality(v_draw_pile) = 0 then
    if cardinality(v_disc_pile) <= 1 then
      raise exception 'no cards left to draw';
    end if;
    select array_agg(c order by random())
    into v_draw_pile
    from unnest(v_disc_pile[2:cardinality(v_disc_pile)]) as c;
    v_disc_pile := array[v_disc_pile[1]];
  end if;

  -- Draw the top card and add it to the player's hand.
  v_drawn    := v_draw_pile[1];
  v_new_draw := v_draw_pile[2:cardinality(v_draw_pile)];
  v_new_hand := v_hand || v_drawn;

  -- Playability check — mirrors frontend canPlayCard() exactly.
  -- Scope: Phase 2B (number cards only).
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

  -- drawnThisTurn = v_playable:
  --   true  → turn kept; player may play the card; second draw blocked.
  --   false → turn passes; opponent reads coalesce(false, false) = false.
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
