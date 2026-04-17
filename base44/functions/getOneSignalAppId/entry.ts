import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve((req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Allow unauthenticated access to get App ID
        // This is safe because the App ID is public information
        const appId = Deno.env.get("ONESIGNAL_APP_ID");

        if (!appId) {
            return Response.json({ 
                success: false,
                error: 'OneSignal App ID not configured' 
            }, { status: 500 });
        }

        return Response.json({ 
            success: true,
            appId: appId.trim()
        });

    } catch (error) {
        console.error('Error getting OneSignal App ID:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});