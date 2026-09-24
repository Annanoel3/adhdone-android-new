import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';

// WHO MAY SEND. This sends a push RIGHT NOW with whatever text it is handed,
// and it used to do that for any signed-in user, to any email — anyone with an
// account could put any words on anyone's lock screen. Allowed now:
//   1. another backend function of this app, proving itself with the internal
//      key (`internalKey` = the CRON_SECRET secret), the same as schedulePush;
//   2. the app owner (admin);
//   3. a signed-in user sending to THEMSELVES (the "test notification" check,
//      testOneSignalConnection).
// Anything else is refused. That includes the Weekly Challenges "share with
// partners" button (src/components/home/WeeklyChallenges.jsx), which pushed to
// other people's emails — partner/challenge pushes are meant to be off
// (RULES.md §2), and this was the one path that still sent them.
Deno.serve(async (req) => {
    try {
        console.log('[sendOneSignalPush] ⏹️ Function started');
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const { userEmail, title, message, data } = body;

        const internalKey = Deno.env.get('CRON_SECRET')?.trim();
        const presentedKey = typeof body.internalKey === 'string' ? body.internalKey.trim() : '';
        const isInternal = !!internalKey && presentedKey === internalKey;
        let user = null;
        if (!isInternal) {
            try {
                user = await base44.auth.me();
            } catch {
                user = null;
            }
            if (!user) {
                console.error('[sendOneSignalPush] ❌ Unauthorized: No user found');
                return Response.json({ 
                    success: false, 
                    error: 'Unauthorized' 
                }, { status: 401 });
            }
            const isSelf = !!user.email && !!userEmail &&
                String(user.email).toLowerCase().trim() === String(userEmail).toLowerCase().trim();
            if (user.role !== 'admin' && !isSelf) {
                // Never log the key or the target email.
                console.warn('[sendOneSignalPush] ⛔ Refused: signed-in user sending to someone else');
                return Response.json({ success: false, error: 'Not allowed to send this push' }, { status: 403 });
            }
        }

        if (!userEmail || !title || !message) {
            return Response.json({ success: false, error: 'userEmail, title and message are required' }, { status: 400 });
        }
        console.log(`[sendOneSignalPush] ✅ Caller allowed (${isInternal ? 'internal' : user?.role === 'admin' ? 'admin' : 'self'})`);

        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const rest = Deno.env.get("ONESIGNAL_REST_API_KEY");

        if (!appId || !rest) {
            console.error('[sendOneSignalPush] ❌ Missing OneSignal credentials');
            return Response.json({ 
                success: false, 
                error: "Missing OneSignal credentials"
            }, { status: 500 });
        }

        console.log('[sendOneSignalPush] ✅ OneSignal credentials loaded');

        const ledgerKind = data?.type || 'general';
        const ledgerTaskId = data?.taskId || null;
        const gate = await ledgerCheck(base44, { email: userEmail, taskId: ledgerTaskId, kind: ledgerKind });
        if (!gate.allowed) {
            return Response.json({ success: false, skipped: true, reason: gate.reason });
        }

        // HARD RULE: target by external id (the user's email) only. Never player ids.
        const payload = {
            app_id: appId.trim(),
            include_external_user_ids: [userEmail],
            channel_for_external_user_ids: 'push',
            headings: { en: title },
            contents: { en: message },
            data: data || {}
        };

        const response = await fetch("https://onesignal.com/api/v1/notifications", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${rest.trim()}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || result.errors) {
            console.error('[sendOneSignalPush] ❌ OneSignal API error:', result);
            return Response.json({
                success: false,
                error: result.errors?.[0] || "Failed to send notification",
                details: result
            });
        }

        console.log('[sendOneSignalPush] ✅ Notification sent successfully! Recipients:', result.recipients || 0);
        await ledgerRecord(base44, { email: userEmail, taskId: ledgerTaskId, kind: ledgerKind, source: 'sendOneSignalPush', notificationId: result.id, title });
        return Response.json({ 
            success: true,
            recipients: result.recipients || 0,
            data: result
        });

    } catch (error) {
        console.error('[OneSignal] Send error:', error);
        return Response.json({ 
            success: false, 
            error: error.message
        }, { status: 500 });
    }
});