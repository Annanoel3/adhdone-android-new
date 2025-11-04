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

        // Check if user has player ID saved
        if (!user.onesignal_player_id) {
            return Response.json({
                success: false,
                error: 'No device registered yet. Please wait a few seconds and try again.',
                hint: 'The app needs to save your device ID first.'
            }, { status: 200 });
        }

        // Call sendOneSignalPush with current user's email
        const response = await base44.functions.invoke('sendOneSignalPush', {
            userEmail: user.email,
            title: "Test Notification 🎉",
            message: "Success! Your notifications are working perfectly.",
            data: { type: 'test' }
        });

        return Response.json(response.data);

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message
        }, { status: 200 });
    }
});