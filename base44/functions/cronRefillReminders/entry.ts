import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const BATCH_SIZE = 10;

const intervalMsMap = {
  '10min':           10 * 60 * 1000,
  '20min':           20 * 60 * 1000,
  '30min':           30 * 60 * 1000,
  '1hour':       60 * 60 * 1000,
  '2hours':   2 * 60 * 60 * 1000,
  'daily':   24 * 60 * 60 * 1000,
  'every_other_day': 2 * 24 * 60 * 60 * 1000,
};

Deno.serve(async (req) => {
  try {
    console.log('🔄 [REFILL] Starting reminder refill check...');

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    let providedSecret = req.headers.get('X-Secret') || url.searchParams.get('secret') || '';
    if (!providedSecret) {
      try { providedSecret = (await req.clone().json()).secret || ''; } catch (_) {}
    }
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    const allTasks = await base44.asServiceRole.entities.Task.list('-updated_date', 500);
    console.log(`📦 [REFILL] Total tasks fetched: ${allTasks.length}`);

    const recurringTasks = allTasks.filter(t =>
      t.status === 'active' &&
      t.reminder_interval &&
      t.reminder_interval !== 'once' &&
      intervalMsMap[t.reminder_interval] &&
      t.notification_recipient_email  // require explicit email — never fall back to created_by
    );

    console.log(`📊 [REFILL] Found ${recurringTasks.length} recurring tasks`);

    const now = new Date();
    let refilled = 0;
    let skipped = 0;

    for (const task of recurringTasks) {
      const interval = intervalMsMap[task.reminder_interval];

      // Determine end of currently-scheduled window
      let scheduledUntil;
      if (task.last_scheduled_until) {
        scheduledUntil = new Date(task.last_scheduled_until);
      } else if (task.next_reminder) {
        // Legacy fallback: estimate from next_reminder + 9 intervals
        scheduledUntil = new Date(new Date(task.next_reminder).getTime() + 9 * interval);
      } else {
        scheduledUntil = new Date(0);
      }

      // Refill when within 2 intervals of the end of the window
      const refillThreshold = new Date(now.getTime() + 2 * interval);
      if (scheduledUntil > refillThreshold) {
        skipped++;
        continue;
      }

      console.log(`🔋 [REFILL] Task "${task.title}" (${task.id}) needs refill — scheduled until: ${scheduledUntil.toISOString()}`);

      try {
        // Cancel any existing scheduled OneSignal notifications for this task first
        const oldIds = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];
        if (oldIds.length > 0) {
          const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
          const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
          await Promise.allSettled(oldIds.map(id =>
            fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
              method: 'DELETE',
              headers: { Authorization: `Basic ${restApiKey}` }
            })
          ));
          console.log(`🗑 [REFILL] Cancelled ${oldIds.length} old notifications for "${task.title}"`);
        }

        const batchStart = scheduledUntil > now
          ? new Date(scheduledUntil.getTime() + interval)
          : new Date(now.getTime() + interval);

        const email = task.notification_recipient_email;
        const notificationIds = [];

        for (let i = 0; i < BATCH_SIZE; i++) {
          const sendAt = new Date(batchStart.getTime() + interval * i);
          try {
            const res = await base44.asServiceRole.functions.invoke('schedulePush', {
              toUserExternalId: email,
              title: 'Task Reminder 📋',
              body: `${task.title}\n\nTap to mark as complete!`,
              sendAtISO: sendAt.toISOString(),
              data: {
                screen: '/TaskNotification',
                taskId: task.id,
                urgency: task.urgency || 'medium',
                type: 'task_reminder'
              },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            });
            const result = res?.data || res;
            if (result?.notificationId) {
              notificationIds.push(result.notificationId);
            }
          } catch (e) {
            console.error(`[REFILL] Failed to schedule reminder #${i + 1} for task ${task.id}:`, e);
          }
        }

        if (notificationIds.length > 0) {
          const newLastScheduledUntil = new Date(batchStart.getTime() + interval * (notificationIds.length - 1));
          const existingIds = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];

          await base44.asServiceRole.entities.Task.update(task.id, {
            onesignal_notification_ids: notificationIds,
            last_scheduled_until: newLastScheduledUntil.toISOString(),
            ...(!task.next_reminder || new Date(task.next_reminder) <= now
              ? { next_reminder: batchStart.toISOString() }
              : {})
          });

          console.log(`✅ [REFILL] Scheduled ${notificationIds.length} reminders for "${task.title}", last at: ${newLastScheduledUntil.toISOString()}`);
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