import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const BATCH_SIZE = 10; // Schedule 10 reminders at a time

const intervalMsMap = {
  '10min':          10 * 60 * 1000,
  '20min':          20 * 60 * 1000,
  '30min':          30 * 60 * 1000,
  '1hour':      60 * 60 * 1000,
  '2hours':  2 * 60 * 60 * 1000,
  'daily':  24 * 60 * 60 * 1000,
  'every_other_day': 2 * 24 * 60 * 60 * 1000,
};

async function scheduleRecurringReminders({ email, title, body, startTime, intervalMs, count, taskId }) {
  const notificationIds = [];

  for (let i = 0; i < count; i++) {
    const sendAt = new Date(new Date(startTime).getTime() + intervalMs * i);

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
          body: `${body}\n\nTap to mark as complete!`,
          sendAtISO: sendAt.toISOString(),
          data: { screen: '/TaskNotification', taskId, urgency: 'medium', type: 'task_reminder' }
        })
      });

      const result = await response.json();
      if (result.notificationId) {
        notificationIds.push(result.notificationId);
      } else {
        console.error(`[REFILL] No notification ID for reminder #${i + 1}:`, result);
      }
    } catch (error) {
      console.error(`[REFILL] Failed to schedule reminder #${i + 1}:`, error);
    }
  }

  return notificationIds;
}

Deno.serve(async (req) => {
  try {
    console.log('🔄 [REFILL] Starting reminder refill check...');

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Auth
    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    if (!providedSecret) {
      try { providedSecret = (await req.json()).secret || ''; } catch (_) {}
    }
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    const allTasks = await base44.asServiceRole.entities.Task.filter({ status: 'active' });

    const recurringTasks = allTasks.filter(t =>
      t.reminder_interval &&
      t.reminder_interval !== 'once' &&
      intervalMsMap[t.reminder_interval]
    );

    console.log(`📊 [REFILL] Found ${recurringTasks.length} recurring tasks`);

    const now = new Date();
    let refilled = 0;
    let skipped = 0;

    for (const task of recurringTasks) {
      const interval = intervalMsMap[task.reminder_interval];

      // Determine the end of the currently-scheduled window.
      // We use last_scheduled_until if available (new field), otherwise fall back to
      // estimating from next_reminder + 9 intervals (old behaviour for legacy tasks).
      let scheduledUntil;
      if (task.last_scheduled_until) {
        scheduledUntil = new Date(task.last_scheduled_until);
      } else if (task.next_reminder) {
        scheduledUntil = new Date(new Date(task.next_reminder).getTime() + 9 * interval);
      } else {
        scheduledUntil = new Date(0); // epoch — definitely needs refill
      }

      // Refill when we're within 2 intervals of the end of the scheduled window.
      const refillThreshold = new Date(now.getTime() + 2 * interval);
      const needsRefill = scheduledUntil <= refillThreshold;

      if (!needsRefill) {
        skipped++;
        continue;
      }

      console.log(`🔋 [REFILL] Task "${task.title}" (${task.id}) needs refill — scheduled until: ${scheduledUntil.toISOString()}`);

      try {
        // Start the new batch immediately after the last scheduled reminder.
        // If that time is already in the past, start from now + 1 interval instead.
        const batchStart = scheduledUntil > now
          ? new Date(scheduledUntil.getTime() + interval)
          : new Date(now.getTime() + interval);

        const newNotificationIds = await scheduleRecurringReminders({
          email: task.notification_recipient_email || task.created_by,
          title: 'Task Reminder 📋',
          body: task.title,
          startTime: batchStart.toISOString(),
          intervalMs: interval,
          count: BATCH_SIZE,
          taskId: task.id
        });

        if (newNotificationIds.length > 0) {
          const newLastScheduledUntil = new Date(batchStart.getTime() + interval * (newNotificationIds.length - 1));

          // Merge with any existing future notification IDs (keep ones not yet fired)
          const existingIds = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];
          const mergedIds = [...existingIds, ...newNotificationIds];

          await base44.asServiceRole.entities.Task.update(task.id, {
            onesignal_notification_ids: mergedIds,
            last_scheduled_until: newLastScheduledUntil.toISOString(),
            // Update next_reminder only if it's already passed
            ...((!task.next_reminder || new Date(task.next_reminder) <= now)
              ? { next_reminder: batchStart.toISOString() }
              : {})
          });

          console.log(`✅ [REFILL] Scheduled ${newNotificationIds.length} reminders for task "${task.title}", last at: ${newLastScheduledUntil.toISOString()}`);
          refilled++;
        }
      } catch (error) {
        console.error(`❌ [REFILL] Failed to refill task ${task.id}:`, error);
      }
    }

    const result = { success: true, totalRecurringTasks: recurringTasks.length, refilled, skipped, at: now.toISOString() };
    console.log('✅ [REFILL] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [REFILL] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});