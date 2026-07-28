-- ─────────────────────────────────────────────────────────────
-- 0032_fix_uno_coalesce.sql
--
-- Fixes COALESCE type mismatch in 0031: ->> returns text but
-- the fallback was '[]'::jsonb.  Replaced with -> (returns jsonb)
-- in _uno_next_active_turn and game_move.
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

  v_rankings := coalesce(s.state->'rankings', '[]'::jsonb);

  if v_win then
    v_rankings := v_rankings || to_jsonb(v_turn);

    select count(*)::int into v_active_count
    from jsonb_each(v_res->'game'->'hands') h
    where jsonb_array_length(h.value) > 0;

    if v_active_count <= 1 then
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

grant execute on function public.game_move(uuid, jsonb) to authenticated, anon;
