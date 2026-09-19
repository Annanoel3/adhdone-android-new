import { secrets } from 'base44:runtime';

// App-owned Google OAuth for Calendar.
//
// WHY THIS EXISTS: the platform's app-user connector completed Google consent
// ("Success! Redirecting back to Base44…") but stored no connection — every
// sync then failed with 400 not_connected, verified across dozens of logged
// attempts. So the app now runs its own OAuth and keeps the refresh token on
// the user's own record. Nothing about Calendar depends on connector storage.
//
// The client id is public by design (it ships in the consent URL). The secret
// stays server-side in the google_oauth_client_secret app secret.
export const GOOGLE_CLIENT_ID =
  '852703632613-jqg2tsos79fkchc6ajt32shf8ihihug1.apps.googleusercontent.com';

// MUST be registered verbatim as an Authorized redirect URI in the Google
// Cloud OAuth client, and MUST stay on the app's own domain so the user lands
// back inside the installed Android app instead of on a Base44 host.
export const GOOGLE_REDIRECT_URI = 'https://adhdone.space/functions/googleCalendarCallback';

// Read-only calendar, plus email so the Calendar page can show WHICH Google
// account is linked.
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function buildConsentUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    // offline + consent: we need a refresh token every time, otherwise a
    // re-connect returns only a 1-hour access token and syncing silently dies
    // again an hour later.
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: secrets.get('google_oauth_client_secret'),
      ...body,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`google_token_${res.status}: ${data.error || ''} ${data.error_description || ''}`.trim());
  }
  return data;
}

export async function exchangeCodeForTokens(code) {
  return await postToken({
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
}

export async function fetchGoogleEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.email || null;
}

// Trades the stored refresh token for a fresh access token. Returns null when
// the user has never connected. Throws only on a real Google error, so a
// revoked grant surfaces instead of looking like "never connected".
export async function getGoogleAccessToken(user) {
  if (!user?.google_refresh_token) return null;
  const data = await postToken({
    refresh_token: user.google_refresh_token,
    grant_type: 'refresh_token',
  });
  return data.access_token || null;
}