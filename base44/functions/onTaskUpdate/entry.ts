import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { getReminderContent } from '../../shared/reminderTitle.ts';
import { adjustForQuietHours, parseHHMM, localMinutesOfDay } from '../../shared/quietHours.ts';

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

async function scheduleOneSignalNotification(email, title, body, sendAfterIsoString, taskId) {
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
      send_after: sendAfterIsoString,
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

    // On delete: cancel any lingering OneSignal notifications using old_data
    if (event.type === 'delete') {
      const ids = old_data?.onesignal_notification_ids || [];
      if (ids.length > 0) {
        console.log(`[onTaskUpdate] Task deleted — cancelling ${ids.length} notifications`);
        for (const notificationId of ids) {
          await cancelOneSignalNotification(notificationId);
        }
      }
      return Response.json({ success: true, cancelled: ids.length, reason: 'task_deleted' });
    }

    // On create: if this is a smart-nudge-eligible task (day-only or no due date,
    // not a birthday/event), mark the daily nudge schedule dirty so the next cron
    // run regenerates it with the new task included. No OneSignal work needed here —
    // the cron handles sending.
    if (event.type === 'create') {
      const RECURRING_INTERVALS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
      const isSmartNudgeTask =
        data.status === 'active' &&
        !RECURRING_INTERVALS.has(data.reminder_interval) &&
        data.classification !== 'birthday' && data.classification !== 'event' &&
        !data.birthday_person && (
          data.day_only_task ||
          (!data.due_date && !data.event_time && !data.start_date && !data.next_reminder)
        );

      if (isSmartNudgeTask) {
        console.log('[onTaskUpdate] New smart-nudge task created — marking schedule dirty');
        try {
          await base44.asServiceRole.entities.User.update(user.id, {
            smart_nudge_schedule_dirty: true
          });
        } catch (e) {
          console.error('[onTaskUpdate] Failed to mark smart nudge schedule dirty on create:', e);
        }
      }

      return Response.json({ success: true, created: true, smartNudge: isSmartNudgeTask });
    }

    // Only handle update events beyond this point
    if (event.type !== 'update') {
      console.log('[onTaskUpdate] Not an update or delete event, skipping');
      return Response.json({ success: true, skipped: true });
    }

    // Focus session logging is handled client-side in FocusModePrompt's
    // handleComplete (which holds the authoritative local enteredAt and avoids
    // the race between this automation firing on Task.update and setFocusMode
    // exit clearing the focus state). Here we only clear the user's focus state
    // so Focus Mode ends promptly on a direct completion of the focus task.
    if (data.status === 'completed') {
      const focusTaskId = user.focus_mode_task_id;
      if (focusTaskId && focusTaskId === event.entity_id) {
        try {
          await base44.asServiceRole.entities.User.update(user.id, {
            focus_mode_task_id: null,
            focus_mode_entered_at: null
          });
        } catch (e) {
          console.error('[onTaskUpdate] clear focus state failed:', e);
        }
      }
    }

    // CRITICAL: If task is completed or snoozed, cancel ALL notifications and wipe
    // all scheduling fields. This MUST come before the empty-notification-IDs early
    // return below — otherwise a task whose onesignal_notification_ids was already
    // cleared (e.g. by the frontend or by setFocusMode exit) would skip this block
    // and keep its reminder_interval / next_reminder set, leaving orphaned push
    // notifications in OneSignal that fire long after completion.
    if (data.status === 'completed' || data.status === 'snoozed') {
      console.log(`[onTaskUpdate] Task status is "${data.status}" — cancelling all notifications and clearing scheduling fields`);
      // Fall back to old_data IDs when the update cleared them — otherwise the
      // real OneSignal notifications would be orphaned and keep firing forever.
      const ids = (data.onesignal_notification_ids?.length
        ? data.onesignal_notification_ids
        : (old_data?.onesignal_notification_ids || []));
      for (const notificationId of ids) {
        await cancelOneSignalNotification(notificationId);
      }

      // Also cancel one-time/event reminders stored in reminder_schedule —
      // these are separate OneSignal notification IDs that are NOT in
      // onesignal_notification_ids, so they'd otherwise keep firing after
      // the task is completed.
      const scheduleEntries = (data.reminder_schedule?.length
        ? data.reminder_schedule
        : (old_data?.reminder_schedule || []));
      for (const entry of scheduleEntries) {
        if (entry?.notification_id) {
          await cancelOneSignalNotification(entry.notification_id);
        }
      }

      // GUARD: Only update if there's actually something to clear. Without this,
      // the Task.update() call below re-triggers this very automation (entity
      // update event), which sees the same completed/snoozed status, enters this
      // block again, and calls update again — an infinite self-triggering loop
      // that burns integration credits (48k+ in 9 days).
      const needsClearing =
        (data.onesignal_notification_ids?.length > 0) ||
        (data.reminder_schedule?.length > 0) ||
        data.last_scheduled_until ||
        data.next_reminder ||
        data.reminder_interval ||
        data.notification_recipient_email;

      if (needsClearing) {
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          onesignal_notification_ids: [],
          reminder_schedule: [],
          last_scheduled_until: null,
          next_reminder: null,
          reminder_interval: null,
          notification_recipient_email: null
        });
        console.log('[onTaskUpdate] Cleared scheduling fields');
      } else {
        console.log('[onTaskUpdate] Scheduling fields already clear — skipping update to prevent loop');
      }

      return Response.json({ success: true, cancelled: true, reason: 'task_completed_or_snoozed' });
    }

    // Smart nudge reassessment: when urgency changes to "urgent", mark the daily
    // nudge schedule as dirty so the next hourly cron regenerates it with the
    // urgent task included (surfaces it sooner, with appropriate urgency).
    if (old_data?.urgency !== 'urgent' && data.urgency === 'urgent') {
      console.log('[onTaskUpdate] Urgency changed to urgent — marking smart nudge schedule dirty');
      try {
        await base44.asServiceRole.entities.User.update(user.id, {
          smart_nudge_schedule_dirty: true
        });
      } catch (e) {
        console.error('[onTaskUpdate] Failed to mark smart nudge schedule dirty:', e);
      }
    }

    // Check if there are scheduled notifications for this task
    if (!data.onesignal_notification_ids || data.onesignal_notification_ids.length === 0) {
      console.log('[onTaskUpdate] No scheduled notifications for this task');
      return Response.json({ success: true, noNotifications: true });
    }

    // For one-time reminders, the frontend handles all scheduling — don't cancel or reschedule
    if (data.reminder_interval === 'once') {
      console.log('[onTaskUpdate] One-time reminder — frontend handles scheduling, skipping');
      return Response.json({ success: true, skipped: true, reason: 'one_time_reminder' });
    }

    // Only cancel + reschedule when a reminder-relevant field changed. Other updates
    // (urgency, energy, notes, subtasks, etc.) must NOT wipe scheduled notifications.
    // NOTE: next_reminder is intentionally excluded — it's bumped by cron jobs (refill /
    // bookkeeping), not user edits, so including it would make the refill cron trigger a
    // redundant cancel+reschedule race (and risk wiping notifications if reschedule fails).
    // The frontend reschedules via its reminder utilities whenever a user changes a time.
    if (old_data.title !== data.title || old_data.reminder_interval !== data.reminder_interval || old_data.due_date !== data.due_date) {
      console.log('[onTaskUpdate] Reminder-relevant field changed, cancelling old notifications and rescheduling');

      // Cancel all old notifications
      for (const notificationId of data.onesignal_notification_ids) {
        await cancelOneSignalNotification(notificationId);
      }
      
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
          '4hours': 4 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        const ms = intervalMs[currentTask.reminder_interval];
        const now = Date.now();
        const nextReminderTime = new Date(currentTask.next_reminder).getTime();

        // Owner quiet hours (local "HH:MM"). Apply only when enabled AND the owner
        // has a recorded timezone — otherwise we can't convert local wall-time to UTC.
        // Mirrors cronRefillReminders so a reschedule here never fires at 4 AM.
        const quietEnabled = !!(user && user.quiet_hours_enabled);
        const timeZone = user && user.timezone ? user.timezone : null;
        const startMin = user && user.quiet_hours_start ? parseHHMM(user.quiet_hours_start) : parseHHMM('22:00');
        const endMin = user && user.quiet_hours_end ? parseHHMM(user.quiet_hours_end) : parseHHMM('08:00');
        const useQuiet = quietEnabled && !!timeZone;

        // Schedule the next 10 notifications with updated title
        const newNotificationIds = [];
        let scheduleTime = nextReminderTime;
        let lastScheduledAt: number | null = null;

        for (let i = 0; i < 10; i++) {
          let sendAt = new Date(scheduleTime);
          if (useQuiet) {
            sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
            // Skip the first-of-day slot — the daily digest cron covers it.
            if (localMinutesOfDay(sendAt, timeZone) === endMin) {
              scheduleTime += ms;
              continue;
            }
            // Skip duplicates that collapse onto the same morning minute.
            if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt) < 60000) {
              scheduleTime += ms;
              continue;
            }
          }
          // Only schedule if it's in the future
          if (sendAt.getTime() > now) {
            const sendAtISO = sendAt.toISOString();
            const { title, body } = getReminderContent(currentTask.title, currentTask.due_date, sendAtISO);
            const notificationId = await scheduleOneSignalNotification(
              currentTask.notification_recipient_email || user.email,
              title,
              body,
              sendAtISO,
              currentTask.id
            );

            if (notificationId) {
              newNotificationIds.push(notificationId);
              lastScheduledAt = sendAt.getTime();
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