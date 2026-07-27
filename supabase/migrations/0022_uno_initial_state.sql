-- ============================================================
-- Recess — UNO: Physical setup for _uno_initial_state()
--
-- Fixes the only deviation from physical UNO setup in 0009:
-- when the starting-card candidate is WD4, the original code
-- skipped it by advancing the index, which left the displaced
-- WD4(s) at the front of the draw pile instead of randomly
-- reinserted.
--
-- Change from 0009:
--   declare  — add v_drawpile text[]
--   step 5   — after slicing out the discard card, reshuffle the
--              raw draw pile so displaced WD4s land at random
--              positions (was: left at index 0 of draw pile)
--   return   — drawPile uses v_drawpile instead of inline slice
--
-- All other logic is unchanged.
-- ============================================================

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
  -- ── 1. Build deck ───────────────────────────────────────────
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

  -- ── 2. Shuffle ──────────────────────────────────────────────
  select array_agg(card order by random())
  into v_shuffled
  from unnest(v_deck) as card;

  -- ── 3. Deal 7 cards to each player ──────────────────────────
  -- hands[1] = v_shuffled[1..7]
  -- hands[2] = v_shuffled[8..14]

  -- ── 4. Find first non-WD4 starting card ─────────────────────
  -- Per UNO rules Wild Draw Four may not open the discard pile.
  v_idx := 15;
  loop
    exit when v_idx > 108;
    exit when v_shuffled[v_idx] <> 'WD4';
    v_idx := v_idx + 1;
  end loop;

  -- Statistically impossible, but defensive.
  if v_idx > 108 then
    v_idx := 15;
  end if;

  v_discard := v_shuffled[v_idx];
  v_parsed  := public._uno_parse_card(v_discard);
  v_color   := coalesce(v_parsed->>'color', 'red');

  -- ── 5. Build draw pile ──────────────────────────────────────
  -- Collect the raw draw pile: any WD4s that were skipped
  -- (positions 15..v_idx-1) plus the remaining deck
  -- (positions v_idx+1..108). Reshuffle so the WD4s end up at
  -- random positions rather than the front.
  select array_agg(c order by random())
  into v_drawpile
  from unnest(
    v_shuffled[15:(v_idx - 1)] || v_shuffled[(v_idx + 1):108]
  ) as c;

  return jsonb_build_object(
    'drawPile',     to_jsonb(v_drawpile),
    'discardPile',  jsonb_build_array(v_discard),
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

-- Re-revoke (create or replace resets grants)
revoke all on function public._uno_initial_state() from public;
