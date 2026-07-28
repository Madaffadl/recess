-- ============================================================
-- Verification for 0017_game_ready.sql
--
-- Simulates two players by setting the JWT `sub` claim before each
-- RPC call (auth.uid() reads request.jwt.claims). Runs entirely in
-- one transaction (the DO block), asserts every expected behaviour,
-- prints PASS lines via RAISE NOTICE, and deletes its own test row.
--
-- If it finishes without an ERROR, every check passed. Any failed
-- assertion aborts with a clear message.
--
-- Set v_game to any REGISTERED game id (its _<game>_initial_state()
-- must exist). Defaults to 'uno'; 'connect-four' also works.
-- ============================================================
do $$
declare
  v_p1     uuid := '11111111-1111-1111-1111-111111111111';
  v_p2     uuid := '22222222-2222-2222-2222-222222222222';
  v_room   text := 'verify-room-0017';
  v_game   text := 'uno';
  v_sid    uuid;
  v_state  jsonb;
  v_status text;
begin
  -- Clean any leftover from a previous run.
  delete from public.game_session where room_key = v_room;

  -- ── 1. P1 joins → waiting, game null, ready all false ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_p1::text)::text, true);
  v_sid := public.game_join(v_room, v_game, 'Alice');
  select state, status into v_state, v_status from public.game_session where id = v_sid;
  assert v_status = 'waiting',                                'P1 join: status must be waiting, got ' || v_status;
  assert v_state->'game' = 'null'::jsonb,                     'P1 join: game must be null';
  assert v_state->'ready' = '{"1": false, "2": false}'::jsonb,'P1 join: ready must be {1:false,2:false}';
  assert v_state->'players'->'2' = 'null'::jsonb,             'P1 join: seat 2 must be empty';
  raise notice 'PASS 1  P1 join -> waiting, game=null, ready all false';

  -- ── 2. P2 joins → still waiting, game still null ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2::text)::text, true);
  perform public.game_join(v_room, v_game, 'Bob');
  select state, status into v_state, v_status from public.game_session where id = v_sid;
  assert v_status = 'waiting',                          'P2 join: status must stay waiting, got ' || v_status;
  assert v_state->'players'->'2'->>'id' = v_p2::text,   'P2 join: seat 2 must be P2';
  assert v_state->'game' = 'null'::jsonb,               'P2 join: game must still be null';
  raise notice 'PASS 2  P2 join -> still waiting, game=null';

  -- ── 3. P1 game_ready(true) → only ready[1] flips, still waiting ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_p1::text)::text, true);
  perform public.game_ready(v_sid, true);
  select state, status into v_state, v_status from public.game_session where id = v_sid;
  assert (v_state->'ready'->>'1')::boolean = true,  'P1 ready: ready[1] must be true';
  assert (v_state->'ready'->>'2')::boolean = false, 'P1 ready: ready[2] must stay false';
  assert v_status = 'waiting',                       'P1 ready: status must stay waiting';
  assert v_state->'game' = 'null'::jsonb,            'P1 ready: game must still be null';
  raise notice 'PASS 3  P1 ready(true) -> ready[1]=true only, still waiting';

  -- ── 4. P1 game_ready(false) → cancels while waiting ──
  perform public.game_ready(v_sid, false);
  select state, status into v_state, v_status from public.game_session where id = v_sid;
  assert (v_state->'ready'->>'1')::boolean = false, 'P1 cancel: ready[1] must be false';
  assert v_status = 'waiting',                       'P1 cancel: status must stay waiting';
  raise notice 'PASS 4  P1 ready(false) -> ready[1]=false (cancel works)';

  -- Re-ready P1 for the start test.
  perform public.game_ready(v_sid, true);

  -- ── 5. P2 game_ready(true) → both ready → active + game initialised ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2::text)::text, true);
  perform public.game_ready(v_sid, true);
  select state, status into v_state, v_status from public.game_session where id = v_sid;
  assert v_status = 'active',                                  'both ready: status must be active, got ' || v_status;
  assert jsonb_typeof(v_state->'game') = 'object',            'both ready: game must be an initialised object';
  assert (v_state->>'turn')::int = (v_state->>'startTurn')::int, 'both ready: turn must equal startTurn';
  raise notice 'PASS 5  both ready -> active, game initialised, turn=startTurn';

  -- ── 6. game_rematch → back to waiting, game null, ready reset ──
  update public.game_session
    set status = 'finished',
        state  = jsonb_set(state, '{winner}', '1'::jsonb)
  where id = v_sid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_p1::text)::text, true);
  perform public.game_rematch(v_sid);
  select state, status into v_state, v_status from public.game_session where id = v_sid;
  assert v_status = 'waiting',                                 'rematch: status must be waiting, got ' || v_status;
  assert v_state->'game' = 'null'::jsonb,                      'rematch: game must be null';
  assert v_state->'ready' = '{"1": false, "2": false}'::jsonb, 'rematch: ready must be reset';
  assert v_state->'winner' = 'null'::jsonb,                    'rematch: winner must be reset';
  raise notice 'PASS 6  rematch -> waiting, game=null, ready reset, winner null';

  -- Cleanup so the verification leaves no trace.
  delete from public.game_session where room_key = v_room;
  raise notice '=====================================';
  raise notice 'ALL 6 CHECKS PASSED — test row cleaned';
  raise notice '=====================================';
end $$;
