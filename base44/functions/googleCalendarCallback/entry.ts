import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { exchangeCodeForTokens, fetchGoogleEmail } from '../../shared/googleOAuth.ts';

// Step 2 of app-owned Google Calendar OAuth: Google redirects the browser here.
//
// There is no app session on this request — Google is the caller — so the user
// is identified by the single-use `state` written to their record in step 1.
// Service role is required for exactly that reason, and the state is cleared
// immediately so a captured URL can't be replayed.
const APP_ORIGIN = 'https://adhdone.space';
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

function backToApp(status) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_ORIGIN}/Calendar?gcal=${status}` },
  });
}

export default async function (req) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const denied = url.searchParams.get('error');

    if (denied) return backToApp('denied');
    if (!code || !state) return backToApp('bad_request');

    const base44 = createClientFromRequest(req);
    const matches = await base44.asServiceRole.entities.User.filter({ google_oauth_state: state });
    const user = matches?.[0];
    if (!user) {
      console.error('[googleCalendarCallback] no user for state');
      return backToApp('expired');
    }

    const startedAt = user.google_oauth_state_at ? new Date(user.google_oauth_state_at).getTime() : 0;
    if (!startedAt || Date.now() - startedAt > STATE_MAX_AGE_MS) {
      await base44.asServiceRole.entities.User.update(user.id, { google_oauth_state: '' });
      return backToApp('expired');
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Without a refresh token the link dies in an hour — treat as a failure
      // rather than reporting a success that quietly stops working.
      console.error('[googleCalendarCallback] no refresh_token returned');
      await base44.asServiceRole.entities.User.update(user.id, { google_oauth_state: '' });
      return backToApp('no_refresh_token');
    }

    const email = await fetchGoogleEmail(tokens.access_token);

    await base44.asServiceRole.entities.User.update(user.id, {
      google_refresh_token: tokens.refresh_token,
      google_account_email: email || '',
      google_connected_at: new Date().toISOString(),
      google_oauth_state: '',
      google_oauth_state_at: '',
    });

    console.log('[googleCalendarCallback] connected', user.email, '→', email);
    return backToApp('connected');
  } catch (error) {
    console.error('[googleCalendarCallback] failed:', error?.message);
    return backToApp('failed');
  }
}