import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { buildConsentUrl } from '../../shared/googleOAuth.ts';

// Step 1 of app-owned Google Calendar OAuth: hand the app a consent URL.
//
// The one-time `state` is stored on the user's own record — that is how the
// callback (which Google hits with no app session) knows whose token it is
// holding. This replaces the platform connector's connectAppUser().
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    await base44.asServiceRole.entities.User.update(user.id, {
      google_oauth_state: state,
      google_oauth_state_at: new Date().toISOString(),
    });

    return Response.json({ url: buildConsentUrl(state) });
  } catch (error) {
    console.error('[googleCalendarConnect] failed:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}