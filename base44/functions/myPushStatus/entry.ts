import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { platformRequest } from '../../shared/sdkRetry.ts';

// CAN A PUSH REACH THE SIGNED-IN USER?
// A phone with notifications switched off looks exactly like a working one from
// inside the app: reminders get booked (or quietly refused) and nothing ever
// says so. This asks OneSignal directly about the caller, by their email (the
// same external ID every sender targets), and reports which kinds of push
// subscription they have and which of those are switched on.
//
// It takes no input and only ever looks up the person who is signed in.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(platformRequest(req));
        let me = null;
        try {
            me = await base44.auth.me();
        } catch {
            me = null;
        }
        if (!me?.email) {
            return Response.json({ success: false, error: 'Not signed in' }, { status: 401 });
        }

        const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
        const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
        if (!appId || !restApiKey) {
            return Response.json({ success: false, error: 'Missing OneSignal environment variables.' }, { status: 500 });
        }

        const res = await fetch(
            `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(me.email)}`,
            { headers: { Authorization: `Basic ${restApiKey}` } }
        );

        // OneSignal has never heard of this person, so nothing can be said about
        // their phone either way.
        if (res.status === 404) {
            return Response.json({ success: true, known: false, pushTypes: [], enabledPushTypes: [] });
        }
        if (!res.ok) {
            console.error('[myPushStatus] OneSignal answered', res.status);
            return Response.json({ success: false, error: 'OneSignal lookup failed', onesignal_status: res.status });
        }

        const body = await res.json();
        const subscriptions = Array.isArray(body?.subscriptions) ? body.subscriptions : [];
        const push = subscriptions.filter((s) => typeof s?.type === 'string' && s.type.endsWith('Push'));
        const pushTypes = [...new Set(push.map((s) => s.type))];
        const enabledPushTypes = [...new Set(push.filter((s) => s.enabled === true).map((s) => s.type))];
        return Response.json({ success: true, known: true, pushTypes, enabledPushTypes });
    } catch (error) {
        console.error('[myPushStatus] Unhandled error:', error.message);
        return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
});
