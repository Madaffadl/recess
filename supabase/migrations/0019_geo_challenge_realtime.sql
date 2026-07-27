-- Enable realtime for geo_challenge_session.
--
-- Migration 0017 created the table and RPCs but never added it to the
-- supabase_realtime publication. Without that, postgres_changes never
-- broadcasts INSERT/UPDATE events, so a client only sees fresh state on
-- its initial SELECT (i.e. after a manual refresh). This caused:
--   • a second player joining not appearing in the first player's lobby
--   • the board freezing when the phase advanced (guessing → revealing),
--     because the phase-change UPDATE never reached the other client.
--
-- Same pattern as game_session and draw_together_session. Guarded so a
-- re-run doesn't fail if the table is already a publication member
-- (ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS).
do $$
begin
  alter publication supabase_realtime add table public.geo_challenge_session;
exception
  when duplicate_object then null;
end $$;
