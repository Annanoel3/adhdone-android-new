import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildTaskParsePrompt } from '../../shared/taskParsePrompt.ts';
import { adjustForQuietHours, parseHHMM, localMinutesOfDay } from '../../shared/quietHours.ts';

const INTERVAL_MS = {
  '10min': 10 * 60 * 1000,
  '20min': 20 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '2hours': 2 * 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
  'every_other_day': 2 * 24 * 60 * 60 * 1000,
};

const RECURRING_INTERVALS = Object.keys(INTERVAL_MS);

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { email, dryRun = false, skipReparse = false } = body;
    const targetEmail = (email || user.email).toLowerCase().trim();

    // Fetch all active tasks for the account
    const tasks = await base44.asServiceRole.entities.Task.filter({
      notification_recipient_email: targetEmail,
      status: 'active'
    }, '-created_date', 200);

    console.log(`[rescanTasks] Found ${tasks.length} active tasks for ${targetEmail}`);

    // Fetch the target user's profile for per-user, timezone-aware quiet hours.
    // schedulePush no longer applies its own (broken) UTC blanket, so the rescan
    // must apply the owner's actual quiet hours — same as cronRefillReminders.
    const allUsers = await base44.asServiceRole.entities.User.list();
    const owner = allUsers.find(u => u.email && u.email.toLowerCase().trim() === targetEmail);
    const quietEnabled = !!(owner && owner.quiet_hours_enabled);
    const timeZone = owner && owner.timezone ? owner.timezone : null;
    const startMin = owner && owner.quiet_hours_start ? parseHHMM(owner.quiet_hours_start) : parseHHMM('22:00');
    const endMin = owner && owner.quiet_hours_end ? parseHHMM(owner.quiet_hours_end) : parseHHMM('08:00');
    const useQuiet = quietEnabled && !!timeZone;
    console.log(`[rescanTasks] Quiet hours: ${useQuiet ? `enabled (${owner.quiet_hours_start}-${owner.quiet_hours_end} ${timeZone})` : 'disabled'}`);

    const results = [];

    for (const task of tasks) {
      try {
        // ── Step 1: Determine new field values ──────────────────────────────
        // When skipReparse is true, use existing task values as-is — don't re-parse
        // the already-clean title (re-parsing would wipe due dates, day-only flags,
        // etc. since the clean title has no date/time info). Only convert
        // 2hours/4hours → null (the user wants those gone, replaced by smart nudge).
        let newUrgency, newEnergy, newInterval;

        if (skipReparse) {
          newUrgency = task.urgency || 'medium';
          newEnergy = task.energy_required || 'medium';
          newInterval = (task.reminder_interval === '2hours' || task.reminder_interval === '4hours')
            ? null
            : task.reminder_interval;
        } else {
          const prompt = buildTaskParsePrompt(task.title);
          const parseResp = await base44.functions.invoke('parseTask', { prompt });
          const parsed = (parseResp.data || parseResp).response;

          newUrgency = parsed.urgency || task.urgency || 'medium';
          newEnergy = parsed.energy_required || task.energy_required || 'medium';

          const hasFutureDate = (task.next_reminder && new Date(task.next_reminder) > new Date()) ||
                                (task.due_date && new Date(task.due_date) > new Date());

          newInterval = parsed.reminder_interval || task.reminder_interval;
          if (hasFutureDate && task.reminder_interval === 'once') {
            newInterval = 'once';
          }
        }

        // Calculate next_reminder
        let nextReminder = task.next_reminder;
        if (RECURRING_INTERVALS.includes(newInterval)) {
          // Recurring task — ensure next_reminder is in the future
          if (!nextReminder || new Date(nextReminder) <= new Date(Date.now() + 2 * 60 * 1000)) {
            nextReminder = new Date(Date.now() + INTERVAL_MS[newInterval]).toISOString();
          }
        }

        const wouldSchedule = !!(nextReminder && new Date(nextReminder) > new Date(Date.now() + 2 * 60 * 1000));

        // For smart-nudge tasks (null interval), clear next_reminder — the smart
        // nudge cron handles timing, not the per-task next_reminder field.
        if (!newInterval) {
          nextReminder = null;
        }

        if (dryRun) {
          results.push({
            id: task.id,
            title: task.title,
            oldUrgency: task.urgency,
            newUrgency,
            oldEnergy: task.energy_required,
            newEnergy,
            oldInterval: task.reminder_interval,
            newInterval,
            nextReminder,
            oldNotifications: (task.onesignal_notification_ids || []).length,
            wouldSchedule,
          });
          continue;
        }

        // ── Step 3: Cancel old notifications ─────────────────────────────────
        const oldIds = task.onesignal_notification_ids || [];
        for (const notifId of oldIds) {
          try {
            await base44.functions.invoke('cancelScheduled', { notificationId: notifId });
          } catch (e) {
            console.error(`[rescanTasks] Failed to cancel ${notifId}:`, e);
          }
        }

        // ── Step 4: Update task with new fields + cleared notification arrays ─
        // onTaskUpdate sees empty onesignal_notification_ids → skips rescheduling
        await base44.asServiceRole.entities.Task.update(task.id, {
          urgency: newUrgency,
          energy_required: newEnergy,
          reminder_interval: newInterval,
          next_reminder: nextReminder,
          onesignal_notification_ids: [],
          reminder_schedule: [],
          last_scheduled_until: null,
        });

        // ── Step 5: Schedule new notifications ───────────────────────────────
        const newNotificationIds = [];
        let newReminderSchedule = [];
        let newLastScheduledUntil = null;

        if (wouldSchedule) {
          if (newInterval === 'once') {
            // One-time task — use generateReminderSchedule for smart multi-reminders
            try {
              const schedResp = await base44.functions.invoke('generateReminderSchedule', {
                title: task.title,
                scheduledDateISO: nextReminder,
                urgency: newUrgency,
              });
              const schedData = schedResp.data || schedResp;
              const reminders = schedData.reminders || [];

              // Resolve reminder times to ISO timestamps
              const scheduled = new Date(nextReminder);
              const bufferMs = Date.now() + 2 * 60 * 1000;

              const reminderTimes = reminders
                .map(r => {
                  let reminderTime;
                  if (r.relative_minutes_before != null) {
                    reminderTime = new Date(scheduled.getTime() - r.relative_minutes_before * 60 * 1000);
                  } else {
                    reminderTime = new Date(scheduled);
                    reminderTime.setDate(reminderTime.getDate() - (r.days_before || 0));
                    reminderTime.setHours(r.hour || 0, r.minute || 0, 0, 0);
                  }
                  return {
                    sendAtISO: reminderTime.toISOString(),
                    label: r.label,
                    notification_title: r.notification_title || '📅 Upcoming',
                    notification_body: r.notification_body || task.title,
                  };
                })
                .filter(r => new Date(r.sendAtISO).getTime() > bufferMs)
                .sort((a, b) => new Date(a.sendAtISO).getTime() - new Date(b.sendAtISO).getTime());

              let oneTimeLastScheduledAt = null;
              for (const reminder of reminderTimes) {
                let sendAt = new Date(reminder.sendAtISO);
                if (useQuiet) {
                  sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
                  // Skip the first-of-day notification — the daily digest replaces it
                  if (localMinutesOfDay(sendAt, timeZone) === endMin) {
                    continue;
                  }
                  if (oneTimeLastScheduledAt && Math.abs(sendAt.getTime() - oneTimeLastScheduledAt.getTime()) < 60000) {
                    continue;
                  }
                }
                const adjustedISO = sendAt.toISOString();
                try {
                  const pushResp = await base44.functions.invoke('schedulePush', {
                    toUserExternalId: targetEmail,
                    title: reminder.notification_title,
                    body: reminder.notification_body,
                    sendAtISO: adjustedISO,
                    data: { screen: '/TaskNotification', taskId: task.id, urgency: newUrgency, type: 'task_reminder' },
                    buttons: [
                      { id: 'snooze_15', text: 'Snooze 15 min' },
                      { id: 'snooze_60', text: 'Snooze 1 hour' },
                      { id: 'complete', text: '✅ Done' },
                    ],
                  });
                  const pushResult = pushResp.data || pushResp;
                  if (pushResult.notificationId) {
                    newNotificationIds.push(pushResult.notificationId);
                    oneTimeLastScheduledAt = sendAt;
                    newReminderSchedule.push({
                      notification_id: pushResult.notificationId,
                      send_at: adjustedISO,
                      label: reminder.label,
                      notification_title: reminder.notification_title,
                      notification_body: reminder.notification_body,
                    });
                  }
                } catch (e) {
                  console.error(`[rescanTasks] Failed to schedule reminder for "${task.title}":`, e);
                }
              }
            } catch (e) {
              console.error(`[rescanTasks] Failed to generate reminder schedule for "${task.title}":`, e);
            }
          } else if (INTERVAL_MS[newInterval]) {
            // Recurring task — schedule 10 notifications at the new interval
            let scheduleTime = new Date(nextReminder).getTime();
            const now = Date.now();
            let lastScheduledAt = null; // de-dupe quiet-hour slots that collapse to the same time

            for (let i = 0; i < 10; i++) {
              if (scheduleTime > now) {
                let sendAt = new Date(scheduleTime);
                if (useQuiet) {
                  sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
                  // Skip the first-of-day notification — the daily digest replaces it
                  if (localMinutesOfDay(sendAt, timeZone) === endMin) {
                    scheduleTime += INTERVAL_MS[newInterval];
                    continue;
                  }
                  // Quiet-hours can shift two consecutive night slots onto the same
                  // morning minute — skip duplicates rather than send two at once.
                  if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt.getTime()) < 60000) {
                    scheduleTime += INTERVAL_MS[newInterval];
                    continue;
                  }
                }
                const sendAtISO = sendAt.toISOString();
                try {
                  const pushResp = await base44.functions.invoke('schedulePush', {
                    toUserExternalId: targetEmail,
                    title: 'Task Reminder 📋',
                    body: `${task.title}\n\nTap to mark as complete!`,
                    sendAtISO,
                    data: { screen: '/TaskNotification', taskId: task.id, urgency: newUrgency, type: 'task_reminder' },
                    buttons: [
                      { id: 'snooze_15', text: 'Snooze 15 min' },
                      { id: 'snooze_60', text: 'Snooze 1 hour' },
                      { id: 'complete', text: '✅ Done' },
                    ],
                  });
                  const pushResult = pushResp.data || pushResp;
                  if (pushResult.notificationId) {
                    newNotificationIds.push(pushResult.notificationId);
                    lastScheduledAt = sendAt;
                  }
                } catch (e) {
                  console.error(`[rescanTasks] Failed to schedule recurring reminder for "${task.title}":`, e);
                }
              }
              scheduleTime += INTERVAL_MS[newInterval];
            }

            if (newNotificationIds.length > 0) {
              newLastScheduledUntil = lastScheduledAt
                ? lastScheduledAt.toISOString()
                : new Date(scheduleTime - INTERVAL_MS[newInterval]).toISOString();
            }
          }
        }

        // ── Step 6: Update task with new notification IDs ─────────────────────
        // onTaskUpdate sees old_data (from step 4) with same interval → skips rescheduling
        if (newNotificationIds.length > 0) {
          await base44.asServiceRole.entities.Task.update(task.id, {
            onesignal_notification_ids: newNotificationIds,
            ...(newReminderSchedule.length > 0 ? { reminder_schedule: newReminderSchedule } : {}),
            ...(newLastScheduledUntil ? { last_scheduled_until: newLastScheduledUntil } : {}),
          });
        }

        results.push({
          id: task.id,
          title: task.title,
          status: 'rescanned',
          oldUrgency: task.urgency,
          newUrgency,
          oldInterval: task.reminder_interval,
          newInterval,
          oldNotifications: oldIds.length,
          newNotifications: newNotificationIds.length,
        });

        console.log(`[rescanTasks] ✅ Rescanned "${task.title}" — ${newNotificationIds.length} notifications scheduled`);
      } catch (taskError) {
        console.error(`[rescanTasks] Failed to rescan task ${task.id}:`, taskError);
        results.push({ id: task.id, title: task.title, status: 'error', error: taskError.message });
      }
    }

    // Mark the smart nudge schedule dirty + clear old schedule so the cron
    // regenerates immediately with the updated task list (includes converted
    // 2hours/4hours tasks that are now smart-nudge-eligible).
    try {
      const ownerRecord = allUsers.find(u => u.email && u.email.toLowerCase().trim() === targetEmail);
      if (ownerRecord) {
        await base44.asServiceRole.entities.User.update(ownerRecord.id, {
          smart_nudge_schedule_dirty: true,
          smart_nudge_schedule: [],
        });
        console.log(`[rescanTasks] Marked smart nudge schedule dirty for ${targetEmail}`);
      }
    } catch (e) {
      console.error('[rescanTasks] Failed to mark smart nudge dirty:', e);
    }

    return Response.json({ email: targetEmail, totalTasks: tasks.length, results });
  } catch (error) {
    console.error('[rescanTasks] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}