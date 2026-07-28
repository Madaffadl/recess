-- ─────────────────────────────────────────────────────────────
-- 0031_uno_elimination.sql
--
-- Changes UNO end-of-game logic: a player who empties their hand
-- does NOT immediately end the game.  The game continues without
-- them until only one active player remains; that last player is
-- the loser.
--
-- state.rankings  — int[]  ordered finishing positions,
--                          index 0 = 1st place, last = loser.
--                          Populated incrementally; written to
--                          state by game_move / game_draw.
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- Helper: find next seat (1-indexed) that has >= 1 card.
-- Searches up to p_count steps from p_start in p_direction.
-- Returns NULL if no active player found.
-- ─────────────────────────────────────────────────────────────
create or replace function public._uno_next_active_turn(
  p_hands     jsonb,
  p_start     int,
  p_direction int,
  p_count     int
)
returns int
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_seat int := p_start;
  i      int;
begin
  for i in 1..p_count loop
    if jsonb_array_length(coalesce(p_hands->(v_seat::text), '[]'::jsonb)) > 0 then
      return v_seat;
    end if;
    v_seat := ((v_seat - 1 + p_direction + p_count) % p_count) + 1;
  end loop;
  return null;
end;
$$;

revoke all on function public._uno_next_active_turn(jsonb, int, int, int) from public;


-- ─────────────────────────────────────────────────────────────
-- game_move — elimination-aware
-- ─────────────────────────────────────────────────────────────
create or replace function public.game_move(
  p_session uuid,
  p_action  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid    := auth.uid();
  s               record;
  v_turn          int;
  v_apply_fn      text;
  v_res           jsonb;
  v_result        text;
  v_win           boolean;
  v_draw          boolean;
  v_player_count  int;
  v_direction     int;
  v_default_next  int;
  v_rankings      jsonb;
  v_active_count  int;
  v_last_seat     int;
  v_next_turn     int;
  v_explicit_next int;
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

  v_turn := (s.state->>'turn')::int;
  if (s.state->'players'->(v_turn::text)->>'id') <> v_uid::text then
    raise exception 'not your turn';
  end if;

  v_apply_fn := '_' || replace(s.game_id, '-', '_') || '_apply_move';
  if to_regprocedure(format('%I(jsonb,jsonb,integer)', v_apply_fn)) is null then
    raise exception 'unknown game: %', s.game_id;
  end if;

  execute format('select %I($1,$2,$3)', v_apply_fn)
    into v_res
    using (s.state->'game'), p_action, v_turn;

  v_result := v_res->>'result';
  if v_result = 'illegal' then
    raise exception 'illegal move';
  end if;

  v_win  := v_result = 'win';
  v_draw := v_result = 'draw';

  v_direction    := coalesce((v_res->'game'->>'direction')::int, 1);
  v_player_count := coalesce(
    (select count(*)::int from jsonb_each(v_res->'game'->'hands')),
    2
  );
  v_default_next := ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1;

  -- Carry existing rankings forward (empty array if none yet).
  v_rankings := coalesce(s.state->'rankings', '[]'::jsonb);

  if v_win then
    -- Append this player to the rankings.
    v_rankings := v_rankings || to_jsonb(v_turn);

    -- Count players who still have cards in the new game state.
    select count(*)::int into v_active_count
    from jsonb_each(v_res->'game'->'hands') h
    where jsonb_array_length(h.value) > 0;

    if v_active_count <= 1 then
      -- Game over: at most one active player left.
      -- Add the last remaining player (loser) to rankings if present.
      if v_active_count = 1 then
        select (h.key)::int into v_last_seat
        from jsonb_each(v_res->'game'->'hands') h
        where jsonb_array_length(h.value) > 0
        limit 1;
        v_rankings := v_rankings || to_jsonb(v_last_seat);
      end if;

      update public.game_session
      set state = jsonb_build_object(
                    'players',   s.state->'players',
                    'turn',      v_turn,
                    'startTurn', s.state->'startTurn',
                    'winner',    v_turn,
                    'rankings',  v_rankings,
                    'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                    'game',      v_res->'game'
                  ),
          status = 'finished'
      where id = p_session;

    else
      -- Game continues without this player; find the next active seat.
      -- Honour an explicit nextTurn from the move (e.g. Skip), but skip
      -- any seat whose hand is now empty.
      v_explicit_next := (v_res->>'nextTurn')::int;
      if v_explicit_next is not null then
        if jsonb_array_length(coalesce(v_res->'game'->'hands'->(v_explicit_next::text), '[]'::jsonb)) > 0 then
          v_next_turn := v_explicit_next;
        else
          v_next_turn := public._uno_next_active_turn(
            v_res->'game'->'hands',
            ((v_explicit_next - 1 + v_direction + v_player_count) % v_player_count) + 1,
            v_direction, v_player_count
          );
        end if;
      else
        v_next_turn := public._uno_next_active_turn(
          v_res->'game'->'hands', v_default_next, v_direction, v_player_count
        );
      end if;

      update public.game_session
      set state = jsonb_build_object(
                    'players',   s.state->'players',
                    'turn',      coalesce(v_next_turn, v_default_next),
                    'startTurn', s.state->'startTurn',
                    'winner',    null,
                    'rankings',  v_rankings,
                    'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                    'game',      v_res->'game'
                  ),
          status = 'active'
      where id = p_session;
    end if;

  elsif v_draw then
    update public.game_session
    set state = jsonb_build_object(
                  'players',   s.state->'players',
                  'turn',      v_turn,
                  'startTurn', s.state->'startTurn',
                  'winner',    0,
                  'rankings',  v_rankings,
                  'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                  'game',      v_res->'game'
                ),
        status = 'finished'
    where id = p_session;

  else
    -- Normal continue: also skip any finished (empty-hand) players.
    v_next_turn := coalesce((v_res->>'nextTurn')::int, v_default_next);
    if jsonb_array_length(coalesce(v_res->'game'->'hands'->(v_next_turn::text), '[]'::jsonb)) = 0 then
      v_next_turn := public._uno_next_active_turn(
        v_res->'game'->'hands',
        ((v_next_turn - 1 + v_direction + v_player_count) % v_player_count) + 1,
        v_direction, v_player_count
      );
    end if;

    update public.game_session
    set state = jsonb_build_object(
                  'players',   s.state->'players',
                  'turn',      coalesce(v_next_turn, v_default_next),
                  'startTurn', s.state->'startTurn',
                  'winner',    null,
                  'rankings',  v_rankings,
                  'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                  'game',      v_res->'game'
                ),
        status = 'active'
    where id = p_session;
  end if;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- game_draw — carry rankings; skip finished players in
--             turn advancement
-- ─────────────────────────────────────────────────────────────
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
  v_pending       int;
  v_drew_cards    text[];
  j               int;
  v_player_count  int;
  v_direction     int;
  v_rankings      jsonb;
  v_default_next  int;
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

  v_game         := s.state->'game';
  v_pending      := coalesce((v_game->>'pendingDraw')::int, 0);
  v_player_count := coalesce(
    (select count(*)::int from jsonb_each(v_game->'hands')),
    2
  );
  v_direction    := coalesce((v_game->>'direction')::int, 1);
  v_rankings     := coalesce(s.state->'rankings', '[]'::jsonb);
  v_default_next := ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1;

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
                  'turn',      coalesce(
                                 public._uno_next_active_turn(
                                   v_game->'hands', v_default_next,
                                   v_direction, v_player_count
                                 ),
                                 v_default_next
                               ),
                  'startTurn', s.state->'startTurn',
                  'winner',    null,
                  'rankings',  v_rankings,
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
                    'unoDeclared',   v_game->'unoDeclared',
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

  v_playable :=
    v_card_type in ('wild', 'wild_draw_four')
    or v_card_color = v_curr_color
    or (v_card_type = 'number' and v_curr_type = 'number'
        and v_curr_value is not null and v_curr_value = v_card_value)
    or (v_card_type not in ('number', 'wild', 'wild_draw_four')
        and v_card_type = v_curr_type);

  v_new_turn := case
    when v_playable then v_turn
    else coalesce(
      public._uno_next_active_turn(
        v_game->'hands', v_default_next, v_direction, v_player_count
      ),
      v_default_next
    )
  end;

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      v_new_turn,
                'startTurn', s.state->'startTurn',
                'winner',    null,
                'rankings',  v_rankings,
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
                  'unoDeclared',   v_game->'unoDeclared',
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


grant execute on function public.game_move(uuid, jsonb) to authenticated, anon;
grant execute on function public.game_draw(uuid)        to authenticated, anon;
