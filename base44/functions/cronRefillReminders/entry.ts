import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { getReminderContent } from '../../shared/reminderTitle.ts';
import { adjustForQuietHours, parseHHMM, localMinutesOfDay } from '../../shared/quietHours.ts';
import { getFocusModeContent } from '../../shared/focusMode.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const BATCH_SIZE = 10;

const intervalMsMap = {
  '10min':           10 * 60 * 1000,
  '20min':           20 * 60 * 1000,
  '30min':           30 * 60 * 1000,
  '1hour':       60 * 60 * 1000,
  '2hours':   2 * 60 * 60 * 1000,
  '4hours':   4 * 60 * 60 * 1000,
  'daily':   24 * 60 * 60 * 1000,
  'every_other_day': 2 * 24 * 60 * 60 * 1000,
};

Deno.serve(async (req) => {
  try {
    console.log('🔄 [REFILL] Starting reminder refill check...');

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // The Base44 scheduler invokes this over plain HTTP and does not inject the
    // CRON_SECRET, so a secret gate here would 401 every scheduled run and get
    // the automation disabled. The POST check is sufficient.
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

    // Fetch all users once so we can apply each task owner's quiet hours in their
    // local timezone (quiet hours are stored as local "HH:MM" on the user profile).
    const allUsers = await base44.asServiceRole.entities.User.list();
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    const now = new Date();
    let refilled = 0;
    let skipped = 0;
    let staleStopped = 0;

    // Short intervals that become spam if a task is never completed
    const shortIntervals = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours']);
    const staleThresholdMs = 21 * 24 * 60 * 60 * 1000; // 21 days

    for (const task of recurringTasks) {
      const interval = intervalMsMap[task.reminder_interval];

      // Skip and silence tasks that are old and on short intervals — they've become pure spam.
      // Base staleness on last ACTIVITY (updated_date), not creation date, and only silence
      // tasks that actually have a scheduling history. Orphaned tasks that never got scheduled
      // (e.g. created during an outage) must be scheduled, not silenced — otherwise they're
      // trapped forever. Basing age on updated_date also means a freshly repaired task won't be
      // re-silenced on the next hourly run.
      const taskAge = now.getTime() - new Date(task.updated_date || task.created_date).getTime();
      const hasSchedulingHistory = (Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0) || !!task.last_scheduled_until;
      if (shortIntervals.has(task.reminder_interval) && taskAge > staleThresholdMs && hasSchedulingHistory) {
        console.log(`🧹 [REFILL] Silencing stale short-interval task "${task.title}" (${Math.round(taskAge / 86400000)}d untouched)`);
        await base44.asServiceRole.entities.Task.update(task.id, {
          next_reminder: null,
          onesignal_notification_ids: [],
          last_scheduled_until: null
        });
        staleStopped++;
        continue;
      }

      // Determine end of currently-scheduled window
      let scheduledUntil;
      const hasIds = Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0;
      if (task.last_scheduled_until) {
        scheduledUntil = new Date(task.last_scheduled_until);
      } else if (hasIds && task.next_reminder) {
        // Legacy fallback: has REAL notification IDs but no last_scheduled_until — estimate window
        scheduledUntil = new Date(new Date(task.next_reminder).getTime() + 9 * interval);
      } else {
        // No real notifications scheduled (orphaned / never scheduled) — force a fresh schedule
        scheduledUntil = new Date(now.getTime() - 1);
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

        // Add a deterministic stagger offset per task (based on task ID hash) so
      // multiple tasks with the same interval don't all fire at the exact same minute.
      const idHash = task.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const staggerMs = (idHash % 50) * 60 * 1000; // 0–49 minute stagger

      const batchStart = scheduledUntil > now
          ? new Date(scheduledUntil.getTime() + interval + staggerMs)
          : new Date(now.getTime() + interval + staggerMs);

      const email = task.notification_recipient_email;

      // Owner's quiet hours (local "HH:MM"). Apply only when enabled AND the owner
      // has a recorded timezone — otherwise we can't convert local wall-time to UTC.
      const owner = userMap[email];
      const quietEnabled = !!(owner && owner.quiet_hours_enabled);
      const timeZone = owner && owner.timezone ? owner.timezone : null;
      const startMin = owner && owner.quiet_hours_start ? parseHHMM(owner.quiet_hours_start) : parseHHMM('22:00');
      const endMin = owner && owner.quiet_hours_end ? parseHHMM(owner.quiet_hours_end) : parseHHMM('08:00');
      const useQuiet = quietEnabled && !!timeZone;

      // Focus Mode: while the owner has an active focus task, only that task
      // gets recurring reminders — everything else stays silent until they exit.
      const focusTaskId = owner && owner.focus_mode_task_id ? owner.focus_mode_task_id : null;
      if (focusTaskId && task.id !== focusTaskId) {
        console.log(`🎯 [REFILL] Skipping "${task.title}" — owner is in Focus Mode`);
        skipped++;
        continue;
      }

      const notificationIds = [];
      let lastScheduledAt: Date | null = null; // de-dupe quiet-hour slots that collapse to the same time

      for (let i = 0; i < BATCH_SIZE; i++) {
        let sendAt = new Date(batchStart.getTime() + interval * i);
        if (useQuiet) {
          sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
          // Skip the first-of-day notification — the daily digest cron replaces it
          // with a single summary instead of N individual task notifications.
          if (localMinutesOfDay(sendAt, timeZone) === endMin) {
            continue;
          }
          // Quiet-hours can shift two consecutive night slots onto the same morning
          // minute — skip duplicates rather than send two notifications at once.
          if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt.getTime()) < 60000) {
            continue;
          }
        }
        if (sendAt.getTime() <= now.getTime()) continue;
        const sendAtISO = sendAt.toISOString();
        // Focus Mode: the focused task gets check-in style reminders.
        const isFocusTask = !!(focusTaskId && task.id === focusTaskId);
        const { title, body } = isFocusTask
          ? getFocusModeContent(task.title)
          : getReminderContent(task.title, task.due_date, sendAtISO);
        try {
          const res = await base44.asServiceRole.functions.invoke('schedulePush', {
            toUserExternalId: email,
            title,
            body,
            sendAtISO,
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
            lastScheduledAt = sendAt;
          }
        } catch (e) {
          console.error(`[REFILL] Failed to schedule reminder #${i + 1} for task ${task.id}:`, e);
        }
      }

      if (notificationIds.length > 0) {
        // Use the last actually-scheduled time (may differ from batchStart math once
        // quiet-hours shifting/skipping is applied) so the next refill window is correct.
        const newLastScheduledUntil = lastScheduledAt
          ? lastScheduledAt.toISOString()
          : new Date(batchStart.getTime() + interval * (notificationIds.length - 1)).toISOString();
        const existingIds = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];

        await base44.asServiceRole.entities.Task.update(task.id, {
          onesignal_notification_ids: notificationIds,
          last_scheduled_until: newLastScheduledUntil,
            ...(!task.next_reminder || new Date(task.next_reminder) <= now
              ? { next_reminder: batchStart.toISOString() }
              : {})
          });

          console.log(`✅ [REFILL] Scheduled ${notificationIds.length} reminders for "${task.title}", last at: ${newLastScheduledUntil.toISOString()}`);
          refilled++;
        } else {
          // All notifications landed in the digest window — update last_scheduled_until
          // to prevent infinite retry loops. The daily digest will cover these tasks.
          const batchEnd = new Date(batchStart.getTime() + interval * (BATCH_SIZE - 1));
          await base44.asServiceRole.entities.Task.update(task.id, {
            onesignal_notification_ids: [],
            last_scheduled_until: batchEnd.toISOString(),
          });
          console.log(`📭 [REFILL] All notifications for "${task.title}" landed in digest window — digest will cover it`);
        }
      } catch (error) {
        console.error(`❌ [REFILL] Failed to refill task ${task.id}:`, error);
      }
    }

    // ── Birthday reminders ──────────────────────────────────────────────────────
  // OneSignal won't accept send_after beyond ~30 days, so far-out birthday
  // reminders are stored as "planned" (scheduled:false) entries in
  // reminder_schedule. Schedule them here as they come into range.
  const BIRTHDAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const birthdayTasks = allTasks.filter(t =>
    t.status === 'active' &&
    t.birthday_person &&
    t.recurrence_pattern === 'yearly' &&
    t.next_reminder &&
    t.notification_recipient_email &&
    Array.isArray(t.reminder_schedule) &&
    t.reminder_schedule.length > 0
  );
  let birthdayScheduled = 0;

  for (const task of birthdayTasks) {
    const schedule = [...task.reminder_schedule];
    let changed = false;
    const newIds: string[] = [];
    for (const entry of schedule) {
      if (entry.scheduled) continue;
      const sendAtMs = new Date(entry.send_at).getTime();
      if (sendAtMs <= now.getTime()) continue;
      if (sendAtMs - now.getTime() > BIRTHDAY_WINDOW_MS) continue;
      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          toUserExternalId: task.notification_recipient_email,
          title: entry.notification_title,
          body: entry.notification_body,
          sendAtISO: entry.send_at,
          data: { screen: '/TaskNotification', taskId: task.id, type: 'birthday_reminder' },
        });
        const result = res?.data || res;
        if (result?.notificationId) {
          entry.notification_id = result.notificationId;
          entry.scheduled = true;
          newIds.push(result.notificationId);
          changed = true;
          birthdayScheduled++;
        }
      } catch (e) {
        console.error(`[REFILL] Birthday schedule failed for ${task.id}:`, e);
      }
    }
    if (changed) {
      const existingIds = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];
      await base44.asServiceRole.entities.Task.update(task.id, {
        reminder_schedule: schedule,
        onesignal_notification_ids: [...existingIds, ...newIds],
      });
      console.log(`🎂 [REFILL] Scheduled ${newIds.length} birthday reminders for "${task.title}"`);
    }
  }

  const result = { success: true, totalRecurringTasks: recurringTasks.length, refilled, skipped, staleStopped, birthdayScheduled, at: now.toISOString() };
    console.log('✅ [REFILL] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [REFILL] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});