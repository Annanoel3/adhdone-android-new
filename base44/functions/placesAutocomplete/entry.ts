import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Address / business-name suggestions for the task Location field.
// Biases results toward the user's home zip when one is saved.
export default async function(req) {
  try {
    // Identity is used ONLY to bias results toward the user's home area, so a
    // failed lookup must not kill the suggestions (it was returning 403 and
    // silently blanking the dropdown).
    let user: any = null;
    try {
      user = await createClientFromRequest(req).auth.me();
    } catch (_e) {
      user = null;
    }

    const payload = await req.json().catch(() => ({}));
    const q = (payload?.input || '').trim();
    if (q.length < 2) return Response.json({ suggestions: [] });

    const apiKey = (secrets.get('GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY') || '').trim();
    if (!apiKey) {
      console.error('[PLACES] GOOGLE_MAPS_API_KEY missing');
      return Response.json({ suggestions: [], reason: 'no_key' });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', q);
    url.searchParams.set('key', apiKey);
    // Bias toward the home circle the user placed on the map, so typing
    // "city hall" surfaces THEIR city hall first.
    if (Number.isFinite(user?.home_lat) && Number.isFinite(user?.home_lng)) {
      url.searchParams.set('location', `${user.home_lat},${user.home_lng}`);
      url.searchParams.set('radius', '50000');
    }

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[PLACES] autocomplete error:', data.status, data.error_message);
      return Response.json({ suggestions: [], error: data.error_message || data.status });
    }

    const suggestions = (data.predictions || [])
      .map((p) => p.description)
      .filter(Boolean)
      .slice(0, 5);

    return Response.json({ suggestions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}