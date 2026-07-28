-- ============================================================
-- Recess — UNO Phase 3A: nextTurn Hint Protocol
--
-- Extends game_move so that _uno_apply_move (and any future
-- per-game apply function) can override the default alternating-
-- turn flip by including a top-level "nextTurn" key in its result.
--
-- When absent:  turn = case when v_win or v_draw then v_turn
--                           else 3 - v_turn end   (unchanged)
-- When present: turn = v_res->>'nextTurn'
--
-- Backward-compatible: games that never return "nextTurn" continue
-- to use the existing alternating logic unchanged.
--
-- Required by 0021_uno_skip_reverse.sql.
-- Run AFTER 0002_game_core.sql.
-- ============================================================

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
  v_uid      uuid := auth.uid();
  s          record;
  v_turn     int;
  v_apply_fn text;
  v_res      jsonb;
  v_result   text;
  v_win      boolean;
  v_draw     boolean;
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

  update public.game_session
  set state = jsonb_build_object(
                'players',   s.state->'players',
                'turn',      coalesce(
                               (v_res->>'nextTurn')::int,
                               case when v_win or v_draw then v_turn else 3 - v_turn end
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
