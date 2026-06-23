import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

async function cancelOneSignalNotification(notificationId) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.log('[onTaskUpdate] OneSignal credentials missing, skipping cancel');
    return false;
  }

  try {
    const response = await fetch(`https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      }
    });

    if (response.ok) {
      console.log(`[onTaskUpdate] Cancelled OneSignal notification: ${notificationId}`);
      return true;
    } else {
      console.error(`[onTaskUpdate] Failed to cancel notification ${notificationId}:`, response.status);
      return false;
    }
  } catch (error) {
    console.error('[onTaskUpdate] Error cancelling OneSignal notification:', error);
    return false;
  }
}

async function scheduleOneSignalNotification(email, title, body, sendAfterSeconds, taskId) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.log('[onTaskUpdate] OneSignal credentials missing, skipping schedule');
    return null;
  }

  try {
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: body },
      include_external_user_ids: [email],
      send_after: sendAfterSeconds,
      data: {
        screen: '/TaskNotification',
        taskId: taskId,
        type: 'task_reminder'
      }
    };

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`[onTaskUpdate] OneSignal API error (${response.status}):`, error);
      return null;
    }

    const result = await response.json();
    console.log(`[onTaskUpdate] Scheduled OneSignal notification, ID: ${result.id}`);
    return result.id;
  } catch (error) {
    console.error('[onTaskUpdate] Error scheduling OneSignal notification:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    console.log('[onTaskUpdate] ========== FUNCTION START ==========');
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    
    const { event, data, old_data } = payload;

    console.log('[onTaskUpdate] Event type:', event.type);
    console.log('[onTaskUpdate] Task ID:', event.entity_id);
    console.log('[onTaskUpdate] Old data:', JSON.stringify(old_data, null, 2));
    console.log('[onTaskUpdate] New data:', JSON.stringify(data, null, 2));

    // Only handle update events
    if (event.type !== 'update') {
      console.log('[onTaskUpdate] Not an update event, skipping');
      return Response.json({ success: true, skipped: true });
    }

    // Check if there are scheduled notifications for this task
    if (!data.onesignal_notification_ids || data.onesignal_notification_ids.length === 0) {
      console.log('[onTaskUpdate] No scheduled notifications for this task');
      return Response.json({ success: true, noNotifications: true });
    }

    // Cancel all old notifications
    console.log('[onTaskUpdate] Cancelling', data.onesignal_notification_ids.length, 'scheduled notifications');
    for (const notificationId of data.onesignal_notification_ids) {
      await cancelOneSignalNotification(notificationId);
    }

    // Only reschedule if title or reminder_interval changed (not cron-driven next_reminder bumps)
    if (old_data.title !== data.title || old_data.reminder_interval !== data.reminder_interval) {
      console.log('[onTaskUpdate] Task details changed, rescheduling notifications');
      
      // Get the task to get next_reminder and other details
      const task = await base44.asServiceRole.entities.Task.filter({ id: event.entity_id });
      if (task.length === 0) {
        console.error('[onTaskUpdate] Task not found after update');
        return Response.json({ success: false, error: 'Task not found' }, { status: 500 });
      }

      const currentTask = task[0];
      
      // If there's a next_reminder set, reschedule the next batch of notifications
      if (currentTask.next_reminder && currentTask.reminder_interval) {
        const intervalMs = {
          '10min': 10 * 60 * 1000,
          '20min': 20 * 60 * 1000,
          '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000,
          '2hours': 2 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        const ms = intervalMs[currentTask.reminder_interval];
        const now = Date.now();
        const nextReminderTime = new Date(currentTask.next_reminder).getTime();
        
        // Schedule the next 10 notifications with updated title
        const newNotificationIds = [];
        let scheduleTime = nextReminderTime;
        
        for (let i = 0; i < 10; i++) {
          const sendAfterSeconds = Math.round((scheduleTime - now) / 1000);
          
          // Only schedule if it's in the future
          if (sendAfterSeconds > 0) {
            const notificationId = await scheduleOneSignalNotification(
              currentTask.notification_recipient_email || user.email,
              'Task Reminder 📋',
              currentTask.title || 'You have a task due',
              sendAfterSeconds,
              currentTask.id
            );

            if (notificationId) {
              newNotificationIds.push(notificationId);
            }
          }

          scheduleTime += ms;
        }

        // Update task with new notification IDs
        if (newNotificationIds.length > 0) {
          const lastScheduledUntil = new Date(scheduleTime - ms).toISOString();
          await base44.asServiceRole.entities.Task.update(event.entity_id, {
            onesignal_notification_ids: newNotificationIds,
            last_scheduled_until: lastScheduledUntil
          });

          console.log('[onTaskUpdate] Rescheduled', newNotificationIds.length, 'notifications');
        }
      }
    }

    console.log('[onTaskUpdate] ========== SUCCESS ==========');
    return Response.json({ success: true });

  } catch (error) {
    console.error('[onTaskUpdate] Unhandled error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});