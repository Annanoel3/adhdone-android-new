import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ 
                success: false, 
                error: 'Unauthorized' 
            }, { status: 401 });
        }

        const body = await req.json();
        const { userEmail, title, message, data } = body;

        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const rest = Deno.env.get("ONESIGNAL_REST_API_KEY");

        if (!appId || !rest) {
            return Response.json({ 
                success: false, 
                error: "Missing OneSignal credentials"
            }, { status: 500 });
        }

        // Get target user's player IDs
        const targetUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        const targetUser = targetUsers[0];
        
        if (!targetUser || !targetUser.onesignal_player_ids || targetUser.onesignal_player_ids.length === 0) {
            console.log('No player IDs found for user:', userEmail);
            return Response.json({
                success: false,
                error: 'User has no registered devices'
            });
        }

        // Send to specific player IDs
        const payload = {
            app_id: appId.trim(),
            include_player_ids: targetUser.onesignal_player_ids,
            headings: { en: title },
            contents: { en: message },
            data: data || {}
        };

        console.log('Sending push to:', targetUser.onesignal_player_ids);

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
            return Response.json({
                success: false,
                error: result.errors?.[0] || "Failed to send notification",
                details: result
            });
        }

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