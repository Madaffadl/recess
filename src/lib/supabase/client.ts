import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (singleton).
 *
 * Only the PUBLIC url + anon/publishable key are used here — safe to ship to
 * the browser (protected by RLS). Never import a service-role/secret key into
 * client code.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the public Supabase env vars are present. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * Returns the shared browser client. Throws if env vars are missing — callers
 * that must degrade gracefully should guard with {@link isSupabaseConfigured}.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (and in your Vercel " +
        "project's Environment Variables)."
    );
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
