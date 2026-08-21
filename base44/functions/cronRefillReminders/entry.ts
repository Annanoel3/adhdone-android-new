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

    // Tasks with no due date, no event time, and no start date are handled by
    // cronSmartTaskNudge (one intelligent nudge per hour) instead of interval
    // flooding (10+ notifications/day). Skip them here.
    const isSmartNudgeTask = (t: any) =>
      !t.due_date && !t.event_time && !t.start_date &&
      t.classification !== 'birthday' && t.classification !== 'event' &&
      !t.birthday_person && !t.day_only_task;

    const recurringTasks = allTasks.filter(t =>
      t.status === 'active' &&
      t.reminder_interval &&
      t.reminder_interval !== 'once' &&
      intervalMsMap[t.reminder_interval] &&
      t.notification_recipient_email &&  // require explicit email — never fall back to created_by
      !isSmartNudgeTask(t)  // smart nudge cron handles these
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

    // ── Birthday reminders (yearly recurring) ───────────────────────────────────
  // Birthdays recur yearly. This pass:
  //   1. Rolls over any birthday whose day-of has passed → next year, cancelling
  //      old notifications and rebuilding the planned reminder schedule.
  //   2. Rebuilds the planned schedule for any birthday missing one (legacy/orphaned).
  //   3. Promotes planned (scheduled:false) entries to live OneSignal notifications
  //      as they come within the scheduling window (~30 days).
  // Doing the rollover server-side means birthdays advance every year reliably —
  // not just when the user happens to open the Birthdays dialog.
  const BIRTHDAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function birthdayReminderContent(person: string, kind: string, birthdayIso: string) {
    const dateStr = new Date(birthdayIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    switch (kind) {
      case 'week_before':
        return { title: `🎂 ${person}'s birthday is in 1 week`, body: `Don't lose it — ${person}'s birthday is coming up on ${dateStr}. Time to sort a gift or message.`, offsetDays: -7 };
      case 'day_before':
        return { title: `🎂 ${person}'s birthday is tomorrow`, body: `Heads up — ${person}'s birthday is tomorrow (${dateStr}).`, offsetDays: -1 };
      case 'day_of':
        return { title: `🎂 It's ${person}'s birthday today!`, body: `Today is ${person}'s birthday 🎉 Don't forget to reach out.`, offsetDays: 0 };
      default:
        return null;
    }
  }

  function computeNextBirthday(month: number, day: number): Date {
    const c = new Date(now.getFullYear(), month - 1, day, 9, 0, 0, 0);
    if (c <= now) c.setFullYear(c.getFullYear() + 1);
    return c;
  }

  // Build the 3 planned reminder entries for a birthday (mirrors the client scheduler).
  function buildBirthdaySchedule(task: any, birthdayIso: string): any[] {
    const person = task.birthday_person || 'Someone';
    const birthdayDate = new Date(birthdayIso);
    const toggles = {
      week_before: task.birthday_remind_week_before !== false,
      day_before: task.birthday_remind_day_before !== false,
      day_of: task.birthday_remind_day_of !== false,
    };
    const kinds = [
      { key: 'week_before', kind: 'week_before', label: '1 week before' },
      { key: 'day_before', kind: 'day_before', label: '1 day before' },
      { key: 'day_of', kind: 'day_of', label: 'Day of' },
    ];
    const entries: any[] = [];
    for (const { key, kind, label } of kinds) {
      if (!toggles[key]) continue;
      const content = birthdayReminderContent(person, kind, birthdayIso);
      if (!content) continue;
      const sendAt = new Date(birthdayDate.getTime() + content.offsetDays * DAY_MS);
      if (sendAt.getTime() <= now.getTime()) continue;
      entries.push({
        notification_id: `planned_${task.id}_${kind}_${sendAt.getTime()}`,
        send_at: sendAt.toISOString(),
        label,
        kind,
        notification_title: content.title,
        notification_body: content.body,
        scheduled: false,
      });
    }
    return entries;
  }

  async function cancelOneSignalIds(ids: string[]) {
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    await Promise.allSettled(ids.map(id =>
      fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${restApiKey}` },
      })
    ));
  }

  let birthdayScheduled = 0;
  let birthdayRolledOver = 0;
  let birthdayTextReminders = 0;

  const birthdayTasks = allTasks.filter(t =>
    t.status === 'active' &&
    t.birthday_person &&
    t.next_reminder &&
    t.notification_recipient_email
  );

  for (const task of birthdayTasks) {
    let nextReminderIso = task.next_reminder;
    let schedule = Array.isArray(task.reminder_schedule) ? [...task.reminder_schedule] : [];
    let ids = Array.isArray(task.onesignal_notification_ids) ? [...task.onesignal_notification_ids] : [];
    let dirty = false;
    let resetBirthdayText = false;

    // 1. Yearly rollover — birthday day-of has passed
    const birthdayDate = new Date(nextReminderIso);
    const dayAfter = new Date(birthdayDate.getTime() + DAY_MS);
    if (dayAfter <= now) {
      const month = birthdayDate.getMonth() + 1;
      const day = birthdayDate.getDate();
      const nextDate = computeNextBirthday(month, day);
      if (ids.length) await cancelOneSignalIds(ids);
      nextReminderIso = nextDate.toISOString();
      schedule = buildBirthdaySchedule(task, nextReminderIso);
      ids = [];
      dirty = true;
      resetBirthdayText = true;
      birthdayRolledOver++;
      console.log(`🎂 [REFILL] Rolled over "${task.title}" → ${nextDate.toLocaleDateString()}`);
    } else if (schedule.length === 0 && ids.length === 0) {
      // 2. Legacy/orphaned birthday with no plan at all — rebuild it
      schedule = buildBirthdaySchedule(task, nextReminderIso);
      dirty = true;
    }

    // 3. Promote planned entries within the scheduling window
    const newIds: string[] = [];
    for (const entry of schedule) {
      if (entry.scheduled) continue;
      const sendAtMs = new Date(entry.send_at).getTime();
      if (sendAtMs <= now.getTime()) continue;
      if (sendAtMs - now.getTime() > BIRTHDAY_WINDOW_MS) continue;

      // If the user still hasn't drafted a birthday text, repurpose the
      // day-before and day-of reminders into a "write your text" nudge instead
      // of the generic "birthday is tomorrow/today" message. The hourly
      // send-text push and in-app popup are already gated on a drafted
      // message, so this is the only nudge they get when nothing is written.
      let pushTitle = entry.notification_title;
      let pushBody = entry.notification_body;
      if (!task.birthday_text_message && (entry.kind === 'day_before' || entry.kind === 'day_of')) {
        const person = task.birthday_person || 'Someone';
        const dateStr = new Date(nextReminderIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        pushTitle = `🎂 Write a text for ${person}`;
        pushBody = entry.kind === 'day_before'
          ? `It's ${person}'s birthday tomorrow (${dateStr}) — you haven't written a text yet. Tap to draft one now.`
          : `It's ${person}'s birthday today (${dateStr}) — you haven't written a text yet. Tap to draft one now.`;
        entry.notification_title = pushTitle;
        entry.notification_body = pushBody;
      }

      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          toUserExternalId: task.notification_recipient_email,
          title: pushTitle,
          body: pushBody,
          sendAtISO: entry.send_at,
          data: { screen: '/TaskNotification', taskId: task.id, type: 'birthday_reminder' },
        });
        const result = res?.data || res;
        if (result?.notificationId) {
          entry.notification_id = result.notificationId;
          entry.scheduled = true;
          newIds.push(result.notificationId);
          dirty = true;
          birthdayScheduled++;
        }
      } catch (e) {
        console.error(`[REFILL] Birthday schedule failed for ${task.id}:`, e);
      }
    }
    if (newIds.length) ids = [...ids, ...newIds];

    if (dirty) {
      await base44.asServiceRole.entities.Task.update(task.id, {
        next_reminder: nextReminderIso,
        reminder_schedule: schedule,
        onesignal_notification_ids: ids,
        ...(resetBirthdayText ? { birthday_text_sent: false, birthday_text_last_reminded_at: null } : {}),
      });
    }

    // Birthday text reminder — hourly on day-of until the user sends the text.
    // Only fires during waking hours, respects quiet hours, and dedupes via
    // birthday_text_last_reminded_at so the user gets ~1/hour, not 1/cron-run.
    const bdayDate = new Date(nextReminderIso);
    const isDayOf = bdayDate.getFullYear() === now.getFullYear() &&
                    bdayDate.getMonth() === now.getMonth() &&
                    bdayDate.getDate() === now.getDate();
    if (isDayOf && task.birthday_text_message && task.birthday_text_sent !== true) {
      const owner = userMap[task.notification_recipient_email];
      const timeZone = owner?.timezone || null;
      if (timeZone) {
        const localMin = localMinutesOfDay(now, timeZone);
        const quietEnabled = !!(owner && owner.quiet_hours_enabled);
        const qStart = owner?.quiet_hours_start ? parseHHMM(owner.quiet_hours_start) : parseHHMM('22:00');
        const qEnd = owner?.quiet_hours_end ? parseHHMM(owner.quiet_hours_end) : parseHHMM('08:00');
        const inQuiet = quietEnabled && (qStart < qEnd
          ? (localMin >= qStart && localMin < qEnd)
          : (localMin >= qStart || localMin < qEnd));
        const inDefaultSleep = localMin < 8 * 60 || localMin >= 21 * 60;
        const lastRemindedMs = task.birthday_text_last_reminded_at
          ? new Date(task.birthday_text_last_reminded_at).getTime() : 0;
        const dedupMs = 50 * 60 * 1000;
        if (!inQuiet && !inDefaultSleep && (now.getTime() - lastRemindedMs) > dedupMs) {
          try {
            const bAppId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
            const bRestKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
            const playerIds = owner?.onesignal_player_ids || [];
            const pushPayload: any = {
              app_id: bAppId,
              headings: { en: `🎂 Text ${task.birthday_person}!` },
              contents: { en: `It's ${task.birthday_person}'s birthday today — don't forget to send your birthday text!` },
              data: { screen: '/TaskNotification', taskId: task.id, type: 'birthday_text_reminder' },
            };
            if (playerIds.length > 0) {
              pushPayload.include_player_ids = playerIds;
            } else {
              pushPayload.include_external_user_ids = [task.notification_recipient_email];
            }
            const pushRes = await fetch('https://onesignal.com/api/v1/notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${bRestKey}` },
              body: JSON.stringify(pushPayload),
            });
            const pushResult = await pushRes.json();
            if (pushRes.ok && !pushResult.errors) {
              await base44.asServiceRole.entities.Task.update(task.id, {
                birthday_text_last_reminded_at: now.toISOString(),
              });
              birthdayTextReminders++;
              console.log(`🎂 [REFILL] Sent birthday text reminder for "${task.title}"`);
            }
          } catch (e) {
            console.error(`[REFILL] Birthday text push failed for ${task.id}:`, e);
          }
        }
      }
    }
  }

  // ── Scheduled texts (📞) — hourly follow-ups on the day-of until sent ─────────
  // The initial reminder(s) are pre-scheduled via OneSignal at save time (9 AM
  // for day-only, exact time + 10 min for time-specific). This pass sends the
  // hourly follow-ups: once the due time has passed and the text is unsent, it
  // pushes ~once per hour during waking hours, deduped by last_reminded_at.
  let scheduledTextReminders = 0;
  try {
    const allTexts = await base44.asServiceRole.entities.ScheduledText.list('-send_at', 500);
    const dueTexts = allTexts.filter(t =>
      t.sent !== true &&
      t.notification_recipient_email &&
      t.send_at
    );

    for (const text of dueTexts) {
      const due = new Date(text.send_at);
      if (now.getTime() < due.getTime()) continue;          // not due yet
      if (text.snoozed_until && new Date(text.snoozed_until).getTime() > now.getTime()) continue;

      const owner = userMap[text.notification_recipient_email];
      const timeZone = owner?.timezone || null;
      if (!timeZone) continue;                               // can't apply local-time rules

      // Only remind on the same local calendar day as the due time.
      const dueLocalStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(due);
      const nowLocalStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      if (dueLocalStr !== nowLocalStr) continue;

      const localMin = localMinutesOfDay(now, timeZone);
      const quietEnabled = !!(owner && owner.quiet_hours_enabled);
      const qStart = owner?.quiet_hours_start ? parseHHMM(owner.quiet_hours_start) : parseHHMM('22:00');
      const qEnd = owner?.quiet_hours_end ? parseHHMM(owner.quiet_hours_end) : parseHHMM('08:00');
      const inQuiet = quietEnabled && (qStart < qEnd
        ? (localMin >= qStart && localMin < qEnd)
        : (localMin >= qStart || localMin < qEnd));
      const inDefaultSleep = localMin < 8 * 60 || localMin >= 21 * 60;
      if (inQuiet || inDefaultSleep) continue;

      const lastRemindedMs = text.last_reminded_at ? new Date(text.last_reminded_at).getTime() : 0;
      const dedupMs = 50 * 60 * 1000;
      if (now.getTime() - lastRemindedMs < dedupMs) continue;

      try {
        const sAppId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
        const sRestKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
        const playerIds = owner?.onesignal_player_ids || [];
        const pushPayload: any = {
          app_id: sAppId,
          headings: { en: `📞 Time to text ${text.recipient_name}` },
          contents: { en: text.message || `Don't forget to send your text to ${text.recipient_name}.` },
          data: { screen: '/Home', type: 'scheduled_text', scheduledTextId: text.id },
        };
        if (playerIds.length > 0) {
          pushPayload.include_player_ids = playerIds;
        } else {
          pushPayload.include_external_user_ids = [text.notification_recipient_email];
        }
        const pushRes = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${sRestKey}` },
          body: JSON.stringify(pushPayload),
        });
        const pushResult = await pushRes.json();
        if (pushRes.ok && !pushResult.errors) {
          await base44.asServiceRole.entities.ScheduledText.update(text.id, {
            last_reminded_at: now.toISOString(),
          });
          scheduledTextReminders++;
          console.log(`📞 [REFILL] Sent scheduled text reminder for "${text.recipient_name}"`);
        }
      } catch (e) {
        console.error(`[REFILL] Scheduled text push failed for ${text.id}:`, e);
      }
    }
  } catch (e) {
    console.error('[REFILL] Scheduled text pass failed:', e);
  }

  const result = { success: true, totalRecurringTasks: recurringTasks.length, refilled, skipped, staleStopped, birthdayScheduled, birthdayRolledOver, birthdayTextReminders, scheduledTextReminders, at: now.toISOString() };
    console.log('✅ [REFILL] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [REFILL] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});