import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

// Clears the app-owned Google link and revokes the grant at Google, so
// reconnecting always shows the account chooser and a fresh refresh token.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (user.google_refresh_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: user.google_refresh_token }).toString(),
        });
      } catch (e) {
        console.log('[googleCalendarDisconnect] revoke failed (continuing):', e.message);
      }
    }

    await base44.asServiceRole.entities.User.update(user.id, {
      google_refresh_token: '',
      google_account_email: '',
      google_connected_at: '',
      google_oauth_state: '',
      google_oauth_state_at: '',
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[googleCalendarDisconnect] failed:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}