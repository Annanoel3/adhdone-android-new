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
        
        if (!playerId) {
            return Response.json({ 
                success: false, 
                error: 'No player ID provided' 
            }, { status: 400 });
        }

        console.log(`Saving OneSignal player ID ${playerId} for user ${user.email}`);

        // Update user record with player ID
        await base44.asServiceRole.entities.User.update(user.id, {
            onesignal_player_id: playerId
        });

        console.log('Player ID saved successfully');

        return Response.json({ 
            success: true,
            playerId: playerId
        });
    } catch (error) {
        console.error('Error saving player ID:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});