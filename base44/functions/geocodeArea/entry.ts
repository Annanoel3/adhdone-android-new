// Look up a city / zip / place name so the home-area map can jump to that
// region. Search ONLY — the query and the result are never stored anywhere.
//
// Why this is a backend function instead of a direct browser fetch: Nominatim's
// usage policy requires a real identifying User-Agent, and browsers forbid
// scripts from setting that header. Proxying here lets us send a proper one
// (and keeps Google entirely out of the map-browsing step).
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'ADHDone/1.0 (https://adhdone-73056b9b.base44.app; home area picker)';

// How far to zoom for each kind of result — a city shouldn't land as tight as a
// street address, and a whole state shouldn't land tighter than the state.
function zoomFor(place) {
  const cls = place.class;
  const type = place.type;
  if (cls === 'boundary' && type === 'administrative') {
    const level = Number(place.place_rank || 0);
    if (level <= 8) return 6;   // country
    if (level <= 12) return 8;  // state / region
    return 11;                  // city / town boundary
  }
  if (cls === 'place') {
    if (type === 'country') return 5;
    if (type === 'state' || type === 'region') return 7;
    if (type === 'city') return 11;
    if (type === 'town' || type === 'postcode') return 12;
    if (type === 'village' || type === 'hamlet' || type === 'suburb') return 13;
  }
  return 13; // a specific address or business
}

export default async function (req: Request): Promise<Response> {
  try {
    // No user lookup here on purpose: this is a read-only place-name proxy that
    // touches no app data, and the identity check was failing (403) for callers
    // and silently killing the search box.
    const { query } = await req.json();
    const q = (query || '').trim();
    if (q.length < 3) return Response.json({ results: [] });

    const url = new URL(NOMINATIM);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '0');

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.error('[geocodeArea] Nominatim returned', res.status);
      return Response.json({ results: [] });
    }

    const raw = await res.json();
    const results = (Array.isArray(raw) ? raw : []).map((p) => ({
      label: p.display_name,
      lat: Number(p.lat),
      lng: Number(p.lon),
      zoom: zoomFor(p),
    })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    return Response.json({ results });
  } catch (error) {
    console.error('[geocodeArea] failed:', error);
    return Response.json({ error: error.message, results: [] }, { status: 500 });
  }
}