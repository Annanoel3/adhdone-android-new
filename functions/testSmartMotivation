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

        console.log(`[testSmartMotivation] Testing for user: ${user.email}`);

        // Send test notification
        const notifyResponse = await base44.functions.invoke('notifySend', {
            toUserId: user.email,
            title: "🎯 Test Notification",
            body: "This is a test notification from ADHDone! If you see this, notifications are working perfectly.",
            screen: "/Home"
        });

        console.log('[testSmartMotivation] Notify response:', notifyResponse.data);

        return Response.json(notifyResponse.data);

    } catch (error) {
        console.error('[testSmartMotivation] Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});