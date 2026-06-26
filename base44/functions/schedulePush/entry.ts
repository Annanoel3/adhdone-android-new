import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

        // --- Quiet hours enforcement ---
        // US timezones range from UTC-4 (EDT) to UTC-8 (PST).
        // To block 10 PM – 9 AM local for all US users, we use a UTC window of 03:00–14:00.
        //   3 AM UTC  = 10 PM CDT / 11 PM EDT / 8 PM PDT
        //  14 PM UTC  =  9 AM CDT / 10 AM EDT /  6 AM PDT
        const QUIET_START_HOUR = 3;  // 3 AM UTC
        const QUIET_END_HOUR   = 14; // 2 PM UTC

        function adjustForQuietHours(isoString) {
            const d = new Date(isoString);
            const h = d.getUTCHours();
            // Quiet window does NOT cross midnight UTC, so simple range check
            const isQuiet = h >= QUIET_START_HOUR && h < QUIET_END_HOUR;
            if (!isQuiet) return isoString;
            // Push to QUIET_END_HOUR UTC same day (it's always ahead of current time in the window)
            const adjusted = new Date(d);
            adjusted.setUTCHours(QUIET_END_HOUR, 0, 0, 0);
            if (adjusted <= d) adjusted.setUTCDate(adjusted.getUTCDate() + 1);
            return adjusted.toISOString();
        }

        let resolvedSendAt = sendAtISO
            ? sendAtISO
            : minutesFromNow !== undefined
                ? new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString()
                : null;

        if (resolvedSendAt) {
            resolvedSendAt = adjustForQuietHours(resolvedSendAt);
        }

        const notificationPayload = {
            app_id: appId,
            include_external_user_ids: [String(toUserExternalId)],
            headings: { en: title },
            contents: { en: messageBody },
            data: data || {},
            channel_for_external_user_ids: "push",
            // Scheduling
            ...(resolvedSendAt && { send_after: resolvedSendAt }),
            // Action buttons (Snooze / Complete)
            ...(buttons && buttons.length > 0 && { buttons: buttons }),
        };
        
        if (android_channel_id) {
            notificationPayload.android_channel_id = android_channel_id;
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
        return Response.json({ success: true, notificationId: oneSignalResult.id, onesignal_response: oneSignalResult });

    } catch (error) {
        console.error('[schedulePush] Unhandled error:', error.message);
        return Response.json({ success: false, error: 'Internal server error', error_message: error.message }, { status: 500 });
    }
});