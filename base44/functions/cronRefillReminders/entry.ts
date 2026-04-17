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
      console.log(`[scheduleRecurringReminders] Scheduling #${i + 1}/${count} for ${sendAt.toISOString()}`);
      
      const response = await fetch(`${Deno.env.get('SCHEDULER_URL')}/schedulePush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret': Deno.env.get('SCHEDULER_SECRET'),
        },
        body: JSON.stringify({
          toUserExternalId: email,
          title,
          body: `${body}\n\nTap to mark as complete!`,
          sendAtISO: sendAt.toISOString(),
          data: {
            screen: "/TaskNotification",
            taskId,
            urgency: 'medium',
            type: 'task_reminder'
          }
        })
      });

      const result = await response.json();
      console.log(`[scheduleRecurringReminders] Response #${i + 1}:`, result);
      
      if (result.notificationId) {
        notificationIds.push(result.notificationId);
        console.log(`[scheduleRecurringReminders] ✅ Added notification ID: ${result.notificationId}`);
      } else {
        console.error(`[scheduleRecurringReminders] ❌ No notification ID in response:`, result);
      }
    } catch (error) {
      console.error(`[scheduleRecurringReminders] ❌ Failed to schedule reminder #${i + 1}:`, error);
    }
  }
  
  console.log(`[scheduleRecurringReminders] Total scheduled: ${notificationIds.length}/${count}`);
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

    const now = new Date();

    for (const task of recurringTasks) {
      const interval = intervalMs[task.reminder_interval];
      const nextReminder = task.next_reminder ? new Date(task.next_reminder) : null;
      
      // Calculate how far into the future we have reminders scheduled
      // If next_reminder + (10 * interval) is less than 5 intervals from now, we need to refill
      const bufferThreshold = now.getTime() + (5 * interval);
      const lastScheduledApprox = nextReminder ? nextReminder.getTime() + (9 * interval) : 0;
      
      const needsRefill = !nextReminder || nextReminder.getTime() < now.getTime() || lastScheduledApprox < bufferThreshold;
      
      if (needsRefill) {
        console.log(`🔋 [REFILL REMINDERS] Task "${task.title}" (${task.id}) needs refill - next_reminder: ${task.next_reminder}`);
        
        try {
          // Start from now + interval (or next_reminder if it's in the future)
          let startTime;
          if (nextReminder && nextReminder.getTime() > now.getTime()) {
            // Calculate where we'd be after existing scheduled reminders
            startTime = new Date(nextReminder.getTime() + (10 * interval));
          } else {
            // Start fresh from now
            startTime = new Date(now.getTime() + interval);
          }
          
          const newNotificationIds = await scheduleRecurringReminders({
            email: task.notification_recipient_email || task.created_by,
            title: "Task Reminder 📋",
            body: task.title,
            startTime: startTime.toISOString(),
            intervalMs: interval,
            count: 10,
            taskId: task.id
          });

          if (newNotificationIds.length > 0) {
            // Calculate the new next_reminder (first upcoming one)
            const newNextReminder = nextReminder && nextReminder.getTime() > now.getTime() 
              ? nextReminder 
              : new Date(now.getTime() + interval);
            
            // Replace old notification IDs with new ones (old ones have already fired)
            await base44.asServiceRole.entities.Task.update(task.id, {
              onesignal_notification_ids: newNotificationIds,
              next_reminder: newNextReminder.toISOString()
            });
            
            console.log(`✅ [REFILL REMINDERS] Scheduled ${newNotificationIds.length} reminders for task ${task.id}, next: ${newNextReminder.toISOString()}`);
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