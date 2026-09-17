import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { ledgerCheck, ledgerRecord } from '../../shared/sendLedger.ts';

Deno.serve(async (req) => {
    try {
        console.log('[sendOneSignalPush] ⏹️ Function started');
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            console.error('[sendOneSignalPush] ❌ Unauthorized: No user found');
            return Response.json({ 
                success: false, 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        console.log('[sendOneSignalPush] ✅ User authenticated:', user.email);

        const body = await req.json();
        const { userEmail, title, message, data } = body;
        console.log('[sendOneSignalPush] 📦 Request payload received - target user:', userEmail);

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