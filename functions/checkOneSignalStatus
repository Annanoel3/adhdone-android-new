import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('Checking OneSignal status for:', user.email);

        // Check user record
        const userRecord = await base44.asServiceRole.entities.User.filter({ 
            email: user.email 
        });
        
        const currentUser = userRecord[0];
        const playerId = currentUser?.onesignal_player_id;

        return Response.json({
            user_email: user.email,
            player_id_in_database: playerId || 'Not set',
            player_id_exists: !!playerId,
            user_id: user.id
        });
    } catch (error) {
        console.error('Error checking status:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});