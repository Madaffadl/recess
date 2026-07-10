-- ─────────────────────────────────────────────────────────────────────────────
-- Word Snake — Time-based scoring
--
-- Replaces word-length scoring in word_snake_submit with time-elapsed scoring:
--
--   elapsed < 3s   → 3 pts  (fast)
--   3s ≤ elapsed < 7s → 2 pts  (medium)
--   7s ≤ elapsed < 10s → 1 pt   (slow)
--   elapsed ≥ 10s  → timeout, handled by word_snake_timeout (no points, -1 life)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function word_snake_submit(
  p_session_id uuid,
  p_word       text
)
returns void
language plpgsql
security definer
as $$
declare
  v_uid           uuid := auth.uid();
  v_sess          record;
  v_players       jsonb;
  v_turn_idx      int;
  v_cur_player    jsonb;
  v_chain         text[];
  v_last_word     text;
  v_prompt_ltr    text;
  v_word          text;
  v_lives         int;
  v_score         int;
  v_is_valid      bool;
  v_total         int;
  v_new_idx       int;
  v_iter          int;
  v_active_cnt    int;
  v_winner_id     text;
  v_new_state     jsonb;
  -- time-based scoring
  v_turn_start_ms bigint;
  v_elapsed_s     numeric;
  v_points        int;
begin
  select * into v_sess
    from public.game_session
   where id      = p_session_id
     and game_id  = 'word-snake'
     and status   = 'active'
   for update;

  if v_sess is null then
    raise exception 'Game not active';
  end if;

  v_players    := v_sess.state -> 'players';
  v_turn_idx   := (v_sess.state ->> 'turnIndex')::int;
  v_cur_player := v_players -> v_turn_idx;

  if v_cur_player ->> 'id' <> v_uid::text then
    raise exception 'Not your turn';
  end if;

  -- Extract chain
  select array_agg(elem order by ord)
    into v_chain
    from jsonb_array_elements_text(v_sess.state -> 'chain')
         with ordinality as t(elem, ord);

  v_word       := lower(trim(p_word));
  v_last_word  := v_chain[array_length(v_chain, 1)];
  v_prompt_ltr := upper(right(v_last_word, 1));
  v_lives      := (v_cur_player ->> 'lives')::int;
  v_score      := (v_cur_player ->> 'score')::int;

  -- Structural validation (dictionary checked client-side)
  v_is_valid := (
    length(v_word) >= 3
    and upper(left(v_word, 1)) = v_prompt_ltr
    and not exists (
      select 1
        from unnest(v_chain) as cw
       where lower(cw) = v_word
    )
  );

  if v_is_valid then
    v_chain := v_chain || v_word;

    -- ── Time-based scoring ─────────────────────────────────────────────────
    -- turnExpiresAt is epoch-ms; turn started 10 000 ms before that.
    v_turn_start_ms := (v_sess.state ->> 'turnExpiresAt')::bigint - 10000;
    v_elapsed_s     := (floor(extract(epoch from now()) * 1000) - v_turn_start_ms) / 1000.0;

    v_points := case
      when v_elapsed_s < 3 then 3  -- fast
      when v_elapsed_s < 7 then 2  -- medium
      else 1                        -- slow (7–10s)
    end;

    v_score   := v_score + v_points;
    v_players := jsonb_set(v_players,
                   array[v_turn_idx::text, 'score'],
                   to_jsonb(v_score));
  else
    v_lives   := v_lives - 1;
    v_players := jsonb_set(v_players,
                   array[v_turn_idx::text, 'lives'],
                   to_jsonb(v_lives));
    if v_lives <= 0 then
      v_players := jsonb_set(v_players,
                     array[v_turn_idx::text, 'eliminated'],
                     'true'::jsonb);
    end if;
  end if;

  -- How many players still have lives?
  select count(*) into v_active_cnt
    from jsonb_array_elements(v_players) as p
   where not coalesce((p ->> 'eliminated')::boolean, false);

  v_winner_id := null;
  if v_active_cnt = 1 then
    select p ->> 'id' into v_winner_id
      from jsonb_array_elements(v_players) as p
     where not coalesce((p ->> 'eliminated')::boolean, false)
     limit 1;
  end if;

  -- Advance turn to next non-eliminated player
  v_total   := jsonb_array_length(v_players);
  v_new_idx := v_turn_idx;
  v_iter    := 0;
  if v_winner_id is null then
    loop
      v_new_idx := (v_new_idx + 1) % v_total;
      v_iter    := v_iter + 1;
      exit when not coalesce((v_players -> v_new_idx ->> 'eliminated')::boolean, false);
      exit when v_iter >= v_total;
    end loop;
  end if;

  -- Rebuild state
  v_new_state := v_sess.state;
  v_new_state := jsonb_set(v_new_state, '{players}',   v_players);
  v_new_state := jsonb_set(v_new_state, '{chain}',
    (select jsonb_agg(w) from unnest(v_chain) as w));
  v_new_state := jsonb_set(v_new_state, '{turnIndex}',  to_jsonb(v_new_idx));
  v_new_state := jsonb_set(v_new_state, '{moveCount}',
    to_jsonb(coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1));
  v_new_state := jsonb_set(v_new_state, '{turnExpiresAt}',
    to_jsonb(floor(extract(epoch from now() + interval '10 seconds') * 1000)::bigint));

  if v_winner_id is not null then
    v_new_state := jsonb_set(v_new_state, '{winner}', to_jsonb(v_winner_id));
    update public.game_session
       set state = v_new_state, status = 'finished'
     where id = p_session_id;
  else
    update public.game_session
       set state = v_new_state
     where id = p_session_id;
  end if;
end;
$$;

grant execute on function word_snake_submit(uuid, text) to authenticated, anon;
