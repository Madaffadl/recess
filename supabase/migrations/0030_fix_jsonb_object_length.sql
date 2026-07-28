-- ============================================================
-- Fix: jsonb_object_length() was added in PostgreSQL 16.
-- Replace every call with (select count(*) from jsonb_each(x))::int
-- which works on all PostgreSQL versions supported by Supabase.
--
-- Affected functions: game_move, game_draw, _uno_apply_move
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- game_move
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
  v_uid          uuid := auth.uid();
  s              record;
  v_turn         int;
  v_apply_fn     text;
  v_res          jsonb;
  v_result       text;
  v_win          boolean;
  v_draw         boolean;
  v_player_count int;
  v_direction    int;
  v_default_next int;
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

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      coalesce(
                               (v_res->>'nextTurn')::int,
                               case when v_win or v_draw then v_turn else v_default_next end
                             ),
                'startTurn', s.state->'startTurn',
                'winner',    case when v_win then v_turn when v_draw then 0 else null end,
                'moveCount', coalesce((s.state->>'moveCount')::int, 0) + 1,
                'game',      v_res->'game'
              ),
      status = case when v_win or v_draw then 'finished' else 'active' end
  where id = p_session;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- game_draw
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

  -- ── Forced draw ───────────────────────────────────────────
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
                  'turn',      ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1,
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

  -- ── Voluntary draw ────────────────────────────────────────
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
    else ((v_turn - 1 + v_direction + v_player_count) % v_player_count) + 1
  end;

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


-- ─────────────────────────────────────────────────────────────
-- _uno_apply_move
-- ─────────────────────────────────────────────────────────────
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
  v_result_value int;
  v_result_dir   jsonb;
  v_event_type   text;
  v_next_turn    int;
  v_result_color text;
  v_pending_val  int;
  v_chosen_color text;
  v_player_count int;
  v_direction    int;
begin
  if v_type = 'noop' then
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

    v_hand := array(
      select jsonb_array_elements_text(p_game->'hands'->v_hand_key)
    );

    if not (v_card = any(v_hand)) then
      return jsonb_build_object('result', 'illegal');
    end if;

    v_parsed     := public._uno_parse_card(v_card);
    v_card_color := v_parsed->>'color';
    v_card_type  := v_parsed->>'type';
    v_card_value := (v_parsed->>'value')::int;

    v_player_count := (select count(*)::int from jsonb_each(p_game->'hands'));
    v_direction    := coalesce((p_game->>'direction')::int, 1);

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

    elsif v_card_type = 'skip' then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := p_game->'direction';
      v_event_type   := 'skip';
      v_next_turn    := ((p_player - 1 + 2 * v_direction + 2 * v_player_count) % v_player_count) + 1;
      v_pending_val  := 0;

    elsif v_card_type = 'reverse' then
      if v_card_color <> v_curr_color and v_card_type <> v_curr_type then
        return jsonb_build_object('result', 'illegal');
      end if;
      v_result_color := v_card_color;
      v_result_value := null;
      v_result_dir   := to_jsonb(v_direction * -1);
      v_event_type   := 'reverse';
      if v_player_count = 2 then
        v_next_turn := p_player;
      else
        v_next_turn := ((p_player - 1 - v_direction + v_player_count) % v_player_count) + 1;
      end if;
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

    -- Remove first occurrence of card from hand
    v_new_hand := array[]::text[];
    v_removed  := false;
    for i in 1..cardinality(v_hand) loop
      if v_hand[i] = v_card and not v_removed then
        v_removed := true;
      else
        v_new_hand := v_new_hand || v_hand[i];
      end if;
    end loop;

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
        'unoDeclared', p_game->'unoDeclared',
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

-- Re-grant functions that were already granted in 0029
grant execute on function public.game_move(uuid, jsonb) to authenticated, anon;
grant execute on function public.game_draw(uuid)        to authenticated, anon;
