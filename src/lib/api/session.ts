import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Anonymous session — the data seam for identity.
 *
 * For the lounge (Milestone A) the ephemeral realtime channels work with just
 * the anon key, so this is best-effort: it establishes a persistent anonymous
 * Supabase session (a stable `user.id` per browser) that later phases — rooms,
 * game state, moderation — will build on. It never throws; if anonymous
 * sign-ins are disabled, callers simply fall back to a client-side identity.
 */
export async function ensureAnonymousSession(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const supabase = getSupabaseClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn(
        "[recess] anonymous sign-in unavailable — enable it in Supabase → " +
          "Authentication → Sign In / Providers. Falling back to a local " +
          `identity. (${error.message})`
      );
      return null;
    }
    return data.user?.id ?? null;
  } catch (err) {
    console.warn("[recess] could not establish anonymous session:", err);
    return null;
  }
}
