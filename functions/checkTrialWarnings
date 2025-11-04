
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('Running trial warning check...');
        
        // Get all users using service role
        const allUsers = await base44.asServiceRole.entities.User.list();
        
        const today = new Date();
        const usersNeedingWarnings = [];

        for (const user of allUsers) {
            if (user.has_paid) continue;
            if (!user.trial_start_date) continue;

            const trialStart = new Date(user.trial_start_date);
            const daysDiff = Math.floor((today.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff === 2) {
                usersNeedingWarnings.push({
                    user,
                    daysRemaining: 1,
                    message: "Your ADHDone trial ends tomorrow! 🎯"
                });
            } else if (daysDiff === 3) {
                usersNeedingWarnings.push({
                    user,
                    daysRemaining: 0,
                    message: "Your ADHDone trial ends today! ⏰"
                });
            }
        }

        console.log(`Found ${usersNeedingWarnings.length} users needing trial warnings`);

        for (const { user, message } of usersNeedingWarnings) {
            try {
                const pushResponse = await base44.asServiceRole.functions.invoke('sendOneSignalPush', {
                    userEmail: user.email,
                    title: "Trial Ending Soon",
                    message: message,
                    data: { type: 'trial_warning' }
                });
                
                console.log(`✓ Sent trial warning to: ${user.email}`, pushResponse);
            } catch (userError) {
                console.error(`Error sending trial warning to ${user.email}:`, userError);
            }
        }

        return Response.json({
            success: true,
            warnings_sent: usersNeedingWarnings.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in checkTrialWarnings:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});
