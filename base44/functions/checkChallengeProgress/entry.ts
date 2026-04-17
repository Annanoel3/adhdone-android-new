import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { challenge_type } = await req.json();

        // Get current week's challenges
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));
        const weekStart = monday.toISOString().split('T')[0];

        const challenges = await base44.entities.WeeklyChallenge.filter({
            week_start: weekStart,
            challenge_type: challenge_type,
            completed: false
        });

        if (challenges.length > 0) {
            const challenge = challenges[0];
            const newProgress = challenge.current_progress + 1;
            const isCompleted = newProgress >= challenge.target_count;

            await base44.entities.WeeklyChallenge.update(challenge.id, {
                current_progress: newProgress,
                completed: isCompleted,
                completion_date: isCompleted ? new Date().toISOString() : null
            });

            // Award points if completed
            if (isCompleted) {
                const bonusPoints = 100;
                await base44.entities.User.updateMyUserData({
                    total_points: (user.total_points || 0) + bonusPoints,
                    daily_points: (user.daily_points || 0) + bonusPoints
                });

                // Send notification
                await base44.asServiceRole.functions.invoke('sendOneSignalPush', {
                    userEmail: user.email,
                    title: "🎯 Challenge Complete!",
                    message: `${challenge.title} completed! +${bonusPoints} bonus points!`
                });
            }

            return Response.json({ 
                success: true, 
                progress: newProgress,
                completed: isCompleted
            });
        }

        return Response.json({ success: true, progress: 0 });
    } catch (error) {
        console.error('Challenge progress error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});