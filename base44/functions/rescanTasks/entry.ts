import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildTaskParsePrompt } from '../../shared/taskParsePrompt.ts';
// Shared files are bundled into this function when it is deployed, so a change
// to the shared prompt (taskParsePrompt.ts) only reaches users after this
// function is saved and redeployed again (last redeploy: the parser telling
// "by 5" — a deadline — apart from "at 5").
import { adjustForQuietHours, localMinutesOfDay, resolveQuietHours, userTimeZone, placeRepeatingSlot } from '../../shared/quietHours.ts';
import { localReminderUtc } from '../../shared/timezoneReminders.ts';
// Same wording the refill job uses, so every push names the task.
import { getReminderContent } from '../../shared/reminderTitle.ts';

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

    // Anyone signed in could rescan — cancel and re-book every reminder of —
    // ANY account just by naming its email. Only the app owner (admin) may
    // name someone else; everyone else rescans their own tasks only.
    const isAdmin = user.role === 'admin';
    if (!isAdmin && targetEmail !== String(user.email || '').toLowerCase().trim()) {
      return Response.json({ error: 'You can only rescan your own tasks' }, { status: 403 });
    }

    // Fetch all active tasks for the account
    const tasks = await base44.asServiceRole.entities.Task.filter({
      notification_recipient_email: targetEmail,
      status: 'active'
    }, '-created_date', 200);

    console.log(`[rescanTasks] Found ${tasks.length} active tasks for ${targetEmail}`);

    // Fetch the target user's profile for per-user, timezone-aware quiet hours.
    // schedulePush no longer applies its own (broken) UTC blanket, so the rescan
    // must apply the owner's actual quiet hours — same as cronRefillReminders.
    // (Looked up by email: a plain list() returns only the first 50 users.)
    const owner = targetEmail === String(user.email || '').toLowerCase().trim()
      ? user
      : ((await base44.asServiceRole.entities.User.filter({ email: targetEmail }))?.[0] || null);
    // Quiet hours default to ON (unset used to read as off here); the shared
    // timezone fallback applies when the profile has none.
    const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(owner);
    const timeZone = userTimeZone(owner);
    const useQuiet = quietEnabled;
    console.log(`[rescanTasks] Quiet hours: ${useQuiet ? `enabled (${startMin}-${endMin} min, ${timeZone})` : 'disabled'}`);

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
                classification: task.classification,
                reminderWish: task.reminder_wish || null,
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
                    // "9 AM the day before" is 9 AM on the OWNER'S clock. setHours
                    // on the server's UTC clock made it 9 AM UTC (4 AM Central).
                    reminderTime = localReminderUtc(scheduled, r.days_before || 0, r.hour || 0, r.minute || 0, timeZone);
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
                  const wanted = sendAt.getTime();
                  sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
                  // Skip a night-time reminder that quiet hours pushed onto the
                  // first minute of the morning — the daily digest replaces it.
                  // One that is simply set for that minute is kept.
                  if (sendAt.getTime() !== wanted && localMinutesOfDay(sendAt, timeZone) === endMin) {
                    continue;
                  }
                  if (oneTimeLastScheduledAt && Math.abs(sendAt.getTime() - oneTimeLastScheduledAt.getTime()) < 60000) {
                    continue;
                  }
                }
                const adjustedISO = sendAt.toISOString();
                try {
                  const pushResp = await base44.functions.invoke('schedulePush', {
                    // The caller was checked above (their own tasks, or the app
                    // owner), so this backend vouches for the booking — an
                    // owner rescanning someone else's tasks is not "booking for
                    // someone else" once schedulePush enforces its caller check.
                    internalKey: Deno.env.get('CRON_SECRET'),
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
                  // Same rule as the refill job (placeRepeatingSlot): a night-time
                  // ping of a short rhythm is dropped for the morning digest, a
                  // daily one moves to a daytime slot instead of going silent.
                  const placed = placeRepeatingSlot(sendAt, INTERVAL_MS[newInterval], startMin, endMin, timeZone);
                  if (!placed) {
                    scheduleTime += INTERVAL_MS[newInterval];
                    continue;
                  }
                  sendAt = placed;
                  // Quiet-hours can shift two consecutive night slots onto the same
                  // morning minute — skip duplicates rather than send two at once.
                  if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt.getTime()) < 60000) {
                    scheduleTime += INTERVAL_MS[newInterval];
                    continue;
                  }
                }
                const sendAtISO = sendAt.toISOString();
                const words = getReminderContent(task.title, task.due_date, sendAtISO, timeZone);
                try {
                  const pushResp = await base44.functions.invoke('schedulePush', {
                    internalKey: Deno.env.get('CRON_SECRET'), // caller checked above (see the one-time booking)
                    toUserExternalId: targetEmail,
                    title: words.title,
                    body: words.body,
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
      const ownerRecord = owner;
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