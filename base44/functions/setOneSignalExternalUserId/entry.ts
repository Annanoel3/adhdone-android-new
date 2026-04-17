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

        const { playerId } = await req.json();
        
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

        if (!appId || !restApiKey) {
            return Response.json({ 
                success: false, 
                error: 'OneSignal credentials not configured' 
            }, { status: 500 });
        }

        console.log(`Setting external user ID for player ${playerId} to ${user.email}`);

        // Update player with external user ID
        const response = await fetch(`https://onesignal.com/api/v1/players/${playerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${restApiKey}`
            },
            body: JSON.stringify({
                app_id: appId,
                external_user_id: user.email,
                tags: {
                    user_email: user.email
                }
            })
        });

        const data = await response.json();
        console.log('OneSignal response:', data);

        if (!response.ok) {
            return Response.json({ 
                success: false, 
                error: 'Failed to set external user ID',
                details: data
            }, { status: response.status });
        }

        return Response.json({ 
            success: true,
            data
        });
    } catch (error) {
        console.error('Error setting external user ID:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});