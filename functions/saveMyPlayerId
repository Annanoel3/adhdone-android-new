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

        // Get current user record to check existing player IDs
        const currentUser = await base44.asServiceRole.entities.User.filter({ 
            email: user.email 
        });
        
        const existingPlayerIds = currentUser[0]?.onesignal_player_ids || [];
        
        // Add new player ID if not already present
        if (!existingPlayerIds.includes(playerId)) {
            existingPlayerIds.push(playerId);
            
            await base44.asServiceRole.entities.User.update(user.id, {
                onesignal_player_ids: existingPlayerIds
            });
            
            console.log(`Player ID added. User now has ${existingPlayerIds.length} device(s)`);
        } else {
            console.log('Player ID already exists for this user');
        }

        return Response.json({ 
            success: true,
            playerId: playerId,
            totalDevices: existingPlayerIds.length
        });
    } catch (error) {
        console.error('Error saving player ID:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});