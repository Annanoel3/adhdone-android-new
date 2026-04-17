import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('Running task reminder check...');
        
        const allTasks = await base44.asServiceRole.entities.Task.filter({ status: 'active' });
        
        const now = new Date();
        const tasksNeedingReminders = allTasks.filter(task => {
            if (!task.next_reminder) return false;
            const reminderTime = new Date(task.next_reminder);
            // Only send if reminder time has passed (with 1 minute buffer for cron timing)
            return reminderTime <= new Date(now.getTime() + 60000);
        });

        console.log(`Found ${tasksNeedingReminders.length} tasks needing reminders`);

        for (const task of tasksNeedingReminders) {
            try {
                const userEmail = task.created_by;
                
                if (!userEmail) {
                    console.error(`Task ${task.id} has no created_by email`);
                    continue;
                }

                // Get user settings
                const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
                const user = users[0];
                
                // Check if user has task reminders enabled
                if (user && user.notification_settings && user.notification_settings.task_reminders === false) {
                    console.log(`Skipping reminder for ${userEmail} - notifications disabled`);
                    continue;
                }

                const pushResponse = await base44.asServiceRole.functions.invoke('sendOneSignalPush', {
                    userEmail: userEmail,
                    title: "Task Reminder 📋",
                    message: task.title,
                    data: {
                        task_id: task.id,
                        urgency: task.urgency,
                        type: 'task_reminder'
                    }
                });

                if (pushResponse.data) {
                    let nextReminderTime = null;
                    
                    // Calculate next reminder based on interval
                    if (task.reminder_interval && task.reminder_interval !== 'once') {
                        const intervalMap = {
                            '10min': 10 * 60 * 1000,
                            '20min': 20 * 60 * 1000,
                            '30min': 30 * 60 * 1000,
                            '1hour': 60 * 60 * 1000,
                            '2hours': 2 * 60 * 60 * 1000,
                            'daily': 24 * 60 * 60 * 1000,
                            'every_other_day': 2 * 24 * 60 * 60 * 1000
                        };
                        
                        const intervalMs = intervalMap[task.reminder_interval] || 0;
                        if (intervalMs > 0) {
                            // CRITICAL FIX: Calculate from NOW, not from the old next_reminder
                            nextReminderTime = new Date(now.getTime() + intervalMs).toISOString();
                            console.log(`Task ${task.id} (${task.reminder_interval}): Next reminder calculated from NOW: ${nextReminderTime}`);
                        }
                    }

                    const updateData = {
                        reminder_count: (task.reminder_count || 0) + 1
                    };
                    
                    if (nextReminderTime) {
                        updateData.next_reminder = nextReminderTime;
                    } else {
                        // For 'once' reminders, clear the next_reminder
                        updateData.next_reminder = null;
                    }

                    await base44.asServiceRole.entities.Task.update(task.id, updateData);
                    console.log(`Sent reminder for task: ${task.title}, next reminder: ${nextReminderTime || 'none'}`);
                }
            } catch (taskError) {
                console.error(`Error processing task ${task.id}:`, taskError);
            }
        }

        return Response.json({ 
            success: true, 
            processed: tasksNeedingReminders.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in checkTaskReminders:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});