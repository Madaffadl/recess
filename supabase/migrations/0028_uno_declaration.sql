-- ============================================================
-- Recess — UNO: UNO declaration (field + RPC)
--
-- Adds the unoDeclared field to game state and introduces the
-- game_uno_declare() RPC. Penalty enforcement is deferred.
--
-- ── Why _uno_apply_move is touched ───────────────────────────
-- _uno_apply_move rebuilds the entire game object in its return;
-- any field not included is silently dropped. Without the +1-line
-- propagation below, a declaration would be lost on the very
-- next card play, making the feature untestable in isolation.
-- game_draw is NOT modified here; lifecycle clearing (when the
-- declaring player draws and their hand grows) is a follow-up.
--
-- ── Changes ──────────────────────────────────────────────────
--   _uno_initial_state : +1 — 'unoDeclared', null
--   _uno_apply_move    : +1 — propagate p_game->'unoDeclared'
--   game_uno_declare   : NEW
-- ============================================================


-- ── _uno_initial_state ────────────────────────────────────────

create or replace function public._uno_initial_state()
returns jsonb
language plpgsql
as $$
declare
  v_deck     text[];
  v_shuffled text[];
  v_discard  text;
  v_parsed   jsonb;
  v_color    text;
  v_idx      int;
  v_drawpile text[];
begin
  select array_agg(card)
  into v_deck
  from (
    select (color || suffix) as card
    from
      unnest(array['R','G','B','Y']) as color,
      unnest(array[
        '0',
        '1','1','2','2','3','3','4','4','5','5',
        '6','6','7','7','8','8','9','9',
        'S','S','R','R','D2','D2'
      ]) as suffix
    union all
    select unnest(array['W','W','W','W','WD4','WD4','WD4','WD4'])
  ) cards;

  select array_agg(card order by random())
  into v_shuffled
  from unnest(v_deck) as card;

  v_idx := 15;
  loop
    exit when v_idx > 108;
    exit when v_shuffled[v_idx] <> 'WD4';
    v_idx := v_idx + 1;
  end loop;

  if v_idx > 108 then
    v_idx := 15;
  end if;

  v_discard := v_shuffled[v_idx];
  v_parsed  := public._uno_parse_card(v_discard);
  v_color   := coalesce(v_parsed->>'color', 'red');

  select array_agg(c order by random())
  into v_drawpile
  from unnest(
    v_shuffled[15:(v_idx - 1)] || v_shuffled[(v_idx + 1):108]
  ) as c;

  return jsonb_build_object(
    'drawPile',     to_jsonb(v_drawpile),
    'discardPile',  jsonb_build_array(v_discard),
    'currentColor', v_color,
    'currentType',  v_parsed->>'type',
    'currentValue', v_parsed->'value',
    'hands', jsonb_build_object(
      '1', to_jsonb(v_shuffled[1:7]),
      '2', to_jsonb(v_shuffled[8:14])
    ),
    'direction',   1,
    'pendingDraw', 0,
    'unoDeclared', null,   -- NEW in 0028
    'lastEvent', jsonb_build_object(
      'seat',        1,
      'type',        'game_start',
      'card',        v_discard,
      'chosenColor', null,
      'drewCards',   jsonb_build_array()
    )
  );
end;
$$;

revoke all on function public._uno_initial_state() from public;


-- ── _uno_apply_move ───────────────────────────────────────────
-- Only change from 0027: 'unoDeclared', p_game->'unoDeclared'
-- added to the returned game object so the field survives plays.

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
        'unoDeclared', p_game->'unoDeclared',   -- NEW in 0028: propagate
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


-- ── game_uno_declare ──────────────────────────────────────────
-- Not turn-gated: either seated player may call this whenever
-- their hand has exactly one card, including immediately after
-- the turn flips following their second-to-last-card play.

create or replace function public.game_uno_declare(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  s      record;
  v_seat int  := null;
  i      int;
  v_hand text[];
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

  for i in 1..2 loop
    if (s.state->'players'->(i::text)->>'id') = v_uid::text then
      v_seat := i;
      exit;
    end if;
  end loop;

  if v_seat is null then
    raise exception 'not a participant';
  end if;

  v_hand := array(
    select jsonb_array_elements_text(s.state->'game'->'hands'->(v_seat::text))
  );

  if cardinality(v_hand) <> 1 then
    raise exception 'can only declare UNO with exactly one card';
  end if;

  update public.game_session
  set state = jsonb_set(s.state, '{game,unoDeclared}', to_jsonb(v_seat))
  where id = p_session;
end;
$$;

grant execute on function public.game_uno_declare(uuid) to authenticated, anon;
