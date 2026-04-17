import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Manual function to link a device if auto-detection fails
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

        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

        if (!appId || !restKey) {
            return Response.json({ 
                success: false, 
                error: "Missing OneSignal credentials"
            }, { status: 500 });
        }

        // Try to find devices linked to this user's email via OneSignal API
        const response = await fetch(
            `https://onesignal.com/api/v1/players?app_id=${appId}&limit=100`,
            {
                headers: {
                    "Authorization": `Basic ${restKey}`
                }
            }
        );

        const data = await response.json();
        
        if (!response.ok) {
            return Response.json({
                success: false,
                error: "Failed to fetch devices from OneSignal",
                details: data
            }, { status: response.status });
        }

        // Find devices with this user's email as external_user_id
        const userDevices = data.players?.filter(p => 
            p.external_user_id === user.email && 
            p.test_type === null // exclude test devices
        ) || [];

        if (userDevices.length === 0) {
            return Response.json({
                success: false,
                message: "No devices found for this user in OneSignal",
                hint: "Make sure you've allowed notifications and the app has initialized OneSignal"
            });
        }

        // Get current saved player IDs
        const currentUser = await base44.asServiceRole.entities.User.filter({ 
            email: user.email 
        });
        
        const existingPlayerIds = currentUser[0]?.onesignal_player_ids || [];
        
        // Add any new player IDs we found
        const allPlayerIds = new Set([...existingPlayerIds]);
        userDevices.forEach(device => {
            if (device.id) {
                allPlayerIds.add(device.id);
            }
        });

        const finalPlayerIds = Array.from(allPlayerIds);

        // Update user record
        await base44.asServiceRole.entities.User.update(user.id, {
            onesignal_player_ids: finalPlayerIds
        });

        return Response.json({ 
            success: true,
            found_devices: userDevices.length,
            player_ids: finalPlayerIds,
            message: `Successfully linked ${userDevices.length} device(s)`
        });

    } catch (error) {
        console.error('Error linking device:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});