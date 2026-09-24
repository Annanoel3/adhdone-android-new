import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';

// WHO MAY BOOK A PUSH
// Like every Base44 function, this endpoint can be reached by anyone on the
// internet, and it used to book whatever it was handed: any text, to any user's
// email, no questions asked. Only two kinds of caller are legitimate:
//   1. another backend function of this app (the reminder job, calendar import,
//      Focus Mode, quick capture). It proves itself by passing the app's internal
//      key as `internalKey`. The key is the CRON_SECRET secret, so it is never in
//      the repo.
//   2. a signed-in user booking a reminder for THEMSELVES from the app.
// Everyone else is turned away.
//
// While ENFORCE_CALLER_CHECK is false this is WATCH ONLY: the check runs and
// logs what it would have done, and nothing is blocked. It is switched to true
// only once the logs show every real caller passing.
const ENFORCE_CALLER_CHECK = false;

Deno.serve(async (req) => {
    console.log('[schedulePush] ========== FUNCTION START ==========');
    
    try {
        const bodyText = await req.text();
        let payload;
        try {
            payload = JSON.parse(bodyText);
        } catch (parseError) {
            return Response.json({ success: false, error: 'Invalid JSON in request body', details: parseError.message }, { status: 400 });
        }

        const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim();
        const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY")?.trim();

        if (!appId || !restApiKey) {
            return Response.json({ success: false, error: 'Missing OneSignal environment variables.' }, { status: 500 });
        }

        const { toUserExternalId, title, body: messageBody, sendAtISO, minutesFromNow, data, android_channel_id, buttons } = payload;
        
        if (!toUserExternalId) {
            return Response.json({ success: false, error: 'toUserExternalId is required' }, { status: 400 });
        }

        if (!title || !messageBody) {
            return Response.json({ success: false, error: 'Missing title or message body' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Caller check (see the note at the top). Never log the key or an email.
        const internalKey = Deno.env.get('CRON_SECRET')?.trim();
        const presentedKey = typeof payload.internalKey === 'string' ? payload.internalKey.trim() : '';
        const isInternal = !!internalKey && presentedKey === internalKey;
        let callerEmail = null;
        if (!isInternal) {
            try {
                const me = await base44.auth.me();
                callerEmail = me?.email || null;
            } catch {
                callerEmail = null;
            }
        }
        const isSelf = !!callerEmail && String(callerEmail).toLowerCase() === String(toUserExternalId).toLowerCase();
        const callerKind = isInternal ? 'internal' : isSelf ? 'self' : callerEmail ? 'signed-in, but booking for someone else' : 'anonymous';
        console.log(`[schedulePush] caller check: ${callerKind}${ENFORCE_CALLER_CHECK ? '' : ' (watch only)'}`);
        if (ENFORCE_CALLER_CHECK && !isInternal && !isSelf) {
            return Response.json({ success: false, error: 'Not allowed to book this push' }, { status: 403 });
        }

        // Quiet hours enforcement is handled by callers using per-user, timezone-aware
        // logic (see cronRefillReminders, rescanTasks, and the client-side
        // reminderScheduler). A crude UTC blanket here would collapse multiple
        // night/early-morning notifications to the same timestamp — causing
        // duplicate notifications — so we do NOT apply quiet hours in schedulePush.

        let resolvedSendAt = sendAtISO
            ? sendAtISO
            : minutesFromNow !== undefined
                ? new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString()
                : null;

        // Safety guard: never allow instant delivery by accident
        if (!resolvedSendAt || new Date(resolvedSendAt).getTime() <= Date.now()) {
            return Response.json({ success: false, error: 'Refusing to schedule: send time missing or in the past' }, { status: 400 });
        }

        // Send ledger — every sender books through here, so this is where two
        // systems booking the same task minutes apart get caught.
        const ledgerKind = data?.type || 'task_reminder';
        const ledgerTaskId = data?.taskId || data?.scheduledTextId || null;
        const gate = await ledgerCheck(base44, { email: String(toUserExternalId), taskId: ledgerTaskId, kind: ledgerKind, sendAt: resolvedSendAt });
        if (!gate.allowed) {
            return Response.json({ success: true, skipped: true, reason: gate.reason, notificationId: null });
        }

        const notificationPayload = {
            app_id: appId,
            include_external_user_ids: [String(toUserExternalId)],
            headings: { en: title },
            contents: { en: messageBody },
            data: data || {},
            channel_for_external_user_ids: "push",
            // Scheduling
            send_after: resolvedSendAt,
            // NOTE: Action buttons (Snooze / Complete) were removed — native
            // notification action buttons in this Capacitor app only open the
            // app without performing the action, which is worse than no button.
        };
        
        if (android_channel_id) {
            notificationPayload.android_channel_id = android_channel_id;
        }
        // A push that asks to ring on arrival (data.alarm) must not be held by
        // Doze until the phone wakes — same as the nudge cron's ringing pushes.
        if (data && data.alarm === true) {
            notificationPayload.priority = 10;
            // OneSignal's app re-delivers recent pushes every time the app starts
            // fresh ("restore"), and the phone's filter rang a ring-now push again
            // when it did, so one push could ring on every app open for its whole
            // lifetime (3 days by default). A short lifetime means OneSignal never
            // restores it after 10 minutes; a ring-now moment is stale by then anyway.
            notificationPayload.ttl = 10 * 60;
        }

        console.log('[schedulePush] Sending payload:', JSON.stringify(notificationPayload, null, 2));

        const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${restApiKey}`
            },
            body: JSON.stringify(notificationPayload)
        });

        const responseText = await oneSignalResponse.text();
        let oneSignalResult;
        try {
            oneSignalResult = JSON.parse(responseText);
        } catch {
            return Response.json({ success: false, error: 'Invalid response from OneSignal API', response_text: responseText }, { status: 500 });
        }

        if (!oneSignalResponse.ok || oneSignalResult.errors) {
            console.error('[schedulePush] OneSignal error:', oneSignalResult);
            return Response.json({
                success: false,
                error: oneSignalResult.errors?.[0] || 'OneSignal API failed',
                onesignal_status: oneSignalResponse.status,
                onesignal_response: oneSignalResult
            }, { status: 200 });
        }

        console.log('[schedulePush] ========== SUCCESS ==========', oneSignalResult.id);
        await ledgerRecord(base44, { email: String(toUserExternalId), taskId: ledgerTaskId, kind: ledgerKind, source: 'schedulePush', sendAt: resolvedSendAt, notificationId: oneSignalResult.id, title });
        return Response.json({ success: true, notificationId: oneSignalResult.id, onesignal_response: oneSignalResult });

    } catch (error) {
        console.error('[schedulePush] Unhandled error:', error.message);
        return Response.json({ success: false, error: 'Internal server error', error_message: error.message }, { status: 500 });
    }
});