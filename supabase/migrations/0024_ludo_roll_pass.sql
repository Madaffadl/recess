-- ─────────────────────────────────────────────────────────────────────────────
-- Ludo — roll/pass UX fix
--
-- Original ludo_roll (0023) auto-advanced the turn whenever the roll had no
-- legal move (e.g. every non-6 while all tokens are still in the yard). That
-- discarded the die instantly, so the player never saw what they rolled — it
-- just looked like "rolled → nothing → next player".
--
-- New model:
--   • ludo_roll ALWAYS stores the die (never advances). The client shows it.
--   • If a legal move exists → player taps a token → ludo_move.
--   • If NO legal move exists → ludo_pass advances the turn. The client calls
--     it automatically for the active player after a short beat, so the roll
--     result is visible first. ludo_pass re-checks server-side that the player
--     genuinely has no move (you can't pass to dodge a forced move).
--
-- Run AFTER 0023_ludo.sql. Idempotent (create or replace).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ludo_roll (replaces 0023) ────────────────────────────────────────────────
-- Roll the die (server RNG) and store it. Never advances the turn.
create or replace function public.ludo_roll(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_sess record;
  v_turn int;
  v_cur  jsonb;
  v_dice int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_sess
    from public.game_session
   where id = p_session_id and game_id = 'ludo' and status = 'active'
   for update;
  if v_sess is null then raise exception 'game not active'; end if;

  v_turn := (v_sess.state ->> 'turnIndex')::int;
  v_cur  := v_sess.state -> 'players' -> v_turn;
  if v_cur ->> 'id' <> v_uid::text then raise exception 'not your turn'; end if;
  if coalesce(jsonb_typeof(v_sess.state -> 'dice'), 'null') <> 'null' then
    raise exception 'already rolled — move or pass';
  end if;

  v_dice := floor(random() * 6) + 1;

  update public.game_session
     set state = jsonb_set(
           jsonb_set(state, '{dice}', to_jsonb(v_dice)),
           '{lastEvent}', to_jsonb('rolled'::text)
         )
   where id = p_session_id;
end;
$$;

grant execute on function public.ludo_roll(uuid) to authenticated, anon;


-- ── ludo_pass ────────────────────────────────────────────────────────────────
-- Advance the turn when the active player has no legal move for their roll.
create or replace function public.ludo_pass(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_sess    record;
  v_turn    int;
  v_cur     jsonb;
  v_dice    int;
  v_movable boolean := false;
  v_p       int;
  v_n       int;
  v_next    int;
  ti        int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_sess
    from public.game_session
   where id = p_session_id and game_id = 'ludo' and status = 'active'
   for update;
  if v_sess is null then raise exception 'game not active'; end if;

  v_turn := (v_sess.state ->> 'turnIndex')::int;
  v_cur  := v_sess.state -> 'players' -> v_turn;
  if v_cur ->> 'id' <> v_uid::text then raise exception 'not your turn'; end if;
  if coalesce(jsonb_typeof(v_sess.state -> 'dice'), 'null') = 'null' then
    raise exception 'roll first';
  end if;

  v_dice := (v_sess.state ->> 'dice')::int;

  -- You may only pass when you genuinely cannot move.
  for ti in 0 .. 3 loop
    v_p := (v_cur -> 'tokens' ->> ti)::int;
    if public._ludo_token_target(v_p, v_dice) >= 0 then
      v_movable := true;
      exit;
    end if;
  end loop;
  if v_movable then raise exception 'you have a legal move'; end if;

  v_n    := jsonb_array_length(v_sess.state -> 'players');
  v_next := (v_turn + 1) % v_n;

  update public.game_session
     set state = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(state, '{dice}', 'null'::jsonb),
               '{turnIndex}', to_jsonb(v_next)
             ),
             '{lastEvent}', to_jsonb('nomove'::text)
           ),
           '{moveCount}', to_jsonb(coalesce((v_sess.state ->> 'moveCount')::int, 0) + 1)
         )
   where id = p_session_id;
end;
$$;

grant execute on function public.ludo_pass(uuid) to authenticated, anon;
