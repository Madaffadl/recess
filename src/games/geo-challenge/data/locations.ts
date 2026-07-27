import type { GeoRound } from "../use-geo-challenge";

// ─── Street-view locations ─────────────────────────────────────────────────────
//
// Geo Challenge shows interactive Mapillary street-level imagery (like Google
// Street View, but free & open). Mapillary coverage is crowdsourced, so it is
// dense in major cities and sparse elsewhere. We therefore curate SEARCH CENTERS
// in high-traffic city spots (best coverage) rather than hard-coding raw image
// IDs, then resolve the nearest real image at game start (guaranteeing the id is
// valid and the exact viewpoint's coordinates become the round's answer).

export type GeoLocation = {
  id: string;
  /** Friendly label shown only on reveal (never before a guess). */
  name: string;
  country: string;
  continent: string;
  /** Search center — the answer is the resolved image's own coordinates. */
  lat: number;
  lng: number;
  difficulty: "easy" | "medium" | "hard";
};

export const LOCATIONS: GeoLocation[] = [
  // ── Europe ──────────────────────────────────────────────────────────────
  { id: "paris-champs", name: "Champs-Élysées, Paris", country: "France", continent: "Europe", lat: 48.8698, lng: 2.3078, difficulty: "easy" },
  { id: "london-trafalgar", name: "Trafalgar Square, London", country: "United Kingdom", continent: "Europe", lat: 51.5080, lng: -0.1281, difficulty: "easy" },
  { id: "amsterdam-dam", name: "Dam Square, Amsterdam", country: "Netherlands", continent: "Europe", lat: 52.3731, lng: 4.8926, difficulty: "medium" },
  { id: "berlin-brandenburg", name: "Brandenburg Gate, Berlin", country: "Germany", continent: "Europe", lat: 52.5163, lng: 13.3777, difficulty: "medium" },
  { id: "barcelona-gracia", name: "Passeig de Gràcia, Barcelona", country: "Spain", continent: "Europe", lat: 41.3915, lng: 2.1650, difficulty: "medium" },
  { id: "rome-venezia", name: "Piazza Venezia, Rome", country: "Italy", continent: "Europe", lat: 41.8959, lng: 12.4823, difficulty: "medium" },
  { id: "prague-oldtown", name: "Old Town Square, Prague", country: "Czechia", continent: "Europe", lat: 50.0875, lng: 14.4213, difficulty: "medium" },
  { id: "vienna-stephans", name: "Stephansplatz, Vienna", country: "Austria", continent: "Europe", lat: 48.2082, lng: 16.3738, difficulty: "hard" },
  { id: "stockholm-gamlastan", name: "Gamla Stan, Stockholm", country: "Sweden", continent: "Europe", lat: 59.3251, lng: 18.0711, difficulty: "hard" },
  { id: "lisbon-comercio", name: "Praça do Comércio, Lisbon", country: "Portugal", continent: "Europe", lat: 38.7075, lng: -9.1364, difficulty: "medium" },
  { id: "athens-syntagma", name: "Syntagma, Athens", country: "Greece", continent: "Europe", lat: 37.9755, lng: 23.7348, difficulty: "medium" },
  { id: "copenhagen-nyhavn", name: "Nyhavn, Copenhagen", country: "Denmark", continent: "Europe", lat: 55.6796, lng: 12.5914, difficulty: "hard" },
  { id: "dublin-oconnell", name: "O'Connell Street, Dublin", country: "Ireland", continent: "Europe", lat: 53.3498, lng: -6.2603, difficulty: "hard" },
  { id: "zurich-bahnhof", name: "Bahnhofstrasse, Zürich", country: "Switzerland", continent: "Europe", lat: 47.3717, lng: 8.5387, difficulty: "hard" },
  { id: "budapest-center", name: "Downtown, Budapest", country: "Hungary", continent: "Europe", lat: 47.4979, lng: 19.0402, difficulty: "hard" },

  // ── North America ─────────────────────────────────────────────────────────
  { id: "nyc-times", name: "Times Square, New York", country: "United States", continent: "North America", lat: 40.7580, lng: -73.9855, difficulty: "easy" },
  { id: "sf-market", name: "Market Street, San Francisco", country: "United States", continent: "North America", lat: 37.7897, lng: -122.4000, difficulty: "medium" },
  { id: "la-hollywood", name: "Hollywood Blvd, Los Angeles", country: "United States", continent: "North America", lat: 34.1017, lng: -118.3400, difficulty: "medium" },
  { id: "chicago-loop", name: "The Loop, Chicago", country: "United States", continent: "North America", lat: 41.8827, lng: -87.6233, difficulty: "hard" },
  { id: "toronto-downtown", name: "Downtown, Toronto", country: "Canada", continent: "North America", lat: 43.6535, lng: -79.3839, difficulty: "medium" },
  { id: "vancouver-downtown", name: "Downtown, Vancouver", country: "Canada", continent: "North America", lat: 49.2820, lng: -123.1187, difficulty: "hard" },
  { id: "mexico-zocalo", name: "Zócalo, Mexico City", country: "Mexico", continent: "North America", lat: 19.4326, lng: -99.1332, difficulty: "medium" },
  { id: "washington-mall", name: "National Mall, Washington DC", country: "United States", continent: "North America", lat: 38.8895, lng: -77.0353, difficulty: "medium" },

  // ── Asia ────────────────────────────────────────────────────────────────
  { id: "tokyo-shibuya", name: "Shibuya, Tokyo", country: "Japan", continent: "Asia", lat: 35.6595, lng: 139.7005, difficulty: "easy" },
  { id: "osaka-dotonbori", name: "Dōtonbori, Osaka", country: "Japan", continent: "Asia", lat: 34.6687, lng: 135.5030, difficulty: "medium" },
  { id: "seoul-gangnam", name: "Gangnam, Seoul", country: "South Korea", continent: "Asia", lat: 37.4979, lng: 127.0276, difficulty: "medium" },
  { id: "singapore-marina", name: "Marina Bay, Singapore", country: "Singapore", continent: "Asia", lat: 1.2830, lng: 103.8590, difficulty: "medium" },
  { id: "bangkok-center", name: "Downtown, Bangkok", country: "Thailand", continent: "Asia", lat: 13.7460, lng: 100.5340, difficulty: "medium" },
  { id: "hongkong-central", name: "Central, Hong Kong", country: "Hong Kong", continent: "Asia", lat: 22.2810, lng: 114.1580, difficulty: "medium" },
  { id: "taipei-center", name: "Xinyi, Taipei", country: "Taiwan", continent: "Asia", lat: 25.0330, lng: 121.5654, difficulty: "hard" },
  { id: "jakarta-monas", name: "Monas, Jakarta", country: "Indonesia", continent: "Asia", lat: -6.1751, lng: 106.8272, difficulty: "hard" },
  { id: "kualalumpur-klcc", name: "KLCC, Kuala Lumpur", country: "Malaysia", continent: "Asia", lat: 3.1570, lng: 101.7120, difficulty: "hard" },
  { id: "istanbul-sultanahmet", name: "Sultanahmet, Istanbul", country: "Turkey", continent: "Asia", lat: 41.0058, lng: 28.9770, difficulty: "medium" },
  { id: "telaviv-center", name: "Downtown, Tel Aviv", country: "Israel", continent: "Asia", lat: 32.0700, lng: 34.7800, difficulty: "hard" },

  // ── South America ─────────────────────────────────────────────────────────
  { id: "saopaulo-paulista", name: "Av. Paulista, São Paulo", country: "Brazil", continent: "South America", lat: -23.5613, lng: -46.6560, difficulty: "medium" },
  { id: "rio-copacabana", name: "Copacabana, Rio de Janeiro", country: "Brazil", continent: "South America", lat: -22.9711, lng: -43.1822, difficulty: "medium" },
  { id: "buenosaires-obelisco", name: "Obelisco, Buenos Aires", country: "Argentina", continent: "South America", lat: -34.6037, lng: -58.3816, difficulty: "medium" },
  { id: "santiago-center", name: "Downtown, Santiago", country: "Chile", continent: "South America", lat: -33.4372, lng: -70.6506, difficulty: "hard" },
  { id: "bogota-center", name: "La Candelaria, Bogotá", country: "Colombia", continent: "South America", lat: 4.5981, lng: -74.0758, difficulty: "hard" },
  { id: "lima-center", name: "Miraflores, Lima", country: "Peru", continent: "South America", lat: -12.1211, lng: -77.0300, difficulty: "hard" },

  // ── Africa ────────────────────────────────────────────────────────────────
  { id: "capetown-center", name: "City Bowl, Cape Town", country: "South Africa", continent: "Africa", lat: -33.9249, lng: 18.4241, difficulty: "medium" },
  { id: "nairobi-center", name: "Downtown, Nairobi", country: "Kenya", continent: "Africa", lat: -1.2864, lng: 36.8172, difficulty: "hard" },
  { id: "marrakesh-medina", name: "Medina, Marrakesh", country: "Morocco", continent: "Africa", lat: 31.6258, lng: -7.9891, difficulty: "hard" },
  { id: "cairo-tahrir", name: "Tahrir Square, Cairo", country: "Egypt", continent: "Africa", lat: 30.0444, lng: 31.2357, difficulty: "medium" },

  // ── Oceania ─────────────────────────────────────────────────────────────
  { id: "sydney-cbd", name: "CBD, Sydney", country: "Australia", continent: "Oceania", lat: -33.8688, lng: 151.2093, difficulty: "easy" },
  { id: "melbourne-cbd", name: "CBD, Melbourne", country: "Australia", continent: "Oceania", lat: -37.8136, lng: 144.9631, difficulty: "medium" },
  { id: "auckland-cbd", name: "CBD, Auckland", country: "New Zealand", continent: "Oceania", lat: -36.8485, lng: 174.7633, difficulty: "hard" },
];

const MAPILLARY_TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN ?? "";

export const isMapillaryConfigured = MAPILLARY_TOKEN.length > 0;

type MapillaryImage = {
  id: string;
  is_pano?: boolean;
  computed_geometry?: { type: string; coordinates: [number, number] }; // [lng, lat]
  geometry?: { type: string; coordinates: [number, number] };
};

export type ResolvedLocation = {
  mapillaryId: string;
  lat: number;
  lng: number;
  name: string;
  country: string;
};

/** Sentinel returned when the bbox is so dense Mapillary rejects it (HTTP 5xx). */
const TOO_MUCH = Symbol("too-much");

/** One bbox query. Returns images, TOO_MUCH (dense → shrink), or null (error). */
async function fetchBbox(
  loc: GeoLocation,
  d: number
): Promise<MapillaryImage[] | typeof TOO_MUCH | null> {
  const bbox = [loc.lng - d, loc.lat - d, loc.lng + d, loc.lat + d].join(",");
  const url =
    `https://graph.mapillary.com/images` +
    `?access_token=${encodeURIComponent(MAPILLARY_TOKEN)}` +
    `&fields=id,is_pano,computed_geometry,geometry` +
    `&bbox=${bbox}&limit=20`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    // Mapillary caps how much a bbox may scan; over-dense areas 500 with
    // "reduce the amount of data". Treat 5xx as "shrink the box".
    if (resp.status >= 500) return TOO_MUCH;
    if (!resp.ok) return null;
    const json = (await resp.json()) as { data?: MapillaryImage[] };
    return json.data ?? [];
  } catch {
    return null;
  }
}

/**
 * Find the best Mapillary street-view image near a curated location.
 *
 * Coverage density varies wildly: hyper-dense spots (Shibuya, Times Square)
 * reject anything but a ~90 m box, while sparse ones need a ~700 m box to find
 * anything. So we start small and expand while empty, and shrink if the box is
 * too dense. Then we prefer 360° panoramas closest to the center. Returns null
 * if there is no coverage (or the token is missing) so the caller can fall back.
 */
export async function resolveMapillaryImage(
  loc: GeoLocation
): Promise<ResolvedLocation | null> {
  if (!isMapillaryConfigured) return null;

  let images: MapillaryImage[] = [];
  // ~0.0008° ≈ 90 m … 0.0064° ≈ 700 m half-width.
  for (const d of [0.0008, 0.0016, 0.0032, 0.0064]) {
    const res = await fetchBbox(loc, d);
    if (res === TOO_MUCH) {
      // Too dense even at this size — a smaller box is the fix, not a larger one.
      const smaller = await fetchBbox(loc, 0.0004);
      if (Array.isArray(smaller) && smaller.length) {
        images = smaller;
        break;
      }
      continue;
    }
    if (Array.isArray(res) && res.length) {
      images = res;
      break;
    }
    // empty or transient error → widen the search
  }
  if (images.length === 0) return null;

  try {
    const scored = images
      .map((img) => {
        const geo = img.computed_geometry ?? img.geometry;
        if (!geo?.coordinates) return null;
        const [lng, lat] = geo.coordinates;
        // squared planar distance is fine for ranking within a tiny bbox
        const dist = (lat - loc.lat) ** 2 + (lng - loc.lng) ** 2;
        return { img, lat, lng, dist };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        // prefer panoramas (more GeoGuessr-like), then closest to center
        const pa = a.img.is_pano ? 1 : 0;
        const pb = b.img.is_pano ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return a.dist - b.dist;
      });

    const best = scored[0];
    if (!best) return null;

    return {
      mapillaryId: best.img.id,
      lat: best.lat,
      lng: best.lng,
      name: loc.name,
      country: loc.country,
    };
  } catch {
    return null;
  }
}

/** Fisher–Yates shuffle (unbiased, unlike sort(() => Math.random() - 0.5)). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type GeoRegion = "World" | "Europe" | "Asia" | "Americas";

/** Which continents each selectable region covers. */
const REGION_CONTINENTS: Record<GeoRegion, string[] | null> = {
  World: null, // all
  Europe: ["Europe"],
  Asia: ["Asia"],
  Americas: ["North America", "South America"],
};

/**
 * Build `n` game rounds by resolving real Mapillary imagery, optionally limited
 * to a region.
 *
 * Resolves SEQUENTIALLY and stops as soon as `n` rounds are ready. An earlier
 * version resolved all candidates in parallel, but firing ~15 lookups (each up
 * to ~5 adaptive bbox calls) at once throttled the free token — requests then
 * hung until timeout and Promise.all waited on the slowest, so a game could take
 * 30-50s to start (looking frozen behind the "Preparing rounds…" spinner).
 * One-at-a-time avoids the burst; dense curated cities resolve on the first call,
 * so a normal start is a handful of quick requests.
 */
export async function buildGeoRounds(
  n: number,
  region: GeoRegion = "World"
): Promise<GeoRound[]> {
  const continents = REGION_CONTINENTS[region];
  const pool = continents
    ? LOCATIONS.filter((l) => continents.includes(l.continent))
    : LOCATIONS;

  const rounds: GeoRound[] = [];
  for (const loc of shuffle(pool)) {
    if (rounds.length >= n) break;
    const r = await resolveMapillaryImage(loc);
    if (!r) continue;
    rounds.push({
      imageId: loc.id,
      mapillaryId: r.mapillaryId,
      name: r.name,
      country: r.country,
      lat: r.lat,
      lng: r.lng,
    });
  }
  return rounds;
}
