import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    console.log('[schedulePush] ========== FUNCTION START ==========');
    console.log('[schedulePush] Request method:', req.method);
    console.log('[schedulePush] Request headers:', Object.fromEntries(req.headers.entries()));
    
    try {
        // Step 1: Parse request body
        console.log('[schedulePush] Step 1: Parsing request body...');
        const bodyText = await req.text();
        console.log('[schedulePush] Raw body text (truncated if long):', bodyText.substring(0, 500));
        
        let payload;
        try {
            payload = JSON.parse(bodyText);
            console.log('[schedulePush] Parsed payload:', JSON.stringify(payload, null, 2));
        } catch (parseError) {
            console.error('[schedulePush] JSON parse error:', parseError.message);
            return Response.json({
                success: false,
                error: 'Invalid JSON in request body',
                details: parseError.message
            }, { status: 400 });
        }

        // Step 2: Retrieve OneSignal environment variables directly
        console.log('[schedulePush] Step 2: Retrieving OneSignal environment variables...');
        const appId = Deno.env.get("ONESIGNAL_APP_ID")?.trim();
        const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY")?.trim();

        console.log('[schedulePush] ONESIGNAL_APP_ID exists?', !!appId);
        console.log('[schedulePush] ONESIGNAL_REST_API_KEY exists?', !!restApiKey);

        if (!appId || !restApiKey) {
            console.error('[schedulePush] Missing OneSignal environment variables');
            return Response.json({
                success: false,
                error: 'Missing OneSignal environment variables. Please configure ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY.',
                has_app_id: !!appId,
                has_rest_key: !!restApiKey
            }, { status: 500 });
        }

        // Step 3: Validate payload
        console.log('[schedulePush] Step 3: Validating payload...');
        const { toUserExternalId, title, body: messageBody, sendAtISO, minutesFromNow, data, android_channel_id, sound } = payload;
        
        if (!toUserExternalId) {
            console.error('[schedulePush] Missing toUserExternalId');
            return Response.json({
                success: false,
                error: 'toUserExternalId is required'
            }, { status: 400 });
        }

        // CRITICAL: Validate title and body are not empty
        if (!title || !messageBody) {
            console.error('[schedulePush] Missing title or body — not sending');
            return Response.json({
                success: false,
                error: 'Missing title or message body'
            }, { status: 400 });
        }

        // Step 4: Construct OneSignal notification payload
        console.log('[schedulePush] Step 4: Constructing OneSignal notification payload...');
        const notificationPayload = {
            app_id: appId,
            include_external_user_ids: [String(toUserExternalId)],
            headings: { en: title },
            contents: { en: messageBody },
            data: data || {},
            send_after: sendAtISO, // OneSignal uses send_after for scheduling
            // If minutesFromNow is provided, calculate send_after
            ...((minutesFromNow !== undefined && !sendAtISO) && {
                send_after: new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString()
            }),
            // Use delayed_option for OneSignal's relative scheduling (less precise but often sufficient)
            // Or use send_after for precise scheduling
            // For now, let's stick to send_after for clarity for both absolute and relative times
            channel_for_external_user_ids: "push"
        };
        
        if (android_channel_id) {
            notificationPayload.android_channel_id = android_channel_id;
        }

        // Custom notification sound (filename without extension for Android, with extension for iOS)
        if (sound) {
            const ext = sound.endsWith('.mp3') || sound.endsWith('.wav') ? '' : '.mp3';
            const soundWithExt = sound.includes('.') ? sound : `${sound}${ext}`;
            notificationPayload.ios_sound = soundWithExt;         // iOS: filename with extension
            notificationPayload.android_sound = sound.replace(/\.(mp3|wav)$/, ''); // Android: no extension
            console.log('[schedulePush] Custom sound:', notificationPayload.android_sound);
        }

        console.log('[schedulePush] Final OneSignal payload:', JSON.stringify(notificationPayload, null, 2));

        // Step 5: Send notification to OneSignal API
        console.log('[schedulePush] Step 5: Sending notification to OneSignal API...');
        
        let oneSignalResponse;
        try {
            oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${restApiKey}` // OneSignal uses Basic auth with REST API Key
                },
                body: JSON.stringify(notificationPayload)
            });
            console.log('[schedulePush] OneSignal response status:', oneSignalResponse.status);
        } catch (fetchError) {
            console.error('[schedulePush] Fetch error sending to OneSignal:', fetchError.message);
            console.error('[schedulePush] Fetch error stack:', fetchError.stack);
            return Response.json({
                success: false,
                error: 'Failed to send notification to OneSignal API',
                details: fetchError.message
            }, { status: 500 });
        }

        // Step 6: Parse OneSignal response
        console.log('[schedulePush] Step 6: Parsing OneSignal response...');
        const responseText = await oneSignalResponse.text();
        console.log('[schedulePush] OneSignal response text:', responseText);

        let oneSignalResult;
        try {
            oneSignalResult = JSON.parse(responseText);
            console.log('[schedulePush] OneSignal result:', JSON.stringify(oneSignalResult, null, 2));
        } catch (parseError) {
            console.error('[schedulePush] Failed to parse OneSignal response:', parseError.message);
            return Response.json({
                success: false,
                error: 'Invalid response from OneSignal API',
                response_text: responseText
            }, { status: 500 });
        }

        // Step 7: Check OneSignal response
        console.log('[schedulePush] Step 7: Checking OneSignal response...');
        if (!oneSignalResponse.ok || oneSignalResult.errors) {
            console.error('[schedulePush] OneSignal API returned error:', oneSignalResult);
            return Response.json({
                success: false,
                error: oneSignalResult.errors?.[0] || 'OneSignal API failed',
                onesignal_status: oneSignalResponse.status,
                onesignal_response: oneSignalResult
            }, { status: 200 }); // Return 200 for internal error to flow through, actual status code for error is in `onesignal_status`
        }

        console.log('[schedulePush] ========== SUCCESS ==========');
        return Response.json({
            success: true,
            notificationId: oneSignalResult.id,
            onesignal_response: oneSignalResult
        });

    } catch (error) {
        console.error('[schedulePush] ========== UNHANDLED ERROR ==========');
        console.error('[schedulePush] Error type:', error.constructor.name);
        console.error('[schedulePush] Error message:', error.message);
        console.error('[schedulePush] Error stack:', error.stack);
        
        return Response.json({
            success: false,
            error: 'Internal server error',
            error_type: error.constructor.name,
            error_message: error.message,
            error_stack: error.stack
        }, { status: 500 });
    }
});