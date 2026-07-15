-- ─────────────────────────────────────────────────────────────────────────────
-- Draw Together — robustness + polish
--
--   1. Host leaves        → reassign host to the next remaining player.
--   2. Drawer leaves      → end the round so the game never gets stuck.
--   3. Too few players    → next_round finishes the game instead of stalling.
--   4. Progressive hints  → reveal letters over time (word stays server-side).
--
-- Additive migration — safe to run after 0015. Uses create-or-replace on the
-- existing functions (unchanged signatures) plus two new functions.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── draw_together_leave (host reassign + drawer-leave ends round) ───────────
create or replace function draw_together_leave(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_uid       uuid := auth.uid();
  v_session   draw_together_session;
  v_remaining jsonb;
  v_secret    draw_together_round_secret;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if not found then return; end if;

  -- Drop the leaver from the roster.
  v_remaining := (
    select coalesce(jsonb_agg(p), '[]'::jsonb)
    from jsonb_array_elements(v_session.players) p
    where p->>'userId' <> v_uid::text
  );

  update draw_together_session
  set players = v_remaining, updated_at = now()
  where id = p_session_id;

  -- If the host left, promote the first remaining player so the game can still
  -- be advanced / restarted.
  if v_session.host_id = v_uid and jsonb_array_length(v_remaining) > 0 then
    update draw_together_session
    set host_id = (v_remaining->0->>'userId')::uuid
    where id = p_session_id;
  end if;

  -- If the current drawer left mid-round, close the round out (reveal the word)
  -- so remaining players aren't stuck waiting on someone who's gone.
  if v_session.current_drawer_id = v_uid
     and v_session.status in ('word_selection', 'drawing') then
    select * into v_secret
    from draw_together_round_secret
    where session_id = p_session_id and round_num = v_session.current_round;

    update draw_together_session
    set status              = 'round_end',
        round_word_revealed = coalesce(v_secret.word, '???'),
        updated_at          = now()
    where id = p_session_id;
  end if;
end;
$$;

-- ─── draw_together_next_round (finish early if <2 players remain) ─────────────
create or replace function draw_together_next_round(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_uid         uuid := auth.uid();
  v_session     draw_together_session;
  v_total       int;
  v_pc          int;
  v_drawer_idx  int;
  v_next_idx    int;
  v_next_drawer jsonb;
  v_words       text[];
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.host_id != v_uid        then raise exception 'not_host'; end if;
  if v_session.status  != 'round_end'  then raise exception 'wrong_status'; end if;

  v_pc := jsonb_array_length(v_session.players);

  -- Not enough players to keep going → end the game.
  if v_pc < 2 then
    update draw_together_session
    set status = 'finished', updated_at = now()
    where id = p_session_id;
    return;
  end if;

  v_total := v_session.rounds_per_player * v_pc;

  if v_session.current_round >= v_total then
    update draw_together_session
    set status = 'finished', updated_at = now()
    where id = p_session_id;
    return;
  end if;

  -- Rotate to the next drawer. If the previous drawer left, their id won't be
  -- found (idx = null) → start from index 0.
  select i into v_drawer_idx
  from generate_series(0, v_pc - 1) i
  where (v_session.players->i->>'userId') = v_session.current_drawer_id::text;

  v_drawer_idx  := coalesce(v_drawer_idx, -1);
  v_next_idx    := (v_drawer_idx + 1) % v_pc;
  v_next_drawer := v_session.players -> v_next_idx;
  v_words       := _dt_pick_words();

  update draw_together_session
  set players = (
    select jsonb_agg(p || '{"hasGuessed":false}'::jsonb)
    from jsonb_array_elements(players) p
  )
  where id = p_session_id;

  insert into draw_together_round_secret
    (session_id, round_num, drawer_id, word, word_options)
  values
    (p_session_id, v_session.current_round + 1,
     (v_next_drawer->>'userId')::uuid, v_words[1], v_words);

  update draw_together_session
  set status              = 'word_selection',
      current_round       = current_round + 1,
      current_drawer_id   = (v_next_drawer->>'userId')::uuid,
      current_word_length = null,
      current_word_hint   = null,
      round_word_revealed = null,
      round_started_at    = null,
      updated_at          = now()
  where id = p_session_id;
end;
$$;

-- ─── _dt_build_hint ───────────────────────────────────────────────────────────
-- Builds a masked hint string revealing `p_reveal` letters in a deterministic,
-- scattered order (seeded by the word, so all clients converge). Spaces render
-- as '/'; hidden letters as '_'; revealed letters show the character.
create or replace function _dt_build_hint(p_word text, p_reveal int)
returns text
language plpgsql
as $$
declare
  v_len          int := char_length(p_word);
  v_positions    int[];   -- non-space letter indices, scattered reveal order
  v_result       text := '';
  v_letter_idx   int := 0;
  i              int;
  c              text;
begin
  select array_agg(idx order by md5(p_word || idx::text))
    into v_positions
  from (
    select gs - 1 as idx
    from generate_series(1, v_len) gs
    where substr(p_word, gs, 1) <> ' '
  ) t;

  if v_positions is null then return _dt_make_hint(p_word); end if;
  v_positions := v_positions[1:greatest(0, p_reveal)];

  for i in 1..v_len loop
    c := substr(p_word, i, 1);
    if c = ' ' then
      v_result := v_result || '/ ';
    else
      if v_letter_idx = any(v_positions) then
        v_result := v_result || c || ' ';
      else
        v_result := v_result || '_ ';
      end if;
      v_letter_idx := v_letter_idx + 1;
    end if;
  end loop;

  return rtrim(v_result);
end;
$$;

-- ─── draw_together_reveal_hint ───────────────────────────────────────────────
-- Idempotent, time-based letter reveal. Any client may call it repeatedly; it
-- computes how many letters SHOULD be shown from elapsed time and updates the
-- shared hint only when it actually changes (avoids realtime churn).
--
-- Schedule: reveal nothing for the first 30% of the round, then linearly reveal
-- up to half the letters by the end.
create or replace function draw_together_reveal_hint(p_session_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_session draw_together_session;
  v_secret  draw_together_round_secret;
  v_letters int;
  v_max     int;
  v_elapsed float;
  v_frac    float;
  v_target  int;
  v_hint    text;
begin
  select * into v_session from draw_together_session where id = p_session_id;
  if v_session.status != 'drawing' or v_session.round_started_at is null then
    return;
  end if;

  select * into v_secret
  from draw_together_round_secret
  where session_id = p_session_id and round_num = v_session.current_round;
  if not found then return; end if;

  v_letters := char_length(replace(v_secret.word, ' ', ''));
  v_max     := floor(v_letters * 0.5);
  if v_max < 1 then return; end if;

  v_elapsed := extract(epoch from now() - v_session.round_started_at);
  v_frac    := least(1.0, greatest(0.0, v_elapsed / nullif(v_session.draw_seconds, 0)));
  v_target  := floor(v_max * greatest(0.0, (v_frac - 0.3) / 0.7));
  if v_target < 1 then return; end if;

  v_hint := _dt_build_hint(v_secret.word, v_target);
  if v_hint is distinct from v_session.current_word_hint then
    update draw_together_session
    set current_word_hint = v_hint, updated_at = now()
    where id = p_session_id;
  end if;
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function _dt_build_hint(text, int) from public;
grant  execute on function draw_together_reveal_hint(uuid) to authenticated, anon;
