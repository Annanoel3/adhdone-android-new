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

        // Check user's saved player IDs
        const currentUser = await base44.asServiceRole.entities.User.filter({ 
            email: user.email 
        });

        const playerIds = currentUser[0]?.onesignal_player_ids || [];

        // Check if OneSignal is initialized on the client
        const diagnostics = {
            user_email: user.email,
            saved_player_ids: playerIds,
            player_id_count: playerIds.length,
            has_app_id: !!Deno.env.get("ONESIGNAL_APP_ID"),
            has_rest_key: !!Deno.env.get("ONESIGNAL_REST_API_KEY"),
            app_id: Deno.env.get("ONESIGNAL_APP_ID") ? 
                Deno.env.get("ONESIGNAL_APP_ID").substring(0, 8) + "..." : "NOT SET"
        };

        return Response.json({ 
            success: true,
            diagnostics
        });

    } catch (error) {
        console.error('Error checking OneSignal status:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});