import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

const intervalMs = {
  '10min': 10 * 60 * 1000,
  '20min': 20 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '2hours': 2 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
  'every_other_day': 2 * 24 * 60 * 60 * 1000,
};

async function scheduleRecurringReminders({
  email,
  title,
  body,
  startTime,
  intervalMs,
  count,
  taskId,
}) {
  const notificationIds = [];
  
  for (let i = 0; i < count; i++) {
    const sendAt = new Date(new Date(startTime).getTime() + (intervalMs * i));
    
    try {
      const response = await fetch(`${Deno.env.get('SCHEDULER_URL')}/schedulePush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret': Deno.env.get('SCHEDULER_SECRET'),
        },
        body: JSON.stringify({
          toUserExternalId: email,
          title,
          body,
          sendAtISO: sendAt.toISOString(),
          data: {
            screen: "/Tasks",
            taskId,
            type: 'task_reminder'
          }
        })
      });

      const result = await response.json();
      if (result.notificationId) {
        notificationIds.push(result.notificationId);
      }
    } catch (error) {
      console.error(`Failed to schedule reminder #${i + 1}:`, error);
    }
  }
  
  return notificationIds;
}

Deno.serve(async (req) => {
  try {
    console.log('🔄 [REFILL REMINDERS] Starting reminder refill check...');
    
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    
    if (!providedSecret) {
      try {
        const body = await req.json();
        providedSecret = body.secret || '';
      } catch (e) {
        // Body not JSON or empty
      }
    }
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.log('❌ [REFILL REMINDERS] Unauthorized - invalid secret');
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    // Get all active tasks with recurring intervals
    const allTasks = await base44.asServiceRole.entities.Task.filter({
      status: 'active'
    });

    const recurringTasks = allTasks.filter(t => 
      t.reminder_interval && 
      t.reminder_interval !== 'once' &&
      intervalMs[t.reminder_interval]
    );

    console.log(`📊 [REFILL REMINDERS] Found ${recurringTasks.length} recurring tasks`);

    let refilled = 0;
    let skipped = 0;

    for (const task of recurringTasks) {
      const remainingCount = task.onesignal_notification_ids?.length || 0;
      
      // Refill if less than 10 reminders left
      if (remainingCount < 10) {
        console.log(`🔋 [REFILL REMINDERS] Task "${task.title}" (${task.id}) has ${remainingCount} reminders left - refilling...`);
        
        try {
          const now = new Date();
          const interval = intervalMs[task.reminder_interval];
          
          // Start from now + interval
          const startTime = new Date(now.getTime() + interval);
          
          const newNotificationIds = await scheduleRecurringReminders({
            email: task.created_by,
            title: "Task Reminder 📋",
            body: task.title,
            startTime: startTime.toISOString(),
            intervalMs: interval,
            count: 50,
            taskId: task.id
          });

          if (newNotificationIds.length > 0) {
            // Append new notification IDs to existing ones
            const updatedIds = [
              ...(task.onesignal_notification_ids || []),
              ...newNotificationIds
            ];
            
            await base44.asServiceRole.entities.Task.update(task.id, {
              onesignal_notification_ids: updatedIds
            });
            
            console.log(`✅ [REFILL REMINDERS] Added ${newNotificationIds.length} reminders to task ${task.id}`);
            refilled++;
          }
        } catch (error) {
          console.error(`❌ [REFILL REMINDERS] Failed to refill task ${task.id}:`, error);
        }
      } else {
        skipped++;
      }
    }

    const result = {
      success: true,
      totalRecurringTasks: recurringTasks.length,
      refilled,
      skipped,
      at: new Date().toISOString(),
    };
    
    console.log('✅ [REFILL REMINDERS] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [REFILL REMINDERS] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});