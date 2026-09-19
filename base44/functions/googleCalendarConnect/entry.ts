import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { buildConsentUrl } from '../../shared/googleOAuth.ts';
import { withChallengeRetry } from '../../shared/sdkRetry.ts';

// Step 1 of app-owned Google Calendar OAuth: hand the app a consent URL.
//
// The one-time `state` is stored on the user's own record — that is how the
// callback (which Google hits with no app session) knows whose token it is
// holding. This replaces the platform connector's connectAppUser().
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await withChallengeRetry(() => base44.auth.me());
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    // updateMe, not a service-role User.update: writing another record through
    // the service role is exactly the call that was coming back 403 and
    // surfacing to the app as a 500.
    await withChallengeRetry(() => base44.auth.updateMe({
      google_oauth_state: state,
      google_oauth_state_at: new Date().toISOString(),
    }));

    return Response.json({ url: buildConsentUrl(state) });
  } catch (error) {
    console.error('[googleCalendarConnect] failed:', error?.message,
      '| status=', error?.response?.status ?? error?.status,
      '| detail=', JSON.stringify(error?.response?.data ?? {}).slice(0, 400));
    return Response.json({ error: error.message }, { status: 500 });
  }
}