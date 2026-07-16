-- ─────────────────────────────────────────────────────────────────────────────
-- Word Snake — game plug-in functions
--
-- Naming: _word_snake_* (hyphens in game-id → underscores, per game_core convention)
-- Called by the generic game_core dispatcher (game_join / game_move / game_rematch).
-- Revoked from public — only the SECURITY DEFINER dispatcher can invoke them.
--
-- State shape (state.game jsonb):
--   chain          text[]    ordered words played so far; first entry = seed word
--   lives          {1,2}     remaining lives per player (start: 3)
--   score          {1,2}     cumulative score per player
--   turnExpiresAt  bigint    epoch-ms when current turn expires (null before first move)
--   lastResult     text|null 'valid' | 'invalid' | 'timeout'
--   actualWinner   int|null  1 or 2; correct winner for display
--                            (state.winner may differ — see _word_snake_apply_move)
-- ─────────────────────────────────────────────────────────────────────────────

-- Initial state: random seed word, 3 lives each, 15-second first turn clock.
create or replace function _word_snake_initial_state()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'chain', jsonb_build_array(
      (array[
        'ocean', 'table', 'crane', 'flame', 'grape', 'piano', 'storm', 'light',
        'dance', 'frame', 'brush', 'clock', 'dream', 'earth', 'music', 'night',
        'plant', 'radio', 'slide', 'tiger', 'whale', 'cloud', 'fancy', 'river',
        'stone'
      ])[floor(random() * 25 + 1)::int]
    ),
    'lives',        jsonb_build_object('1', 3, '2', 3),
    'score',        jsonb_build_object('1', 0, '2', 0),
    'turnExpiresAt', floor(extract(epoch from now() + interval '15 seconds') * 1000)::bigint,
    'lastResult',   null,
    'actualWinner', null
  );
$$;

-- Apply a Word Snake move.
--
-- p_action shapes:
--   { "word": "<string>" }  — player submits a word (dictionary pre-validated by /api/word-snake/validate)
--   { "timeout": true }     — client timer expired for this player
--
-- Returns { "result": "continue"|"win"|"draw"|"illegal", "game": <updated payload> }
--
-- Win condition: current player's lives reach 0 → OTHER player wins.
-- We return result = "win" so game_core sets status = "finished".
-- game_core sets state.winner = current player (the loser), but the board always
-- reads state.game.actualWinner for the correct winner display.
create or replace function _word_snake_apply_move(
  p_game   jsonb,
  p_action jsonb,
  p_player int
)
returns jsonb
language plpgsql
as $$
declare
  v_chain      text[];
  v_word       text;
  v_timeout    boolean;
  v_last_word  text;
  v_prompt_ltr text;
  v_lives_me   int;
  v_score_me   int;
  v_other      int;
  v_is_valid   boolean;
  v_result     text;
  v_new_game   jsonb;
begin
  -- ── Extract chain ────────────────────────────────────────────────────────
  select array_agg(elem order by ord)
    into v_chain
    from jsonb_array_elements_text(p_game -> 'chain')
         with ordinality as t(elem, ord);

  -- ── Parse action ─────────────────────────────────────────────────────────
  v_timeout := coalesce((p_action ->> 'timeout')::boolean, false);
  v_word    := lower(trim(coalesce(p_action ->> 'word', '')));
  v_other   := 3 - p_player;

  -- ── Current player stats ─────────────────────────────────────────────────
  v_lives_me := (p_game -> 'lives' ->> p_player::text)::int;
  v_score_me := (p_game -> 'score' ->> p_player::text)::int;

  -- ── Prompt letter: last char of last chain word ───────────────────────────
  v_last_word  := v_chain[array_length(v_chain, 1)];
  v_prompt_ltr := upper(right(v_last_word, 1));

  -- ── Validate ─────────────────────────────────────────────────────────────
  -- Skip on timeout; dictionary existence was already checked client-side.
  v_is_valid := false;
  if not v_timeout and length(v_word) >= 3 then
    if upper(left(v_word, 1)) = v_prompt_ltr then
      if not exists (
        select 1
          from unnest(v_chain) as chain_word
         where lower(chain_word) = v_word
      ) then
        v_is_valid := true;
      end if;
    end if;
  end if;

  -- ── Apply outcome ─────────────────────────────────────────────────────────
  if v_is_valid then
    v_chain    := v_chain || v_word;
    v_score_me := v_score_me + 1 + greatest(0, length(v_word) - 4);
    v_result   := 'continue';
  else
    v_lives_me := v_lives_me - 1;
    -- Lives at 0: this player is eliminated, other player wins.
    -- Return 'win' so game_core closes the session.
    -- actualWinner in the payload holds the real winner for the board to display.
    v_result := case when v_lives_me <= 0 then 'win' else 'continue' end;
  end if;

  -- ── Build updated game payload ────────────────────────────────────────────
  v_new_game := p_game;

  v_new_game := jsonb_set(v_new_game, '{chain}',
    (select jsonb_agg(w) from unnest(v_chain) as w)
  );

  v_new_game := jsonb_set(v_new_game,
    array['lives', p_player::text],
    to_jsonb(v_lives_me)
  );

  v_new_game := jsonb_set(v_new_game,
    array['score', p_player::text],
    to_jsonb(v_score_me)
  );

  v_new_game := jsonb_set(v_new_game, '{turnExpiresAt}',
    to_jsonb(floor(extract(epoch from now() + interval '15 seconds') * 1000)::bigint)
  );

  v_new_game := jsonb_set(v_new_game, '{lastResult}', to_jsonb(
    case
      when v_is_valid then 'valid'
      when v_timeout  then 'timeout'
      else                 'invalid'
    end
  ));

  if v_result = 'win' then
    v_new_game := jsonb_set(v_new_game, '{actualWinner}', to_jsonb(v_other));
  end if;

  return jsonb_build_object('result', v_result, 'game', v_new_game);
end;
$$;

-- ── Revoke public access (dispatcher-only) ───────────────────────────────────
revoke all on function _word_snake_initial_state()              from public;
revoke all on function _word_snake_apply_move(jsonb, jsonb, int) from public;
