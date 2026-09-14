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

export interface DriveTime {
  miles: number;
  minutes: number;
  // True when the minutes came back as duration_in_traffic — i.e. Google had
  // real traffic data for that departure time. False = free-flow estimate.
  inTraffic: boolean;
}

export interface ProximityResult {
  pairs: ProximityPair[];
  // Drive time from home to each location, when a home zip is known.
  fromHome: Record<string, DriveTime>;
}

const MAX_LOCATIONS = 8; // keeps the matrix small (and the bill at zero)

/**
 * A zip code isn't a point — Google measures it from its center, so someone
 * living at the far edge of a wide zip gets a drive time that's short by ten
 * minutes or more, and a "leave now" reminder that's already late.
 *
 * When home is only a zip, we geocode it, take the corners of the area Google
 * reports for it, and send all of them as origins. The caller then keeps the
 * LONGEST drive — i.e. we assume the user lives at the furthest part of their
 * zip. Being a few minutes early is survivable; being late isn't.
 *
 * A full street address (or anything that isn't a bare zip) is returned as-is.
 */
async function zipWorstCaseOrigins(home: string, apiKey: string): Promise<string[]> {
  if (!/^\d{5}(-\d{4})?$/.test(home)) return [home];
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('components', `postal_code:${home}`);
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    const data = await res.json();
    const geo = data?.results?.[0]?.geometry;
    const box = geo?.bounds || geo?.viewport;
    if (!box?.northeast || !box?.southwest) return [home];
    const { lat: nLat, lng: eLng } = box.northeast;
    const { lat: sLat, lng: wLng } = box.southwest;
    return [
      `${nLat},${eLng}`,
      `${nLat},${wLng}`,
      `${sLat},${eLng}`,
      `${sLat},${wLng}`,
    ];
  } catch (e) {
    console.error('[MAPS] zip bounds lookup failed:', e);
    return [home];
  }
}

/**
 * Look up driving distance between every pair of the given locations.
 * Returns empty results (never throws) when the key is missing, there are
 * fewer than two locations, or Google returns an error — the caller simply
 * falls back to not making proximity claims.
 */
export async function getProximity(
  locations: string[],
  homeZip: string = '',
  // When given, Google returns the drive time predicted for THAT moment's
  // traffic instead of a free-flow average. Ignored if it's in the past —
  // the API rejects past departure times.
  departureAt?: Date | null,
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
  // A bare zip becomes several origins (its corners) — see zipWorstCaseOrigins.
  const homeOrigins = homeZip ? await zipWorstCaseOrigins(homeZip, apiKey) : [];
  const origins = [...homeOrigins, ...places];
  const destinations = places;

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', origins.join('|'));
  url.searchParams.set('destinations', destinations.join('|'));
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('mode', 'driving');
  const depMs = departureAt ? departureAt.getTime() : 0;
  if (depMs > Date.now()) {
    url.searchParams.set('departure_time', String(Math.floor(depMs / 1000)));
    url.searchParams.set('traffic_model', 'best_guess');
  }
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
    const traffic = el.duration_in_traffic?.value;
    const minutes = Math.round((traffic ?? el.duration?.value ?? 0) / 60);
    return { miles, minutes, inTraffic: traffic != null };
  };

  const result: ProximityResult = { pairs: [], fromHome: {} };

  if (homeOrigins.length > 0) {
    destinations.forEach((dest, di) => {
      // Worst case across every home origin: for a zip that's the far edge, so
      // the "leave now" reminder can't be late for someone living at the corner.
      let worst: DriveTime | null = null;
      for (let hi = 0; hi < homeOrigins.length; hi++) {
        const v = read(data.rows[hi], di);
        if (v && (!worst || v.minutes > worst.minutes)) worst = v;
      }
      if (worst) result.fromHome[dest] = worst;
    });
  }

  // Pairwise: each place against every place after it.
  const offset = homeOrigins.length;
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