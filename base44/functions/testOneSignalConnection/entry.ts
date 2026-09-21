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

        // Delegate to sendOneSignalPush, which delivers by stored player IDs if
        // present, or falls back to the OneSignal external user ID (email) that
        // the device was registered with. No need to gate on a local player ID.
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