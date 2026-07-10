import type { NextRequest } from "next/server";

// Cache dictionary lookups for the lifetime of this serverless instance
// to avoid hammering the free APIs on repeated submissions.
const cache = new Map<string, boolean>();

// English: Free Dictionary API (Wiktionary-backed, no key required)
// Indonesian: KBBI API (official Kamus Besar Bahasa Indonesia data, no key required)
function buildUrl(lang: "en" | "id", word: string): string {
  if (lang === "id") {
    return `https://kbbi.raf555.dev/api/v1/entry/${encodeURIComponent(word)}`;
  }
  return `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
}

export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get("word")?.trim().toLowerCase();
  const lang = request.nextUrl.searchParams.get("lang") === "id" ? "id" : "en";

  if (!word || word.length < 3 || !/^[a-z]+$/.test(word)) {
    return Response.json({ valid: false });
  }

  const cacheKey = `${lang}:${word}`;
  if (cache.has(cacheKey)) {
    return Response.json({ valid: cache.get(cacheKey) });
  }

  try {
    const res = await fetch(buildUrl(lang, word), { signal: AbortSignal.timeout(4000) });

    if (res.ok) {
      cache.set(cacheKey, true);
      return Response.json({ valid: true });
    }

    if (res.status === 404) {
      cache.set(cacheKey, false);
      return Response.json({ valid: false });
    }

    // Any other HTTP error (rate limit, 5xx…) — accept the word so a
    // third-party outage never blocks a player's turn.
    console.warn(`[word-snake] dictionary API returned ${res.status} for "${lang}:${word}" — accepting`);
    return Response.json({ valid: true, fallback: true });
  } catch (err) {
    // Network error or timeout — accept the word gracefully.
    console.warn(`[word-snake] dictionary API unreachable for "${lang}:${word}" — accepting`, err);
    return Response.json({ valid: true, fallback: true });
  }
}
