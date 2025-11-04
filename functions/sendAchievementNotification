import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { user_email, achievement_title, achievement_description, points } = body;

        if (!user_email || !achievement_title) {
            return Response.json({
                success: false,
                error: 'Missing required fields: user_email, achievement_title'
            }, { status: 400 });
        }

        const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
        const user = users[0];
        
        if (user?.notification_settings?.achievements === false) {
            console.log(`[sendAchievementNotification] Skipping for ${user_email} - notifications disabled`);
            return Response.json({ success: true, skipped: true });
        }

        const result = await base44.asServiceRole.functions.invoke('notifySend', {
            toUserId: user_email,
            title: "🏆 Achievement Unlocked!",
            body: `${achievement_title} - +${points} points`,
            screen: "/Progress"
        });

        return Response.json(result.data);
    } catch (error) {
        console.error('[sendAchievementNotification] Error:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});