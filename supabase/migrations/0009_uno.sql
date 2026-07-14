-- ============================================================
-- Recess — UNO  (Phase 2A: Foundation)
--
-- Implements the two functions dispatched by 0002_game_core.sql:
--   _uno_initial_state()
--   _uno_apply_move(game jsonb, action jsonb, player int)
--
-- Phase 2A scope: initial state only.
-- apply_move is a noop stub — full gameplay added in later phases.
--
-- Run AFTER 0002_game_core.sql.
--
-- ── Card encoding ────────────────────────────────────────────
--   Color prefix : R (Red) · G (Green) · B (Blue) · Y (Yellow)
--   Number       : R0–R9, G0–G9, B0–B9, Y0–Y9
--   Skip         : RS, GS, BS, YS
--   Reverse      : RR, GR, BR, YR
--   Draw Two     : RD2, GD2, BD2, YD2
--   Wild         : W
--   Wild Draw 4  : WD4
--
-- ── state.game shape ─────────────────────────────────────────
--   {
--     "drawPile":    string[]          [0] = next card to draw
--     "discardPile": string[]          [0] = most recently played
--     "currentColor": string           active color
--     "currentType":  string           active card type
--     "currentValue": int | null       null for non-number cards
--     "hands":       {"1": string[], "2": string[]}
--     "direction":   1 | -1
--     "pendingDraw": int
--     "lastEvent":   { seat, type, card, chosenColor, drewCards }
--   }
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- _uno_parse_card  (private helper)
--
-- Parses a card string into its color, type, and numeric value.
-- Must be defined before _uno_initial_state which calls it.
-- ─────────────────────────────────────────────────────────────
create or replace function public._uno_parse_card(p_card text)
returns jsonb
language sql
immutable
as $$
  select case
    -- Exact wild matches first to avoid ambiguity
    when p_card = 'W' then
      jsonb_build_object('color', null, 'type', 'wild', 'value', null)
    when p_card = 'WD4' then
      jsonb_build_object('color', null, 'type', 'wild_draw_four', 'value', null)
    -- Draw Two before single-char suffix checks (right(2) = 'D2')
    when right(p_card, 2) = 'D2' then
      jsonb_build_object(
        'color', case left(p_card, 1)
                   when 'R' then 'red'
                   when 'G' then 'green'
                   when 'B' then 'blue'
                   else 'yellow' end,
        'type',  'draw_two',
        'value', null
      )
    when right(p_card, 1) = 'S' then
      jsonb_build_object(
        'color', case left(p_card, 1)
                   when 'R' then 'red'
                   when 'G' then 'green'
                   when 'B' then 'blue'
                   else 'yellow' end,
        'type',  'skip',
        'value', null
      )
    when right(p_card, 1) = 'R' then
      jsonb_build_object(
        'color', case left(p_card, 1)
                   when 'R' then 'red'
                   when 'G' then 'green'
                   when 'B' then 'blue'
                   else 'yellow' end,
        'type',  'reverse',
        'value', null
      )
    -- Everything else is a number card
    else
      jsonb_build_object(
        'color', case left(p_card, 1)
                   when 'R' then 'red'
                   when 'G' then 'green'
                   when 'B' then 'blue'
                   else 'yellow' end,
        'type',  'number',
        'value', substring(p_card from 2)::int
      )
  end;
$$;


-- ─────────────────────────────────────────────────────────────
-- _uno_initial_state  (called by game_join)
--
-- Builds a 108-card deck, shuffles it, deals 7 cards to each
-- player, and places the first non-WD4 card on the discard pile.
--
-- Deck composition:
--   4 colours × 25 cards = 100  (1×0, 2×1–9, 2×S, 2×R, 2×D2)
--   4×W  +  4×WD4          =   8
--   Total                  = 108
-- ─────────────────────────────────────────────────────────────
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
begin
  -- ── 1. Build deck ───────────────────────────────────────────
  select array_agg(card)
  into v_deck
  from (
    -- Colour cards: cross-join colour prefix × suffix list
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
    -- Wild cards
    select unnest(array['W','W','W','W','WD4','WD4','WD4','WD4'])
  ) cards;

  -- ── 2. Shuffle ──────────────────────────────────────────────
  select array_agg(card order by random())
  into v_shuffled
  from unnest(v_deck) as card;

  -- ── 3. Deal 7 cards to each player ──────────────────────────
  -- hands[1] = v_shuffled[1..7]
  -- hands[2] = v_shuffled[8..14]
  -- discard   starts at v_shuffled[15]
  -- drawPile  = v_shuffled[16..108]

  -- ── 4. Find first non-WD4 discard card ──────────────────────
  -- Per UNO rules, Wild Draw Four cannot be the starting card.
  -- Scan from position 15 forward; swap WD4 back into drawPile.
  v_idx := 15;
  loop
    exit when v_idx > 108;
    exit when v_shuffled[v_idx] <> 'WD4';
    -- Swap this WD4 to a random position in the draw pile (16..108)
    -- For simplicity in Phase 2A: just advance the index.
    v_idx := v_idx + 1;
  end loop;

  -- If every card from 15 onward was WD4 (statistically impossible
  -- but defensive): fall back to position 15 and use 'red' as color.
  if v_idx > 108 then
    v_idx := 15;
  end if;

  v_discard := v_shuffled[v_idx];
  v_parsed  := public._uno_parse_card(v_discard);

  -- Active color: use card color, or 'red' if starting card is Wild.
  v_color := coalesce(v_parsed->>'color', 'red');

  -- ── 5. Build drawPile (exclude dealt cards and discard) ──────
  -- Concatenate: v_shuffled[15..v_idx-1] + v_shuffled[v_idx+1..108]
  -- (the skipped WD4s and the remaining deck)
  return jsonb_build_object(
    'drawPile',
      to_jsonb(
        v_shuffled[15:(v_idx - 1)] || v_shuffled[(v_idx + 1):108]
      ),
    'discardPile',
      jsonb_build_array(v_discard),
    'currentColor',  v_color,
    'currentType',   v_parsed->>'type',
    'currentValue',  v_parsed->'value',
    'hands', jsonb_build_object(
      '1', to_jsonb(v_shuffled[1:7]),
      '2', to_jsonb(v_shuffled[8:14])
    ),
    'direction',   1,
    'pendingDraw', 0,
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


-- ─────────────────────────────────────────────────────────────
-- _uno_apply_move  (called by game_move)
--
-- Phase 2A stub: only "noop" is accepted.
-- All other action types return "illegal" until Phase 2B.
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
begin
  if (p_action->>'type') = 'noop' then
    return jsonb_build_object('result', 'continue', 'game', p_game);
  end if;

  -- Gameplay will be implemented in Phase 2B.
  return jsonb_build_object('result', 'illegal');
end;
$$;


-- ── Revoke public execute from all three functions ────────────
-- They are only ever called by the SECURITY DEFINER functions
-- in 0002_game_core.sql (which runs as the function owner).
revoke all on function public._uno_parse_card(text)              from public;
revoke all on function public._uno_initial_state()               from public;
revoke all on function public._uno_apply_move(jsonb, jsonb, int) from public;
