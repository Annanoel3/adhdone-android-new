// Real driving distances between the locations the user explicitly attached to
// their tasks. Used by the smart-nudge system so a "combine these into one
// trip" suggestion is based on actual proximity instead of a guess.
//
// Uses the Google Distance Matrix API, which accepts free-form address strings
// ("Kroger on Main St, Austin TX", "78701"), so no separate geocoding step is
// needed. One request covers every pair.

export interface ProximityPair {
  from: string;
  to: string;
  miles: number;
  minutes: number;
}

export interface ProximityResult {
  pairs: ProximityPair[];
  // Drive time from home to each location, when a home zip is known.
  fromHome: Record<string, { miles: number; minutes: number }>;
}

const MAX_LOCATIONS = 8; // keeps the matrix small (and the bill at zero)

/**
 * Look up driving distance between every pair of the given locations.
 * Returns empty results (never throws) when the key is missing, there are
 * fewer than two locations, or Google returns an error — the caller simply
 * falls back to not making proximity claims.
 */
export async function getProximity(
  locations: string[],
  homeZip: string = ''
): Promise<ProximityResult> {
  const empty: ProximityResult = { pairs: [], fromHome: {} };

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim();
  if (!apiKey) return empty;

  // De-dupe (case-insensitively) and cap.
  const seen = new Set<string>();
  const places: string[] = [];
  for (const raw of locations) {
    const loc = (raw || '').trim();
    if (!loc) continue;
    const key = loc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(loc);
    if (places.length >= MAX_LOCATIONS) break;
  }
  if (places.length < 2 && !(places.length === 1 && homeZip)) return empty;

  // Home goes in as an origin only, so we learn how far each errand is from base.
  const origins = homeZip ? [homeZip, ...places] : places;
  const destinations = places;

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', origins.join('|'));
  url.searchParams.set('destinations', destinations.join('|'));
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('key', apiKey);

  let data: any;
  try {
    const res = await fetch(url.toString());
    data = await res.json();
  } catch (e) {
    console.error('[MAPS] Distance Matrix request failed:', e);
    return empty;
  }

  if (data?.status !== 'OK' || !Array.isArray(data.rows)) {
    console.error('[MAPS] Distance Matrix error:', data?.status, data?.error_message);
    return empty;
  }

  const read = (row: any, colIndex: number) => {
    const el = row?.elements?.[colIndex];
    if (!el || el.status !== 'OK') return null;
    const miles = Math.round((el.distance?.value ?? 0) / 1609.34 * 10) / 10;
    const minutes = Math.round((el.duration?.value ?? 0) / 60);
    return { miles, minutes };
  };

  const result: ProximityResult = { pairs: [], fromHome: {} };

  if (homeZip) {
    const homeRow = data.rows[0];
    destinations.forEach((dest, di) => {
      const v = read(homeRow, di);
      if (v) result.fromHome[dest] = v;
    });
  }

  // Pairwise: each place against every place after it.
  const offset = homeZip ? 1 : 0;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const v = read(data.rows[i + offset], j);
      if (v) result.pairs.push({ from: places[i], to: places[j], ...v });
    }
  }

  return result;
}

/**
 * Render proximity data as a short factual block for an LLM prompt.
 * Returns '' when there's nothing reliable to say.
 */
export function formatProximityNotes(p: ProximityResult): string {
  const lines: string[] = [];

  for (const pair of p.pairs) {
    const closeness = pair.minutes <= 10
      ? 'SAME TRIP — very close'
      : pair.minutes <= 20
        ? 'reasonable to combine'
        : 'NOT worth combining — too far apart';
    lines.push(`- "${pair.from}" ↔ "${pair.to}": ${pair.miles} mi, about ${pair.minutes} min drive (${closeness})`);
  }

  const homeEntries = Object.entries(p.fromHome);
  if (homeEntries.length > 0) {
    for (const [place, v] of homeEntries) {
      lines.push(`- home → "${place}": ${v.miles} mi, about ${v.minutes} min`);
    }
  }

  if (lines.length === 0) return '';
  return `REAL DRIVING DISTANCES (measured, not guessed — you may state these):\n${lines.join('\n')}`;
}