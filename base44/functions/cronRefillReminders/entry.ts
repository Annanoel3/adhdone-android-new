// Re-saved Oct 21 2026 (noon) so the bundled shared/reminderTitle.ts is picked up: alarms at a time they set in the same minute ring in the order alarmOrder.ts judged (alarm_order), each one marked theirTime with the bell.
// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// Re-saved Oct 16 2026 so the bundled shared/reminderTitle.ts is picked up: a daily reminder after its first day reads as a reminder, never "slipped past".
// Re-saved Oct 13 2026 (night) so the bundled shared/reminderTitle.ts is picked up: an appointment's alarm carries "Record notes" as its second button.
// Re-saved Oct 13 2026 (evening) so the bundled shared/reminderTitle.ts is picked up: an event's alarm is marked `event` for the phone (build 42 on shows "Got it" only).
// Re-saved Oct 13 2026 so the bundled shared/reminderTitle.ts and eventReminderPlan.ts are picked up (timed events: alarm at the time, heads-ups as pushes; the at-start entry survives the cap).
// Re-saved Oct 12 2026 (pets) so the bundled shared/reminderTitle.ts is picked up: a pet's birthday alarm has no "Write a text" button.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { getReminderContent, pushPhoneAlarms } from '../../shared/reminderTitle.ts';
import { localMinutesOfDay, resolveQuietHours, anchorToDaytime, placeRepeatingSlot, userTimeZone, localDateKey, rhythmNamedMin, notBeforeNamedTime, isTimeTheySet, isInQuietHours, placeAppReminder, wakeStartMs } from '../../shared/quietHours.ts';
import { getFocusModeContent } from '../../shared/focusMode.ts';
import { ledgerCheck, ledgerRecord, ledgerCancel, ledgerPrune } from '../../shared/sendLedger.ts';
import { listAll, filterAll } from '../../shared/listAll.ts';
import { getHomeOrigin } from '../../shared/homeOrigin.ts';
import { businessHoursLine } from '../../shared/mapsDistance.ts';
import { buildEventReminderPlan, isBookableNow, isBookedId, BOOKABLE_WINDOW_MS } from '../../shared/eventReminderPlan.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');
const BATCH_SIZE = 10;

// Grace window. A task whose creator is still booking its first reminders
// (reminder_scheduling_since set, or simply created moments ago) looks exactly
// like an orphan — no ids yet — and the cron used to book a second batch on top.
// Both markers are timestamps, so a creator that crashed mid-booking only holds
// the cron off for these few minutes, never forever.
const CREATION_GRACE_MS = 10 * 60 * 1000;
const isBeingScheduledElsewhere = (t: any, nowMs: number) => {
  const since = t.reminder_scheduling_since ? new Date(t.reminder_scheduling_since).getTime() : 0;
  const created = t.created_date ? new Date(t.created_date).getTime() : 0;
  return (since && nowMs - since < CREATION_GRACE_MS) || (created && nowMs - created < CREATION_GRACE_MS);
};

// When OneSignal refuses a booking (most often: the user's device is no longer
// subscribed), wait this long before trying that task again. Without it the job
// either claimed the task was "covered" for days (it wasn't) or would re-try
// every run forever and burn function calls.
const RETRY_AFTER_MS = 2 * 60 * 60 * 1000;
const isInRetryBackoff = (t: any, nowMs: number) =>
  !!t.reminder_retry_after && new Date(t.reminder_retry_after).getTime() > nowMs;

// Every task is read once when the run starts, and booking a batch takes a
// while (ten pushes, one after another). A task finished, deleted or moved to
// the Back Burner in the meantime used to get the whole batch anyway — and a
// deleted task's pushes were then tracked nowhere, so nothing could ever cancel
// them. So the task is read again right before booking and again before its
// ids are written. Returns the fresh copy, or null when it no longer wants
// reminders (gone, not active, or silenced).
async function stillWantsReminders(base44: any, taskId: string): Promise<any | null> {
  const fresh = await base44.asServiceRole.entities.Task.get(taskId).catch(() => null);
  if (!fresh || fresh.status !== 'active' || fresh.silenced) return null;
  return fresh;
}

// Takes back pushes this run just booked for a task that no longer wants them.
async function cancelJustBooked(base44: any, ids: string[]) {
  if (!ids.length) return;
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  await Promise.allSettled(ids.map(id =>
    fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${restApiKey}` }
    })
  ));
  await ledgerCancel(base44, ids);
}

// Far-out dated tasks get their reminder plan written here (one schedule-
// generator call each); cap that work per run.
const MAX_PLANS_BUILT_PER_RUN = 10;

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
    // One account only (setFocusMode exit, onTaskUpdate when the focused task
    // is finished): their recurring reminders come back right away instead of
    // at the next hourly run. Only the recurring pass and the Focus Mode
    // check-ins run in that mode.
    const body: any = await req.json().catch(() => ({}));
    const onlyEmail = body && typeof body.onlyEmail === 'string' ? body.onlyEmail.trim() : '';
    if (!onlyEmail) await ledgerPrune(base44);

    // Every profile, once: quiet hours are stored as local "HH:MM" on it, and
    // Focus Mode lives on it. Fetched before the tasks because the pass right
    // below can change tasks.
    const allUsers = await listAll(base44.asServiceRole.entities.User);

    // The two looks below show people's tasks and emails: the owner's
    // account only (Test Function in the editor).
    if (body?.previewRepeats === true || body?.previewHealth === true) {
      const me = await base44.auth.me().catch(() => null);
      if (me?.role !== 'admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    }

    // What the owner health check would tell Anna right now, sending nothing
    // (see ownerHealthCheck).
    if (body?.previewHealth === true) {
      const active = await filterAll(base44.asServiceRole.entities.Task, { status: 'active' });
      const look: any = await ownerHealthCheck(base44, { allUsers, allTasks: active, now: new Date(), dryRun: true });
      return Response.json({ success: true, ...look });
    }

    // A look at what the repeating-task rollover would do right now, changing
    // nothing (see REPEATING TASKS WHOSE DAY IS OVER below).
    if (body?.previewRepeats === true) {
      const users: Record<string, any> = {};
      for (const u of allUsers) if (u && u.email) users[u.email] = u;
      const active = await filterAll(base44.asServiceRole.entities.Task, { status: 'active' });
      const nowMs = Date.now();
      const { rolls, twins } = repeatRollPlan(active, users, nowMs);
      return Response.json({
        success: true,
        rolls: rolls.map(({ task, owner, tz, roll }: any) => {
          const { moved, cancel } = repeatMove(task, owner, tz, roll, nowMs);
          return {
            id: task.id, title: task.title, owner: task.created_by, tz, from: roll.fromKey, to: roll.toKey,
            next_reminder: moved.next_reminder ?? null, due_date: moved.due_date ?? null, event_time: moved.event_time ?? null,
            reminders: moved.reminder_schedule.map((e: any) => `${e.send_at} ${e.label || ''}`.trim()), cancel: cancel.length,
          };
        }),
        twins: twins.map(({ task, twin }: any) => ({ id: task.id, title: task.title, owner: task.created_by, twin: twin.id })),
      });
    }

    // Focus Mode's morning question went unanswered — Anna, Oct 14 2026:
    // "ignored morning ends focus mode". The question goes out at the end of
    // quiet hours (Task.focus_mode_quiet_ask_at); "continue" moves that stamp
    // to the next morning, so a stamp in the past means nobody answered. The
    // session ends through setFocusMode's own exit (the task put back as it
    // was, the other reminders back), and the morning offer stays on the
    // profile so the app still asks when they open it that day. Runs before
    // the task fetch so nothing below books on the session's stale state.
    let focusEnded = 0;
    for (const u of allUsers) {
      if (!u?.email || !u?.focus_mode_task_id) continue;
      if (onlyEmail && u.email !== onlyEmail) continue;
      try {
        const ft = await base44.asServiceRole.entities.Task.get(u.focus_mode_task_id).catch(() => null);
        if (!ft || ft.status !== 'active') continue; // finished: onTaskUpdate ends the session itself
        const askMs = ft.focus_mode_quiet_ask_at ? Date.parse(ft.focus_mode_quiet_ask_at) : 0;
        if (!askMs || askMs > Date.now()) continue;
        await base44.asServiceRole.functions.invoke('setFocusMode', {
          internalKey: CRON_SECRET,
          email: u.email,
          action: 'exit',
          keepOffer: true,
        });
        u.focus_mode_task_id = null; // the passes below read this copy
        focusEnded++;
        console.log(`🌅 [REFILL] Focus Mode ended for ${u.email}: this morning's "pick up where you left off?" went unanswered`);
      } catch (e) {
        console.error(`[REFILL] Could not end the unanswered focus session for ${u.email}:`, e);
      }
    }

    // EVERY active task, paged — not "the 500 most recently updated". Every pass
    // below only ever looks at active tasks.
    const allTasks = onlyEmail
      ? await filterAll(base44.asServiceRole.entities.Task, { status: 'active', notification_recipient_email: onlyEmail })
      : await filterAll(base44.asServiceRole.entities.Task, { status: 'active' });
    console.log(`📦 [REFILL] Active tasks fetched: ${allTasks.length}${onlyEmail ? ` (only ${onlyEmail})` : ''}`);

    // Tasks with no due date, no event time, and no start date are handled by
    // cronSmartTaskNudge (one intelligent nudge per hour) instead of interval
    // flooding (10+ notifications/day). Skip them here.
    const isSmartNudgeTask = (t: any) =>
      !t.due_date && !t.event_time && !t.start_date &&
      t.classification !== 'birthday' && t.classification !== 'event' &&
      !t.birthday_person && !t.day_only_task;

    // Since 2026-09-24 a dateless task with an explicit rhythm ("every hour",
    // "keep reminding me until I finish") is owned HERE, not by the smart-nudge
    // cron: that cron skips every recurring interval, so between the two
    // exclusions nobody was booking those tasks past their first batch. Tasks
    // from before that date keep the old rule, so a long-forgotten hourly task
    // doesn't suddenly start ringing again.
    const RHYTHM_OWNED_SINCE = Date.parse('2026-09-24T00:00:00Z');
    const rhythmOwnedHere = (t: any) => new Date(t.created_date || 0).getTime() >= RHYTHM_OWNED_SINCE;

    const recurringTasks = allTasks.filter(t =>
      t.status === 'active' &&
      !t.silenced &&  // Back Burner: silenced tasks get no notifications
      !t.parent_task_id &&  // steps are a checklist; the parent does the reminding
      t.reminder_interval &&
      t.reminder_interval !== 'once' &&
      intervalMsMap[t.reminder_interval] &&
      t.notification_recipient_email &&  // require explicit email — never fall back to created_by
      (!isSmartNudgeTask(t) || rhythmOwnedHere(t))  // smart nudge cron handles the old dateless ones
    );

    console.log(`📊 [REFILL] Found ${recurringTasks.length} recurring tasks`);

    // Each task owner's quiet hours apply in their local timezone (see allUsers above).
    const userMap: Record<string, any> = {};
    for (const u of allUsers) if (u && u.email) userMap[u.email] = u;

    const now = new Date();
    let refilled = 0;
    let skipped = 0;
    let staleStopped = 0;
    // Owners OneSignal refused during THIS run. If one booking for a user is
    // refused (device not subscribed), every other booking for them would be too
    // — skip the rest of their tasks until the next run instead of asking again.
    const refusedEmails = new Set<string>();

    // Short intervals that become spam if a task is never completed
    const shortIntervals = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours']);
    const staleThresholdMs = 21 * 24 * 60 * 60 * 1000; // 21 days

    for (const task of recurringTasks) {
      const interval = intervalMsMap[task.reminder_interval];

      if (isBeingScheduledElsewhere(task, now.getTime())) {
        console.log(`⏳ [REFILL] Skipping "${task.title}" — created/scheduling within the last few minutes`);
        skipped++;
        continue;
      }

      if (isInRetryBackoff(task, now.getTime()) || refusedEmails.has(task.notification_recipient_email)) {
        skipped++;
        continue;
      }

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
        // Its alarm comes off the phone too, instead of ringing for a reminder that stopped.
        await pushPhoneAlarms({ ...task, next_reminder: null }, userMap[task.created_by] || userMap[task.notification_recipient_email],
          { before: task, changedAt: Date.now(), source: 'cronRefillReminders' });
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

      // Refill when within 2 intervals of the end of the window — and never
      // later than the next run of this hourly job can cover. For a short
      // rhythm ("every 10 minutes") two intervals is 20 minutes: a window that
      // ended 25 minutes after one run was only noticed by the next, 35 minutes
      // past its end, and the restart added up to 49 more minutes of stagger —
      // "every 10 minutes" had holes of 30–90 minutes every couple of hours.
      const refillThreshold = new Date(now.getTime() + Math.max(2 * interval, 75 * 60 * 1000));
      if (scheduledUntil > refillThreshold) {
        skipped++;
        continue;
      }

      console.log(`🔋 [REFILL] Task "${task.title}" (${task.id}) needs refill — scheduled until: ${scheduledUntil.toISOString()}`);

      try {
        // Two cases:
        //  - APPENDING: the booked run still has pushes ahead (a refill fires
        //    when two intervals are left). Those pushes are still wanted, so
        //    they stay live and the new batch goes on after them. This used to
        //    cancel them and start after them anyway, so every refill dropped
        //    the last two reminders of the run: "keep reminding me until I do
        //    it" went quiet at 5 PM with 6 and 7 PM thrown away, and a daily
        //    reminder skipped two days out of every ten.
        //  - STARTING OVER: nothing booked is still ahead, so anything on the
        //    task is already sent (or an orphan) and is cleared as before.
        const oldIds = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];
        const appending = scheduledUntil > now;
        // The still-live pushes from the run being extended stay on the task, so
        // finishing it cancels them too. The newest batch is all that can
        // still be ahead, so older (already sent) ids are let go.
        const keptIds: string[] = appending ? oldIds.slice(-BATCH_SIZE) : [];
        if (oldIds.length > 0 && !appending) {
          const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
          const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
          await Promise.allSettled(oldIds.map(id =>
            fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
              method: 'DELETE',
              headers: { Authorization: `Basic ${restApiKey}` }
            })
          ));
          await ledgerCancel(base44, oldIds);
          console.log(`🗑 [REFILL] Cancelled ${oldIds.length} old notifications for "${task.title}"`);
        }

        // Add a deterministic stagger offset per task (based on task ID hash) so
      // multiple tasks with the same interval don't all fire at the exact same minute.
      const idHash = task.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const staggerMs = (idHash % 50) * 60 * 1000; // 0–49 minute stagger

      // Extending a run keeps its rhythm: the next one is one interval after
      // the last booked one. The stagger is only for a run starting from
      // scratch; adding it again on every refill pushed an hourly reminder
      // later and later (7:00, then 8:17, …).
      let batchStart = appending
          ? new Date(scheduledUntil.getTime() + interval)
          : new Date(now.getTime() + interval + staggerMs);
      // A schedule starting from scratch whose task already knows when it wants
      // to begin (tomorrow's "pills at 10", made when today's was checked off)
      // starts THERE, not an interval from now — or it would nag overnight
      // about something that isn't due until morning.
      if (scheduledUntil <= now && task.next_reminder) {
        const wanted = new Date(task.next_reminder);
        if (!isNaN(wanted.getTime()) && wanted.getTime() > batchStart.getTime()) {
          batchStart = wanted;
        }
      }
      // A daily (or every-other-day) rhythm starting over keeps its time of
      // day: the next slot on its own clock (next_reminder plus whole
      // intervals), not "a day from now" plus the stagger. Oct 16 2026: a 9 AM
      // daily reminder rebuilt from scratch at 4:02 PM was booked for 4:46 PM
      // every day.
      if (!appending && interval >= 24 * 60 * 60 * 1000 && task.next_reminder) {
        const anchor = new Date(task.next_reminder).getTime();
        if (Number.isFinite(anchor)) {
          let t = anchor;
          if (t <= now.getTime()) t += Math.ceil((now.getTime() - t + 1) / interval) * interval;
          batchStart = new Date(t);
        }
      }
      // They tapped Later on this task's alarm: the app cancelled the pings
      // inside the break and moved next_reminder to its end. Whatever else is
      // computed above, nothing is booked before the break ends.
      const breakUntil = task.later_until ? new Date(task.later_until) : null;
      if (breakUntil && !isNaN(breakUntil.getTime()) && breakUntil.getTime() > batchStart.getTime()) {
        batchStart = breakUntil;
      }

      const email = task.notification_recipient_email;

      // Owner's quiet hours (local "HH:MM"), read in the owner's timezone (the
      // shared fallback when none is saved — without one this used to skip
      // quiet hours and the daytime anchor entirely).
      // Quiet hours default to ON — a profile that never touched the setting is
      // silenced overnight, not left wide open (that's how daily reminders ended
      // up firing at 3 AM local for new users).
      const owner = userMap[email];
      const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(owner);
      const timeZone = userTimeZone(owner);
      // "Keep reminding me until I mark it complete" + a yes to running through
      // the night (Task.quiet_hours_exempt): no quiet window for this one.
      const useQuiet = quietEnabled && task.quiet_hours_exempt !== true;
      // ...and on a phone set to full-screen reminders, each of its pings rings
      // as an alarm on arrival (the phone's own alarm only covers the first).
      const ringsEachTime = task.quiet_hours_exempt === true &&
        (task.alert_style === 'alarm' || (task.alert_style !== 'notification' && owner?.alarm_mode === 'alarm'));

      // RULES.md hard rule 3. A schedule that is starting from scratch (a task the
      // server created, or one whose bookings had lapsed) takes its time of day
      // from "now" — so a daily task first booked at 2:57 AM stayed at 2:57 AM
      // forever. Pin that first slot to a daytime hour. Only for reminders that
      // repeat at the same time of day, and never for a task that already has a
      // running schedule — that one keeps the time it has.
      // A time they set themselves stays where they put it, quiet hours or not
      // (RULES.md §9 Q4: "every day at 6 AM" rings at 6).
      if (interval >= 24 * 60 * 60 * 1000 && scheduledUntil <= now && !isTimeTheySet(task, batchStart.getTime(), timeZone)) {
        batchStart = anchorToDaytime(batchStart, startMin, endMin, timeZone);
      }

      // Focus Mode: while the owner has an active focus task, only that task
      // gets recurring reminders — everything else stays silent until they exit.
      const focusTaskId = owner && owner.focus_mode_task_id ? owner.focus_mode_task_id : null;
      if (focusTaskId && task.id !== focusTaskId) {
        console.log(`🎯 [REFILL] Skipping "${task.title}" — owner is in Focus Mode`);
        skipped++;
        continue;
      }

      // Finished, deleted or back-burnered since the run started? Book nothing.
      // (A changed rhythm is left to onTaskUpdate, which re-books it itself.)
      const current = await stillWantsReminders(base44, task.id);
      if (!current || current.reminder_interval !== task.reminder_interval) {
        console.log(`⏭ [REFILL] Skipping "${task.title}" — finished, deleted, silenced or changed since this run started`);
        skipped++;
        continue;
      }

      // A repeating task's rhythm never pings before the time they named
      // (see rhythmNamedMin): those slots are left out.
      const namedMin = rhythmNamedMin(task, interval);

      const notificationIds = [];
      let lastScheduledAt: Date | null = null; // de-dupe quiet-hour slots that collapse to the same time
      let rejected = false; // OneSignal refused a booking — not the same as "the digest covers it"

      for (let i = 0; i < BATCH_SIZE; i++) {
        let sendAt = new Date(batchStart.getTime() + interval * i);
        // The slot at the time they set themselves goes out at that time, quiet
        // hours or not (RULES.md §9 Q4); every other slot follows quiet hours.
        if (useQuiet && !isTimeTheySet(task, sendAt.getTime(), timeZone)) {
          // A night-time ping of a short rhythm is dropped (the morning digest
          // replaces it); a daily one moves to a daytime slot instead of being
          // dropped. See placeRepeatingSlot — dropping every slot that landed
          // on the minute quiet hours end silenced daily rhythms for good.
          const placed = placeRepeatingSlot(sendAt, interval, startMin, endMin, timeZone);
          if (!placed) continue;
          sendAt = placed;
          // Two slots can still land on the same minute — skip the duplicate
          // rather than send two notifications at once.
          if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt.getTime()) < 60000) {
            continue;
          }
        }
        // The named-time floor keeps a 9 PM chore from pinging all morning — but
        // one the user asked to run through the night keeps going past midnight.
        if (namedMin !== null && task.quiet_hours_exempt !== true && notBeforeNamedTime(sendAt, namedMin, timeZone).getTime() !== sendAt.getTime()) continue;
        if (sendAt.getTime() <= now.getTime()) continue;
        const sendAtISO = sendAt.toISOString();
        // Focus Mode: the focused task gets check-in style reminders.
        const isFocusTask = !!(focusTaskId && task.id === focusTaskId);
        const { title, body } = isFocusTask
          ? getFocusModeContent(task.title)
          : getReminderContent(task.title, task.due_date, sendAtISO, timeZone, task.reminder_interval);
        try {
          const res = await base44.asServiceRole.functions.invoke('schedulePush', {
            internalKey: CRON_SECRET, // proves this call comes from the app's own backend
            toUserExternalId: email,
            title,
            body,
            sendAtISO,
            data: {
              screen: '/TaskNotification',
              taskId: task.id,
              urgency: task.urgency || 'medium',
              type: 'task_reminder',
              ...(ringsEachTime ? { alarm: true } : {})
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
          } else if (result && result.success === false) {
            // Refused outright. The other nine would be refused too — stop here.
            console.warn(`[REFILL] OneSignal refused a reminder for "${task.title}": ${result.error || 'unknown error'}`);
            rejected = true;
            break;
          }
        } catch (e) {
          console.error(`[REFILL] Failed to schedule reminder #${i + 1} for task ${task.id}:`, e);
          rejected = true;
          break;
        }
      }

      // Read the task again before writing anything: finished, deleted or
      // back-burnered while the batch was being booked means the batch is
      // taken back here, since no one else knows these ids exist.
      const fresh = await stillWantsReminders(base44, task.id);
      if (!fresh) {
        await cancelJustBooked(base44, notificationIds);
        console.log(`↩️ [REFILL] "${task.title}" was finished, deleted or silenced mid-refill — cancelled the ${notificationIds.length} push(es) just booked`);
        skipped++;
        continue;
      }

      if (notificationIds.length > 0) {
        // Use the last actually-scheduled time (may differ from batchStart math once
        // quiet-hours shifting/skipping is applied) so the next refill window is correct.
        const newLastScheduledUntil = lastScheduledAt
          ? lastScheduledAt.toISOString()
          : new Date(batchStart.getTime() + interval * (notificationIds.length - 1)).toISOString();

        // Reconcile before overwriting: if anything else booked ids on this
        // task while we were working (the creator's fire-and-forget landing
        // late), cancel those pushes rather than silently drop the ids and
        // leave them live and untracked.
        const freshIds: string[] = Array.isArray(fresh?.onesignal_notification_ids) ? fresh.onesignal_notification_ids : [];
        const foreign = freshIds.filter(id => !oldIds.includes(id) && !notificationIds.includes(id));
        if (foreign.length > 0) {
          const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
          const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
          await Promise.allSettled(foreign.map(id =>
            fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
              method: 'DELETE',
              headers: { Authorization: `Basic ${restApiKey}` }
            })
          ));
          await ledgerCancel(base44, foreign);
          console.log(`🧹 [REFILL] Cancelled ${foreign.length} push(es) another writer booked on "${task.title}" mid-refill`);
        }

        await base44.asServiceRole.entities.Task.update(task.id, {
          onesignal_notification_ids: [...keptIds.filter(id => !notificationIds.includes(id)), ...notificationIds],
          last_scheduled_until: newLastScheduledUntil,
          reminder_retry_after: null,
            ...(!task.next_reminder || new Date(task.next_reminder) <= now
              ? { next_reminder: batchStart.toISOString() }
              : {})
          });
        // A new next reminder: the phone's alarm moves to it now, not at the next app open.
        if (!task.next_reminder || new Date(task.next_reminder) <= now) {
          await pushPhoneAlarms({ ...task, next_reminder: batchStart.toISOString() }, userMap[task.created_by] || owner,
            { before: task, changedAt: Date.now(), source: 'cronRefillReminders' });
        }

          // newLastScheduledUntil is ALREADY an ISO string — calling .toISOString()
          // on it threw a TypeError here, which the catch below swallowed as
          // "Failed to refill", so `refilled` never incremented and every real
          // refill was reported as a failure. Do not re-add the conversion.
          console.log(`✅ [REFILL] Scheduled ${notificationIds.length} reminders for "${task.title}", last at: ${newLastScheduledUntil}`);
          refilled++;
        } else if (rejected) {
          // Nothing was booked because OneSignal refused it. Nothing is "covered".
          // Leave last_scheduled_until alone and try again after the backoff.
          refusedEmails.add(task.notification_recipient_email);
          await base44.asServiceRole.entities.Task.update(task.id, {
            // The pushes already booked ahead stay live, so they stay tracked.
            onesignal_notification_ids: keptIds,
            reminder_retry_after: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
          });
          console.warn(`📵 [REFILL] Could not book "${task.title}" — will retry after ${new Date(now.getTime() + RETRY_AFTER_MS).toISOString()}`);
        } else {
          // All notifications landed in the digest window — update last_scheduled_until
          // to prevent infinite retry loops. The daily digest will cover these tasks.
          const batchEnd = new Date(batchStart.getTime() + interval * (BATCH_SIZE - 1));
          await base44.asServiceRole.entities.Task.update(task.id, {
            // The pushes already booked ahead stay live, so they stay tracked.
            onesignal_notification_ids: keptIds,
            last_scheduled_until: batchEnd.toISOString(),
          });
          console.log(`📭 [REFILL] All notifications for "${task.title}" landed in digest window — digest will cover it`);
        }
      } catch (error) {
        console.error(`❌ [REFILL] Failed to refill task ${task.id}:`, error);
      }
    }

    // ── Focus Mode check-ins, until the task is done ─────────────────────────
    // setFocusMode books the first six hourly "how's it going?" check-ins. A
    // recurring focus task then carries on through the pass above (its rhythm
    // is 1hour for the session). A one-time or smart-reminder focus task has
    // no rhythm, so after six hours it went quiet while still in focus. Anna,
    // Oct 13 2026: "remind the user of whatever task they are focusing on once
    // an hour until done". When the last booked check-in is under two hours
    // out, the next six go on — hourly, never inside the owner's quiet hours.
    let focusCheckins = 0;
    for (const owner of allUsers) {
      const focusId = owner?.focus_mode_task_id;
      if (!focusId || !owner?.email) continue;
      if (onlyEmail && owner.email !== onlyEmail) continue;
      const task = allTasks.find((t: any) => t.id === focusId);
      if (!task || task.status !== 'active') continue;
      if (task.reminder_interval && task.reminder_interval !== 'once' && intervalMsMap[task.reminder_interval]) continue; // the pass above keeps this one going
      const H = 60 * 60 * 1000;
      const untilMs = task.focus_mode_checkins_until ? new Date(task.focus_mode_checkins_until).getTime() : 0;
      if (untilMs > now.getTime() + 2 * H) continue;
      try {
        const { enabled: fqEnabled, startMin: fqStart, endMin: fqEnd } = resolveQuietHours(owner);
        const tz = userTimeZone(owner);
        // A task that runs through quiet hours anyway keeps its night slots;
        // otherwise a slot inside quiet hours is dropped — quiet hours just
        // start, and the morning question (setFocusMode) picks the session
        // back up at their end.
        const throughQuiet = task.quiet_hours_exempt === true;
        const slots: Date[] = [];
        let t = Math.max(untilMs, now.getTime()) + H;
        for (let i = 0; i < 6; i++, t += H) {
          const sendAt = new Date(t);
          if (fqEnabled && !throughQuiet && isInQuietHours(sendAt, fqStart, fqEnd, tz)) continue;
          if (sendAt.getTime() <= now.getTime()) continue;
          slots.push(sendAt);
        }
        if (!slots.length) continue;
        const { title, body } = getFocusModeContent(task.title);
        const ids: string[] = [];
        let lastAt: Date | null = null;
        for (const sendAt of slots) {
          const res = await base44.asServiceRole.functions.invoke('schedulePush', {
            internalKey: CRON_SECRET,
            toUserExternalId: owner.email,
            title,
            body,
            sendAtISO: sendAt.toISOString(),
            data: { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency || 'medium', type: 'task_reminder', focus: true },
            buttons: [
              { id: 'snooze_15', text: 'Snooze 15 min' },
              { id: 'snooze_60', text: 'Snooze 1 hour' },
              { id: 'complete', text: '✅ Done' }
            ]
          });
          const r = res?.data || res;
          if (r?.notificationId) { ids.push(String(r.notificationId)); lastAt = sendAt; }
          else if (r && r.success === false) break;
        }
        if (!ids.length) continue;
        // Still in focus on this task? (The run takes a while.)
        const fresh = await base44.asServiceRole.entities.Task.get(task.id).catch(() => null);
        const ownerNow = await base44.asServiceRole.entities.User.get(owner.id).catch(() => null);
        if (!fresh || fresh.status !== 'active' || !ownerNow || ownerNow.focus_mode_task_id !== task.id) {
          await cancelJustBooked(base44, ids);
          continue;
        }
        await base44.asServiceRole.entities.Task.update(task.id, {
          focus_mode_notification_ids: [...(Array.isArray(fresh.focus_mode_notification_ids) ? fresh.focus_mode_notification_ids : []), ...ids],
          focus_mode_checkins_until: (lastAt || slots[slots.length - 1]).toISOString(),
        });
        focusCheckins += ids.length;
        console.log(`🎯 [REFILL] Booked ${ids.length} more Focus Mode check-ins for "${task.title}" (${owner.email}), last at ${(lastAt || slots[slots.length - 1]).toISOString()}`);
      } catch (e) {
        console.error(`[REFILL] Focus Mode check-ins failed for ${owner.email}:`, e);
      }
    }

    if (onlyEmail) {
      const scoped = { success: true, onlyEmail, refilled, skipped, focusCheckins, focusEnded, at: now.toISOString() };
      console.log('✅ [REFILL] Complete (one account):', scoped);
      return Response.json(scoped);
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

  function birthdayReminderContent(person: string, kind: string, birthdayIso: string, animal?: string | null) {
    const dateStr = new Date(birthdayIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    // A pet's birthday (birthday_animal): the same three reminders, never a
    // word about a text (Anna, Oct 12 2026). Same words as birthdayScheduler.jsx.
    if (animal) {
      switch (kind) {
        case 'week_before':
          return { title: `🎂 ${person}'s birthday is in 1 week`, body: `${person}'s birthday is coming up on ${dateStr}.`, offsetDays: -7 };
        case 'day_before':
          return { title: `🎂 ${person}'s birthday is tomorrow`, body: `Heads up: ${person}'s birthday is tomorrow (${dateStr}).`, offsetDays: -1 };
        case 'day_of':
          return { title: `🎂 It's ${person}'s birthday today!`, body: `Don't forget to celebrate ${person}'s birthday today!`, offsetDays: 0 };
        default:
          return null;
      }
    }
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
  function buildBirthdaySchedule(task: any, birthdayIso: string, ownerName?: string): any[] {
    const person = task.birthday_person || 'Someone';
    const birthdayDate = new Date(birthdayIso);

    // The user's OWN birthday isn't a "reach out to them" reminder — it's a
    // celebration. One message, on the day, greeting them by name.
    if (task.is_own_birthday || !task.birthday_person) {
      const firstName = (ownerName || '').trim().split(/\s+/)[0];
      if (birthdayDate.getTime() <= now.getTime()) return [];
      return [{
        notification_id: `planned_${task.id}_own_day_of_${birthdayDate.getTime()}`,
        send_at: birthdayDate.toISOString(),
        label: 'Day of',
        kind: 'own_day_of',
        notification_title: firstName ? `🎂 Happy Birthday, ${firstName}!` : '🎂 Happy Birthday!',
        notification_body: firstName
          ? `It's your day, ${firstName} 🎉 Take it easy on yourself today — you've earned it.`
          : `It's your day 🎉 Take it easy on yourself today — you've earned it.`,
        scheduled: false,
      }];
    }
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
      const content = birthdayReminderContent(person, kind, birthdayIso, task.birthday_animal);
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
    await ledgerCancel(base44, ids);
  }

  let birthdayScheduled = 0;
  let birthdayRolledOver = 0;
  let birthdayTextReminders = 0;

  const birthdayTasks = allTasks.filter(t =>
    t.status === 'active' &&
    (t.birthday_person || t.is_own_birthday || t.classification === 'birthday') &&
    t.next_reminder &&
    t.notification_recipient_email
  );

  for (const task of birthdayTasks) {
    const ownerName = userMap[task.notification_recipient_email]?.full_name || '';
    const isOwn = !!task.is_own_birthday || !task.birthday_person;
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
      // Keep the birthday's existing time-of-day on rollover instead of
      // re-anchoring to the server's 9 AM (which is 9 AM UTC = pre-dawn local).
      const nextDate = new Date(birthdayDate);
      nextDate.setFullYear(birthdayDate.getFullYear() + 1);
      if (ids.length) await cancelOneSignalIds(ids);
      nextReminderIso = nextDate.toISOString();
      schedule = buildBirthdaySchedule(task, nextReminderIso, ownerName);
      ids = [];
      dirty = true;
      resetBirthdayText = true;
      birthdayRolledOver++;
      console.log(`🎂 [REFILL] Rolled over "${task.title}" → ${nextDate.toLocaleDateString()}`);
    } else if (schedule.length === 0 && ids.length === 0) {
      // 2. Legacy/orphaned birthday with no plan at all — rebuild it
      schedule = buildBirthdaySchedule(task, nextReminderIso, ownerName);
      dirty = true;
    } else if (isOwn && !schedule.every((e: any) => String(e.notification_title || '').includes('Happy Birthday'))) {
      // Own birthday that was previously planned as a generic event ("night
      // before" / "1 hour before" with no name) — replace with the greeting.
      // The reconcile step below cancels the old bookings.
      // Detected by the message itself, NOT by `kind`: kind wasn't persisted on
      // the entity, so it came back undefined on every run and this branch
      // rebuilt + re-booked + cancelled the same reminder once per cron run,
      // filling OneSignal with hundreds of cancelled notifications.
      schedule = buildBirthdaySchedule(task, nextReminderIso, ownerName);
      dirty = true;
    }

    // 3. Promote planned entries within the scheduling window
    const newIds: string[] = [];
    for (const entry of schedule) {
      // Already booked with a real OneSignal notification. Do NOT trust
      // entry.scheduled — that flag isn't in the Task schema, so it's stripped
      // on save and always comes back undefined, which previously caused this
      // pass to re-book the same 3 reminders on every single cron run
      // (thousands of duplicate pushes). The notification_id IS persisted:
      // planned entries carry a `planned_…` placeholder, booked ones carry the
      // real OneSignal id, so that's the reliable signal.
      if (entry.notification_id && !String(entry.notification_id).startsWith('planned_')) continue;
      let sendAtMs = new Date(entry.send_at).getTime();
      if (sendAtMs <= now.getTime()) continue;
      if (sendAtMs - now.getTime() > BIRTHDAY_WINDOW_MS) continue;
      // Planned at 9 AM, which is the middle of the night for someone who
      // sleeps days: inside the owner's quiet hours it waits until they end
      // (Oct 12 2026; schedulePush applies no quiet hours of its own).
      {
        const bOwner = userMap[task.notification_recipient_email];
        const placed = placeAppReminder(sendAtMs, null, resolveQuietHours(bOwner), userTimeZone(bOwner));
        if (placed != null && placed !== sendAtMs) {
          sendAtMs = placed;
          entry.send_at = new Date(placed).toISOString();
          dirty = true;
        }
      }

      // If the user still hasn't drafted a birthday text, repurpose the
      // day-before and day-of reminders into a "write your text" nudge instead
      // of the generic "birthday is tomorrow/today" message. The hourly
      // send-text push and in-app popup are already gated on a drafted
      // message, so this is the only nudge they get when nothing is written.
      let pushTitle = entry.notification_title;
      let pushBody = entry.notification_body;
      if (!isOwn && !task.birthday_animal && !task.birthday_text_message && (entry.kind === 'week_before' || entry.kind === 'day_before' || entry.kind === 'day_of')) {
        const person = task.birthday_person || 'Someone';
        const dateStr = new Date(nextReminderIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        pushTitle = `🎂 Write a text for ${person}`;
        pushBody = entry.kind === 'week_before'
          ? `${person}'s birthday is in a week (${dateStr}) and you haven't written a text yet. Tap to draft one now.`
          : entry.kind === 'day_before'
          ? `It's ${person}'s birthday tomorrow (${dateStr}) — you haven't written a text yet. Tap to draft one now.`
          : `It's ${person}'s birthday today (${dateStr}) — you haven't written a text yet. Tap to draft one now.`;
        entry.notification_title = pushTitle;
        entry.notification_body = pushBody;
      }

      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: CRON_SECRET,
          toUserExternalId: task.notification_recipient_email,
          title: pushTitle,
          body: pushBody,
          sendAtISO: entry.send_at,
          data: { screen: '/TaskNotification', taskId: task.id, type: 'birthday_reminder' },
        });
        const result = res?.data || res;
        if (result?.notificationId) {
          entry.notification_id = result.notificationId;
          // The minute it really went at (a heads-up moved off another push's minute).
          if (typeof result.sendAt === 'string' && result.sendAt) entry.send_at = result.sendAt;
          entry.scheduled = true;
          delete entry.book_error;
          newIds.push(result.notificationId);
          dirty = true;
          birthdayScheduled++;
        } else {
          // Not booked. Say why on the entry itself (visible in the Task
          // table), so a reminder that keeps failing isn't a silent mystery.
          const why = String(result?.reason || result?.error || JSON.stringify(result || {})).slice(0, 300);
          if (entry.book_error !== why) { entry.book_error = why; dirty = true; }
          console.warn(`[REFILL] Birthday reminder not booked for ${task.id}: ${why}`);
        }
      } catch (e) {
        console.error(`[REFILL] Birthday schedule failed for ${task.id}:`, e);
        const why = String(e?.message || e).slice(0, 300);
        if (entry.book_error !== why) { entry.book_error = why; dirty = true; }
      }
    }
    // Reconcile, never append. The id list used to grow by up to 3 every time a
    // promotion ran, so ids the schedule no longer references stayed "tracked"
    // forever — 150+ live OneSignal notifications for ONE birthday, all firing
    // on the same day, with nothing left pointing at them to cancel them.
    // The schedule is the single source of truth: anything booked that the
    // schedule doesn't reference is an orphan and gets cancelled here.
    {
      const liveIds = schedule
        .map((e: any) => e.notification_id)
        .filter((id: any) => id && !String(id).startsWith('planned_'));
      const orphans = ids.filter((id: string) => !liveIds.includes(id));
      if (orphans.length) {
        await cancelOneSignalIds(orphans);
        console.log(`🧹 [REFILL] Cancelled ${orphans.length} orphaned birthday notification(s) for "${task.title}"`);
        dirty = true;
      }
      if (orphans.length || newIds.length) ids = liveIds;
    }

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
    // "Is it the birthday today?" is asked on the owner's calendar. It used to
    // compare dates on the server's UTC clock, where a US evening is already
    // the next day — so the "text them today" pushes started the evening
    // BEFORE the birthday and stopped at dinner time on the day itself.
    const bdayDate = new Date(nextReminderIso);
    const owner = userMap[task.notification_recipient_email];
    const timeZone = userTimeZone(owner);
    const isDayOf = localDateKey(bdayDate, timeZone) === localDateKey(now, timeZone);
    // Never for a pet's birthday: there is no text (Oct 12 2026).
    if (isDayOf && !isOwn && !task.birthday_animal && task.birthday_text_sent !== true) {
      const localMin = localMinutesOfDay(now, timeZone);
      const { enabled: quietEnabled, startMin: qStart, endMin: qEnd } = resolveQuietHours(owner);
      const inQuiet = quietEnabled && (qStart < qEnd
        ? (localMin >= qStart && localMin < qEnd)
        : (localMin >= qStart || localMin < qEnd));
      // Their own night (the quiet-hours times, even with the switch off), not
      // a fixed 9 PM to 8 AM, which is daytime for someone who works nights.
      const inDefaultSleep = isInQuietHours(now, qStart, qEnd, timeZone);
      const lastRemindedMs = task.birthday_text_last_reminded_at
        ? new Date(task.birthday_text_last_reminded_at).getTime() : 0;
      const dedupMs = 50 * 60 * 1000;
      const bdayGate = (!inQuiet && !inDefaultSleep && (now.getTime() - lastRemindedMs) > dedupMs)
        ? await ledgerCheck(base44, { email: task.notification_recipient_email, taskId: task.id, kind: 'birthday_text_reminder' })
        : { allowed: false };
      if (bdayGate.allowed) {
        try {
          const bAppId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
          const bRestKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
          const pushPayload: any = {
            app_id: bAppId,
            headings: { en: task.birthday_text_message ? `🎂 Text ${task.birthday_person}!` : `🎂 Write a text for ${task.birthday_person}` },
            contents: { en: task.birthday_text_message
              ? `It's ${task.birthday_person}'s birthday today — don't forget to send your birthday text!`
              : `It's ${task.birthday_person}'s birthday today and you haven't written a text yet. Tap to draft one now.` },
            data: { screen: '/TaskNotification', taskId: task.id, type: 'birthday_text_reminder' },
          };
          // Sent live (no booked time for an alarm to mirror), so on accounts
          // that chose full-screen reminders the push asks the phone to ring
          // it on arrival, with these same words.
          if (owner?.alarm_mode === 'alarm') {
            pushPayload.data.alarm = true;
            // OneSignal re-delivers recent pushes each time the app starts
            // fresh ("restore"), and the phone rang this again on every app
            // open for the push's 3-day default lifetime. Ten minutes: it is
            // never restored after that, and the next hourly one follows.
            pushPayload.ttl = 10 * 60;
            // The alarm's big button says what this is for (1.3.9+).
            pushPayload.data.openLabel = task.birthday_text_message ? 'Send a text' : 'Write a text';
          }
          // HARD RULE: external id (email) only. Never player ids.
          pushPayload.include_external_user_ids = [task.notification_recipient_email];
          const pushRes = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${bRestKey}` },
            body: JSON.stringify(pushPayload),
          });
          const pushResult = await pushRes.json();
          if (pushRes.ok && !pushResult.errors) {
            await ledgerRecord(base44, { email: task.notification_recipient_email, taskId: task.id, kind: 'birthday_text_reminder', source: 'cronRefillReminders', notificationId: pushResult.id, title: pushPayload.headings.en });
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

  // ── REPEATING TASKS WHOSE DAY IS OVER: on to the next day ───────────────
  // Anna, Oct 17 2026: "once a recurring task passes the point of being due,
  // just erase it and reschedule it for the next day". A repeating task only
  // moved on when its copy was checked off (the app makes the next copy
  // then), so a day it wasn't checked off left that copy sitting there with
  // nothing booked after it: "Clean the litter box" (every day at 9 PM) was
  // last checked off Wednesday Oct 14, rang Thursday at 9, then had no 9 PM
  // reminder Friday or Saturday, and Smart Reminders filled in at 9:09.
  // Repeating events never moved on at all (an event isn't checked off).
  //
  // So once a copy's day is over on their clock (4 AM, see
  // REPEAT_DAY_ENDS_MS), a task that repeats again the very next day (every
  // day, weekdays Monday to Thursday, Saturday into Sunday) or a repeating
  // event has that day wiped from it and is put on its next day. A task with
  // a gap before its next day (weekly, monthly, Friday to Monday) stays until
  // checked off (see repeatRollFor, Anna's later words). Wiped
  // means what a fresh copy starts with: that day's snoozes, Laters,
  // rang-out counts and booked pushes go; the words, notes, pictures and
  // settings stay. Its reminders move to the same times on the new day (the
  // promotion pass below books them, in this same run) and the phone gets
  // the new alarm. The record itself moves on, like the birthday rollover
  // above: a copy made by the server wouldn't belong to them.
  let repeatsRolled = 0;
  {
    const { rolls, twins } = repeatRollPlan(allTasks, userMap, now.getTime());
    for (const t of twins) {
      console.log(`🔁 [REFILL] "${t.task.title}" (${t.task.created_by}) left as is: another copy (${t.twin.id}) is already on that day or later`);
    }
    for (const { task, owner, tz, roll } of rolls) {
      try {
        // Read again right before the change: checked off or changed since
        // the run started, it's left for the next run to look at again.
        const fresh = await base44.asServiceRole.entities.Task.get(task.id).catch(() => null);
        if (!fresh || fresh.status !== 'active' || fresh.silenced || trackerMs(fresh.updated_date) !== trackerMs(task.updated_date)) {
          console.log(`🔁 [REFILL] "${task.title}" (${task.created_by}) changed during this run; looked at again next run`);
          continue;
        }
        const { moved, cancel } = repeatMove(fresh, owner, tz, roll, Date.now());
        await base44.asServiceRole.entities.Task.update(task.id, moved);
        if (cancel.length) await cancelJustBooked(base44, cancel);
        Object.assign(task, moved); // so the promotion pass below books its reminders this run
        await pushPhoneAlarms({ ...fresh, ...moved }, owner, { before: fresh, changedAt: Date.now(), source: 'cronRefillReminders' });
        repeatsRolled++;
        console.log(`🔁 [REFILL] "${task.title}" (${task.created_by}): ${roll.fromKey} wasn't checked off, moved on to ${roll.toKey} (${moved.reminder_schedule.length} reminder(s) to book)`);
      } catch (e) {
        console.error(`[REFILL] Could not move "${task.title}" (${task.id}) on to its next day:`, e);
      }
    }
  }

  // ── Event tasks (📅) — promote planned reminders within OneSignal's window ──
  // Events with classification='event' store a deterministic reminder schedule
  // (night before + 1 hour before) but OneSignal rejects scheduling more than
  // ~30 days out. This pass promotes unscheduled entries to live notifications
  // as the event date approaches, mirroring the birthday promotion logic.
  let eventScheduled = 0;
  // Covers classification='event' AND any one-time ('once') task with a planned
  // schedule (payments, deadlines with a specific date but no classification) —
  // they all use the same planned-entry promotion mechanics. Birthdays with a
  // birthday_person are handled by the birthday pass above, so exclude them.
  const datedTasks = allTasks.filter(t =>
    t.status === 'active' &&
    !t.silenced &&
    !t.parent_task_id &&  // steps never get their own pushes
    !t.birthday_person &&
    !t.is_own_birthday &&
    t.classification !== 'birthday' &&
    (t.classification === 'event' || t.reminder_interval === 'once') &&
    t.notification_recipient_email
  );

  // ── Far-out dated tasks: write the plan the app could not ───────────────────
  // OneSignal refuses anything more than ~30 days ahead. So a one-time task or
  // event created further out than that (in the app, by capture, or by calendar
  // import) had every reminder refused, was left with no plan and nothing
  // booked, and this pass — which only reads plans — never saw it again. It got
  // no reminder at all.
  //
  // The rule is deliberately narrow, because an EMPTY plan is also what the app
  // saves when the user removes every reminder from a task themselves, and that
  // choice must stand:
  //   • only a task whose date is still beyond the bookable window — nothing
  //     could have been booked for it yet, so there was nothing to remove;
  //   • only once per task — reminder_plan_built_at records that the server has
  //     written its plan, so a plan the user clears later is never rebuilt;
  //   • never a repeating task (those carry no lead-time plan).
  // Entries are written PLANNED (placeholder ids). The promotion loop below is
  // the only thing that books, and only inside the window. Nothing is booked early.
  let plansBuilt = 0;
  for (const task of datedTasks) {
    if (plansBuilt >= MAX_PLANS_BUILT_PER_RUN) break;
    if (task.reminder_plan_built_at) continue;
    if (task.recurrence_pattern && task.recurrence_pattern !== 'none') continue;
    const hasPlan = Array.isArray(task.reminder_schedule) && task.reminder_schedule.length > 0;
    const hasIds = Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0;
    if (hasPlan || hasIds) continue;
    if (!task.next_reminder) continue;
    if (new Date(task.next_reminder).getTime() - now.getTime() <= BOOKABLE_WINDOW_MS) continue;
    if (isBeingScheduledElsewhere(task, now.getTime()) || isInRetryBackoff(task, now.getTime())) continue;

    // Only an event gets a plan. Any other task is Smart Reminders', with ONE
    // reminder at its own time when it has one (Anna, Oct 12 2026: "It's
    // literally just supposed to be smart reminders and events and birthdays
    // ... and tasks that the user gave a specific time to").
    if (task.classification !== 'event') {
      const plan = atItsOwnTimeEntry(task, userMap[task.notification_recipient_email]);
      await base44.asServiceRole.entities.Task.update(task.id, {
        ...(plan ? { reminder_schedule: [plan] } : {}),
        reminder_plan_built_at: now.toISOString(),
      }).catch(() => {});
      if (plan) task.reminder_schedule = [plan];
      continue;
    }

    plansBuilt++;
    try {
      const owner = userMap[task.notification_recipient_email];
      const timeZone = owner && owner.timezone ? owner.timezone : null;
      const res = await base44.asServiceRole.functions.invoke('generateReminderSchedule', {
        title: task.title,
        scheduledDateISO: task.next_reminder,
        urgency: task.urgency,
        dayOnly: !!task.day_only_task,
        // No clock time: the day before and the morning of (Oct 12 2026).
        noClockTime: !task.event_time,
        classification: task.classification || 'event',
        deadlineStyle: task.deadline_style,
        timezone: timeZone || undefined,
        // Same inputs the calendar import and quick capture pass, so a far-out
        // task at a real place gets the same drive-time "leave now" reminder.
        location: task.location || '',
        homeOrigin: getHomeOrigin(owner),
        avoidTolls: owner?.commute_avoid_tolls === true,
        reminderWish: task.reminder_wish || null,
        canRecord: owner?.notes_can_record === true,
      });
      const data = res?.data || res || {};
      const plan = buildEventReminderPlan({
        taskId: task.id,
        rawReminders: data.reminders || [],
        eventStartISO: task.next_reminder,
        title: task.title,
        // A calendar import with no event_time is an all-day item (9 AM anchor).
        isAllDay: !!task.day_only_task || (!task.event_time && task.classification === 'event'),
        isEvent: task.classification === 'event',
        timeZone,
        // Nothing the app picked lands in their quiet hours; the start itself,
        // when it's a time they set, may (RULES.md §9 Q4).
        quiet: task.quiet_hours_exempt === true ? undefined : resolveQuietHours(owner),
        startIsTheirs: isTimeTheySet(task, new Date(task.next_reminder).getTime(), userTimeZone(owner)),
      });
      if (plan.length > 0) {
        await base44.asServiceRole.entities.Task.update(task.id, {
          reminder_schedule: plan,
          reminder_plan_built_at: now.toISOString(),
        });
        // The plan's reminders replace the single one the phone held as an alarm.
        await pushPhoneAlarms({ ...task, reminder_schedule: plan }, userMap[task.created_by] || owner,
          { before: task, changedAt: Date.now(), source: 'cronRefillReminders' });
        task.reminder_schedule = plan; // so the promotion loop below sees it this run
        console.log(`🗓 [REFILL] Built a reminder plan for "${task.title}" (${plan.length} entr${plan.length === 1 ? 'y' : 'ies'})`);
      }
    } catch (e) {
      console.error(`[REFILL] Could not build a reminder plan for ${task.id}:`, e);
      await base44.asServiceRole.entities.Task.update(task.id, {
        reminder_retry_after: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
      }).catch(() => {});
    }
  }

  // ── Abandoned bookings: the app closed before it could book ──────────────
  // The app books a new task's reminders in the background right after saving
  // it, marking the task with reminder_scheduling_since while it does. Closed
  // a few seconds after adding a task, the booking never happens: the marker
  // stays, and the task has no plan and no push. Nothing noticed — the
  // far-out pass above only covers dates beyond the booking window (Tabitha,
  // Oct 7 2026: "Feed obi pan kenobi after work tonight", added 11:28 AM; its
  // 6 PM reminder was never booked and a smart nudge covered it 39 minutes
  // late). So a task still carrying the marker past the grace window, with
  // nothing booked and its time still ahead, gets the one reminder at its
  // time here — a repeating task too (one reminder at its time is exactly
  // what each copy of a repeat gets; the next copy books its own when this
  // one is checked off). A "by" deadline is left to the smart nudges, as
  // everywhere else. A plan the person cleared themselves never looks like
  // this: clearing goes through commitNotificationIds, which drops the marker.
  let rescued = 0;
  for (const task of datedTasks) {
    if (rescued >= MAX_PLANS_BUILT_PER_RUN) break;
    if (!task.reminder_scheduling_since) continue;
    if (isBeingScheduledElsewhere(task, now.getTime()) || isInRetryBackoff(task, now.getTime())) continue;
    if (task.deadline_style === 'by') continue;
    // A task with no time of its own (all day) gets no "📅 due today" push:
    // Smart Reminders has it (Anna, Oct 12 2026).
    if (task.classification !== 'event' && !hasItsOwnTime(task)) continue;
    const hasPlan = Array.isArray(task.reminder_schedule) && task.reminder_schedule.length > 0;
    const hasIds = Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0;
    if (hasPlan || hasIds) continue;
    const atMs = task.next_reminder ? new Date(task.next_reminder).getTime() : NaN;
    if (!Number.isFinite(atMs) || atMs <= now.getTime() + 2 * 60 * 1000) continue;
    if (atMs - now.getTime() > BOOKABLE_WINDOW_MS) continue;
    rescued++;
    const owner = userMap[task.notification_recipient_email];
    const timeZone = userTimeZone(owner);
    const full = (task.title || '').trim() || 'your task';
    const short = full.length > 40 ? `${full.slice(0, 37)}...` : full;
    const words = task.day_only_task
      ? getReminderContent(task.title, task.due_date, task.next_reminder, timeZone)
      : { title: `🔔 ${short}`, body: `It's time — "${short}". You've got this! 💪` };
    try {
      const res = await base44.asServiceRole.functions.invoke('schedulePush', {
        internalKey: CRON_SECRET,
        toUserExternalId: task.notification_recipient_email,
        title: words.title,
        body: words.body,
        sendAtISO: task.next_reminder,
        data: { screen: '/TaskNotification', taskId: task.id, urgency: task.urgency || 'medium', type: 'task_reminder' },
        buttons: [
          { id: 'snooze_15', text: 'Snooze 15 min' },
          { id: 'snooze_60', text: 'Snooze 1 hour' },
          { id: 'complete', text: '✅ Done' },
        ],
      });
      const result = res?.data || res;
      if (result?.notificationId) {
        // schedulePush rewrites the plain words in the brief's voice
        // (shared/reminderTitle.ts, atTimeWords); the ones that went out are the ones saved.
        const said = result.words?.title && result.words?.body ? result.words : words;
        const entry = { notification_id: result.notificationId, send_at: task.next_reminder, label: 'at the time', notification_title: said.title, notification_body: said.body };
        await base44.asServiceRole.entities.Task.update(task.id, {
          onesignal_notification_ids: [result.notificationId],
          reminder_schedule: [entry],
          reminder_plan_built_at: now.toISOString(),
          reminder_scheduling_since: null,
        });
        await pushPhoneAlarms({ ...task, onesignal_notification_ids: [result.notificationId], reminder_schedule: [entry] }, owner,
          { before: task, changedAt: Date.now(), source: 'cronRefillReminders' });
        console.log(`🩹 [REFILL] Booked the reminder the app never got to for "${task.title}" at ${task.next_reminder}`);
      } else {
        await base44.asServiceRole.entities.Task.update(task.id, {
          reminder_retry_after: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
        }).catch(() => {});
      }
    } catch (e) {
      console.error(`[REFILL] Could not book the abandoned reminder for ${task.id}:`, e);
    }
  }

  const eventTasks = datedTasks.filter(t =>
    Array.isArray(t.reminder_schedule) && t.reminder_schedule.length > 0
  );
  // Soonest first, and stop well inside the function's time limit. A big first
  // calendar import can leave hundreds of planned entries; whatever is not
  // booked this run is picked up by the next one, an hour later.
  eventTasks.sort((a, b) => new Date(a.next_reminder || 0).getTime() - new Date(b.next_reminder || 0).getTime());
  const EVENT_PASS_BUDGET_MS = 3 * 60 * 1000;

  for (const task of eventTasks) {
    if (Date.now() - now.getTime() > EVENT_PASS_BUDGET_MS) {
      console.warn('[REFILL] Event pass reached its time budget — the rest will be booked next run');
      break;
    }
    if (isBeingScheduledElsewhere(task, now.getTime()) || isInRetryBackoff(task, now.getTime())) continue;
    if (refusedEmails.has(task.notification_recipient_email)) continue;
    // Nothing inside the booking window yet? Nothing to do (and no need to
    // read the task again).
    // A task that isn't an event books only its reminder at its own time, or
    // one they added themselves. The rest of an old AI plan (heads-ups, "📅
    // due today") stays unbooked: that is Smart Reminders' now (Anna, Oct 12 2026).
    const bookable = (t: any, e: any) => t.classification === 'event' || e?.their_time === true
      || (hasItsOwnTime(t) && Math.abs(new Date(e?.send_at).getTime() - new Date(t.next_reminder).getTime()) < 60 * 1000);
    const hasDue = task.reminder_schedule.some((e: any) =>
      !isBookedId(e?.notification_id) && isBookableNow(e?.send_at, now.getTime()) && bookable(task, e));
    if (!hasDue) continue;
    // Read the task again right before booking, and book from that copy:
    // finished, deleted or back-burnered since the run started gets nothing,
    // and a plan the user edited meanwhile isn't overwritten with the old one.
    const current = await stillWantsReminders(base44, task.id);
    if (!current || !Array.isArray(current.reminder_schedule) || current.reminder_schedule.length === 0) continue;
    const schedule = current.reminder_schedule.map((e: any) => ({ ...e }));
    const ids = Array.isArray(current.onesignal_notification_ids) ? [...current.onesignal_notification_ids] : [];
    let dirty = false;
    const newIds: string[] = [];

    let eventRejected = false;
    for (const entry of schedule) {
      // Skip entries already booked with a real OneSignal id. A missing id OR a
      // `planned_…` placeholder both mean "not booked yet" (the birthday pass
      // already reads it this way; this pass used to skip placeholders forever).
      if (isBookedId(entry.notification_id)) continue;

      // Only inside OneSignal's window, never in the past. Nothing is booked early.
      if (!isBookableNow(entry.send_at, now.getTime())) continue;
      if (!bookable(current, entry)) continue;
      const isEventTask = current.classification === 'event';

      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: CRON_SECRET,
          toUserExternalId: task.notification_recipient_email,
          title: entry.notification_title || task.title,
          body: entry.notification_body || task.title,
          sendAtISO: entry.send_at,
          // A task's reminder carries a task's buttons (Done, Snooze), not an event's.
          data: { screen: '/TaskNotification', taskId: task.id, type: isEventTask ? 'event_reminder' : 'task_reminder' },
          ...(isEventTask ? {} : { buttons: [
            { id: 'snooze_15', text: 'Snooze 15 min' },
            { id: 'snooze_60', text: 'Snooze 1 hour' },
            { id: 'complete', text: '✅ Done' },
          ] }),
        });
        const result = res?.data || res;
        if (result?.notificationId) {
          entry.notification_id = result.notificationId;
          // The minute it really went at (a heads-up moved off another push's minute).
          if (typeof result.sendAt === 'string' && result.sendAt) entry.send_at = result.sendAt;
          entry.scheduled = true;
          // The reminder at its own time goes out in the brief's words
          // (schedulePush, shared/reminderTitle.ts): saved, so the alarm matches.
          if (result.words?.title && result.words?.body) {
            entry.notification_title = result.words.title;
            entry.notification_body = result.words.body;
          }
          newIds.push(result.notificationId);
          dirty = true;
          eventScheduled++;
        } else if (result && result.success === false) {
          console.warn(`[REFILL] OneSignal refused an event reminder for "${task.title}": ${result.error || 'unknown error'}`);
          eventRejected = true;
          break;
        }
      } catch (e) {
        console.error(`[REFILL] Event schedule failed for ${task.id}:`, e);
        eventRejected = true;
        break;
      }
    }

    if (eventRejected) {
      refusedEmails.add(task.notification_recipient_email);
      // Same rule as recurring tasks: don't hammer OneSignal every run for a
      // device that can't be reached. Anything booked above is still saved below.
      await base44.asServiceRole.entities.Task.update(task.id, {
        reminder_retry_after: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(),
      }).catch(() => {});
    }

    if (dirty) {
      // Finished, deleted or back-burnered while these were being booked:
      // take them back — nothing else knows these ids exist.
      const fresh = await stillWantsReminders(base44, task.id);
      if (!fresh) {
        await cancelJustBooked(base44, newIds);
        console.log(`↩️ [REFILL] "${task.title}" was finished, deleted or silenced mid-booking — cancelled ${newIds.length} event push(es) just booked`);
        continue;
      }
      // Same reconcile-not-append rule as the birthday pass: the schedule owns
      // the id list, and anything booked that it no longer references is
      // cancelled instead of left running untracked.
      const liveIds = schedule
        .map((e: any) => e.notification_id)
        .filter((id: any) => id && !String(id).startsWith('planned_'));
      const orphans = ids.filter((id: string) => !liveIds.includes(id));
      if (orphans.length) {
        await cancelOneSignalIds(orphans);
        console.log(`🧹 [REFILL] Cancelled ${orphans.length} orphaned event notification(s) for "${task.title}"`);
      }
      await base44.asServiceRole.entities.Task.update(task.id, {
        reminder_schedule: schedule,
        onesignal_notification_ids: liveIds,
      });
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
      const { enabled: quietEnabled, startMin: qStart, endMin: qEnd } = resolveQuietHours(owner);
      const inQuiet = quietEnabled && (qStart < qEnd
        ? (localMin >= qStart && localMin < qEnd)
        : (localMin >= qStart || localMin < qEnd));
      // Their own night (the quiet-hours times, even with the switch off), not
      // a fixed 9 PM to 8 AM, which is daytime for someone who works nights.
      const inDefaultSleep = isInQuietHours(now, qStart, qEnd, timeZone);
      if (inQuiet || inDefaultSleep) continue;

      const lastRemindedMs = text.last_reminded_at ? new Date(text.last_reminded_at).getTime() : 0;
      const dedupMs = 50 * 60 * 1000;
      if (now.getTime() - lastRemindedMs < dedupMs) continue;

      const textGate = await ledgerCheck(base44, { email: text.notification_recipient_email, taskId: text.id, kind: 'scheduled_text' });
      if (!textGate.allowed) continue;

      try {
        const sAppId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
        const sRestKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
        const pushPayload: any = {
          app_id: sAppId,
          headings: { en: `📞 Time to text ${text.recipient_name}` },
          contents: { en: text.message || `Don't forget to send your text to ${text.recipient_name}.` },
          data: { screen: '/Home', type: 'scheduled_text', scheduledTextId: text.id },
        };
        // HARD RULE: external id (email) only. Never player ids.
        pushPayload.include_external_user_ids = [text.notification_recipient_email];
        const pushRes = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${sRestKey}` },
          body: JSON.stringify(pushPayload),
        });
        const pushResult = await pushRes.json();
        if (pushRes.ok && !pushResult.errors) {
          await ledgerRecord(base44, { email: text.notification_recipient_email, taskId: text.id, kind: 'scheduled_text', source: 'cronRefillReminders', notificationId: pushResult.id, title: pushPayload.headings.en });
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

  // Tracker reminders: Parking Lot entries they log to, with "remind me to
  // log" every day, once a week or once a month (Anna, Oct 12 2026). The app
  // books the next one when it's set; this books each one after that once it
  // is within a day, so they keep coming with the app closed. A tap opens the
  // log (OneSignalInit, type tracker_reminder).
  let trackerBooked = 0;
  try {
    const trackers = await filterAll(base44.asServiceRole.entities.ParkingLotIdea, { tracker: true });
    const ownerOf: Record<string, any> = {};
    for (const u of allUsers) if (u?.email) ownerOf[String(u.email).toLowerCase()] = u;
    const nowMs = now.getTime();
    for (const t of trackers) {
      if (!['daily', 'weekly', 'monthly'].includes(t.tracker_remind) || t.converted_to_task) continue;
      const owner = ownerOf[String(t.created_by || '').toLowerCase()];
      if (!owner?.email) continue;
      const bookedMs = trackerMs(t.tracker_next_at);
      if (t.tracker_notification_id && Number.isFinite(bookedMs) && bookedMs > nowMs) continue;
      const next = trackerNextAt(t.tracker_remind, t.tracker_remind_time, t.tracker_remind_day, nowMs, userTimeZone(owner));
      if (next == null) continue;
      const nextIso = new Date(next).toISOString();
      if (next - nowMs > TRACKER_BOOK_AHEAD_MS) {
        if (t.tracker_notification_id || trackerMs(t.tracker_next_at) !== next) {
          await base44.asServiceRole.entities.ParkingLotIdea.update(t.id, { tracker_next_at: nextIso, tracker_notification_id: null }).catch(() => {});
        }
        continue;
      }
      try {
        const res = await base44.asServiceRole.functions.invoke('schedulePush', {
          internalKey: CRON_SECRET,
          toUserExternalId: owner.email,
          title: `📝 Time to log: ${String(t.idea || '').slice(0, 80)}`,
          body: 'Tap to add an entry.',
          sendAtISO: nextIso,
          data: { type: 'tracker_reminder', idea_id: t.id, screen: '/ParkingLot' },
        });
        const id = (res?.data || res)?.notificationId;
        if (id) {
          await base44.asServiceRole.entities.ParkingLotIdea.update(t.id, { tracker_next_at: nextIso, tracker_notification_id: id });
          trackerBooked++;
        }
      } catch (e) {
        console.error(`[REFILL] Tracker reminder not booked for ${t.id}:`, e);
      }
    }
    if (trackerBooked) console.log(`📝 [REFILL] Booked ${trackerBooked} tracker reminder(s)`);
  } catch (e) {
    console.error('[REFILL] Tracker reminder pass failed:', e);
  }

  // Two live pushes booked for the same task at the same minute. Oct 16 2026:
  // Tabitha's "Trash to the Curb" for Sunday 8 PM was booked twice, 94 ms
  // apart, the moment last week's copy was checked off, and the task only knew
  // about one of them, so checking it off early would still have left the
  // other to go off. The push the task keeps stays and the other is cancelled
  // (with neither on the task, the first booked stays). Pushes the task itself
  // lists are never touched, and nothing is done for a push that isn't for a
  // task (a scheduled text). Lived in Duplicate Watch for an hour, but that
  // workflow has been switched off since Sep 24 2026; this job runs hourly.
  try {
    const ahead = await filterAll(base44.asServiceRole.entities.NotificationLedger, { send_at: { $gt: now.toISOString() } });
    const byPush: Record<string, any[]> = {};
    for (const e of ahead || []) {
      if (!e?.task_id || !e?.notification_id) continue;
      const k = `${e.user_email}||${e.task_id}||${String(e.send_at).slice(0, 16)}`;
      (byPush[k] ||= []).push(e);
    }
    let secondPushes = 0;
    for (const group of Object.values(byPush)) {
      const ids = [...new Set(group
        .sort((a: any, b: any) => String(a.created_date || '').localeCompare(String(b.created_date || '')))
        .map((e: any) => e.notification_id))] as string[];
      if (ids.length < 2) continue;
      const task = await base44.asServiceRole.entities.Task.get(group[0].task_id).catch(() => null);
      if (!task) continue;
      const tracked = new Set<string>([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map((s: any) => s?.notification_id)),
        ...(task.focus_mode_notification_ids || []),
        task.follow_up_notification_id,
      ].filter(Boolean));
      const keep = ids.find((id) => tracked.has(id)) || ids[0];
      const extra = ids.filter((id) => id !== keep && !tracked.has(id));
      if (!extra.length) continue;
      await cancelJustBooked(base44, extra);
      secondPushes += extra.length;
      console.log(`🧹 [REFILL] Cancelled ${extra.length} second push(es) for "${task.title}" (${group[0].user_email}) at ${group[0].send_at}`);
    }
    if (secondPushes) console.log(`🧹 [REFILL] Second pushes cancelled: ${secondPushes}`);
  } catch (e) {
    console.error('[REFILL] Second-push check failed:', e);
  }

  // The owner health check (see ownerHealthCheck below). Never fails the run.
  try {
    await ownerHealthCheck(base44, { allUsers, allTasks, now });
  } catch (e) {
    console.error("[HEALTH] check failed:", e);
  }

  const result = { success: true, totalRecurringTasks: recurringTasks.length, refilled, skipped, staleStopped, focusCheckins, focusEnded, birthdayScheduled, birthdayRolledOver, birthdayTextReminders, repeatsRolled, eventScheduled, scheduledTextReminders, at: now.toISOString() };
    console.log('✅ [REFILL] Complete:', result);
    return Response.json(result);
  } catch (err) {
    console.error('❌ [REFILL] Fatal:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
});

// ── Owner health check ──────────────────────────────────────────────────────
// Runs at the end of every refill (hourly): a few cheap questions about
// whether the app is working for real people, and a push to the owner's phone
// when the answer is no. Anna, Oct 9 2026, after an OpenAI billing lapse took
// every AI call down for five hours with nobody told, and two first-time
// users' captures went wrong with nothing flagging it: "we can't just let bugs
// get created like this." Each alert repeats at most every ALERT_COOLDOWN_MS
// while the problem lasts. A daily note goes out in the owner's 8 o'clock
// hour, and only when something was off in the last 24 hours. Her own
// accounts (README) are never "real users" here.
const OWNER_ALERT_EMAIL = 's2kap2chick@gmail.com'; // the owner's phone account
const OWNER_TZ = 'America/Chicago';
const OWNER_ACCOUNTS = new Set([
  'annanoelwenballew@gmail.com', 'annanoelbusinessemail@gmail.com', 's2kap2chick@gmail.com',
  'mediocreatbestdev@outlook.com', 'annanoelwenballew@outlook.com',
]);
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const H_HOUR = 60 * 60 * 1000;
const H_DAY = 24 * H_HOUR;

// ── Tracker reminders (Parking Lot entries they log to) ─────────────────────
const TRACKER_BOOK_AHEAD_MS = 26 * 60 * 60 * 1000;

function trackerMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

// Their timezone's offset from UTC, in minutes, at an instant.
function trackerOffsetMin(ms: number, timeZone: string): number {
  const [y, mo, d] = localDateKey(new Date(ms), timeZone).split('-').map(Number);
  const local = Date.UTC(y, mo - 1, d) + localMinutesOfDay(new Date(ms), timeZone) * 60000;
  return Math.round((local - Math.floor(ms / 60000) * 60000) / 60000);
}

// The next reminder after `afterMs`, on their own clock. Weekly: `day` is 0
// (Sunday) to 6. Monthly: 1 to 31; a short month uses its last day. Same rule
// as nextTrackerAt in ParkingLot.jsx.
function trackerNextAt(remind: string, hhmm: string, day: any, afterMs: number, timeZone: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m || !['daily', 'weekly', 'monthly'].includes(remind)) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  const [y0, mo0, d0] = localDateKey(new Date(afterMs), timeZone).split('-').map(Number);
  for (let i = 0; i < 400; i++) {
    const date = new Date(Date.UTC(y0, mo0 - 1, d0 + i));
    const y = date.getUTCFullYear();
    const mo = date.getUTCMonth();
    const d = date.getUTCDate();
    if (remind === 'weekly' && date.getUTCDay() !== (Number(day) || 0)) continue;
    if (remind === 'monthly') {
      const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      if (d !== Math.min(Math.max(1, Number(day) || 1), last)) continue;
    }
    // That wall-clock time in their timezone, as an instant.
    const asUtc = Date.UTC(y, mo, d, 0, minutes);
    let at = asUtc - trackerOffsetMin(asUtc, timeZone) * 60000;
    at = asUtc - trackerOffsetMin(at, timeZone) * 60000;
    if (at > afterMs) return at;
  }
  return null;
}

function localHourIn(tz: string, d: Date): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
  } catch (_) {
    return d.getUTCHours();
  }
}

// Captures that were typed but never became a task: a 'captureClaimed' whose
// last part was never made (see below) within 15 minutes, and not claimed
// again since (a resume shows up as a later claim of the same text).
async function stalledCaptures(base44: any, sinceMs: number, nowMs: number): Promise<{ email: string; text: string; atMs: number }[]> {
  const rows = await filterAll(base44.asServiceRole.entities.CaptureTrace, { created_date: { $gte: new Date(sinceMs).toISOString() } });
  const sorted = rows.slice().sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date)));
  const out: { email: string; text: string; atMs: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.step !== 'captureClaimed') continue;
    let detail: any = {};
    try { detail = JSON.parse(r.detail || '{}'); } catch (_) { /* plain text */ }
    const text = String(detail.text || '');
    const atMs = Date.parse(String(r.created_date).endsWith('Z') ? r.created_date : `${r.created_date}Z`) || 0;
    if (!atMs || nowMs - atMs < 15 * 60 * 1000) continue; // still in progress
    const later = sorted.slice(i + 1).filter((x: any) => x.user_email === r.user_email);
    const soonAfter = (x: any) => (Date.parse(String(x.created_date).endsWith('Z') ? x.created_date : `${x.created_date}Z`) || 0) - atMs < 15 * 60 * 1000;
    // How many parts the capture was split into (one when it never said).
    let partCount = 1;
    const split = later.find((x: any) => x.step === 'splitResult' && soonAfter(x));
    try { partCount = Math.max(1, Number(JSON.parse(split?.detail || '{}').count) || 1); } catch (_) { /* one */ }
    const finishedStep = later.some((x: any) => soonAfter(x) && (x.step === 'mainCreate' || x.step === 'captureAlreadyCreated' || x.step === 'captureServerDone'));
    const claimedAgain = later.some((x: any) => x.step === 'captureClaimed' && String(x.detail || '').includes(text.slice(0, 40)));
    if (claimedAgain) continue;
    // One part: any "made" step is the whole capture made. Several parts:
    // the first part being made says nothing about the last (Oct 14 2026:
    // four appointments, two made, two left) — that is settled below.
    if (finishedStep && partCount === 1) continue;
    // Made under the app's id — by the app (a part made through a question
    // never logs a step), or by the server when the app went off screen
    // (TaskCaptureProcessor, since Oct 13 2026; the app may never have said
    // so). Since Oct 14 2026 each part carries its own id, <capture>#<part>:
    // the last part made means the capture finished.
    const captureId = String(detail.id || '');
    if (captureId) {
      // Several parts: the last part's own id, or the whole capture under the
      // app's id (handed over before it was split; the server split it).
      const ids = partCount > 1 ? [`${captureId}#${partCount - 1}`, captureId] : [captureId, `${captureId}#0`];
      let made = false;
      for (const id of ids) {
        const [tasks, ideas] = await Promise.all([
          base44.asServiceRole.entities.Task.filter({ capture_id: id }).catch(() => []),
          base44.asServiceRole.entities.ParkingLotIdea.filter({ capture_id: id }).catch(() => []),
        ]);
        if ((tasks || []).length || (ideas || []).length) { made = true; break; }
      }
      if (made) continue;
    } else if (finishedStep) {
      continue; // an older app with no capture id: the step is all there is
    }
    out.push({ email: r.user_email, text, atMs });
  }
  return out;
}

async function sentToOwner(base44: any, kind: string, title: string | null, sinceMs: number): Promise<boolean> {
  const rows = await filterAll(base44.asServiceRole.entities.NotificationLedger, {
    user_email: OWNER_ALERT_EMAIL, kind, send_at: { $gte: new Date(sinceMs).toISOString() },
  });
  return rows.some((r: any) => title === null || r.title === title);
}

async function pushOwner(base44: any, kind: string, title: string, body: string): Promise<void> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !key) return;
  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Basic ${key}` },
    body: JSON.stringify({
      app_id: appId,
      include_external_user_ids: [OWNER_ALERT_EMAIL],
      channel_for_external_user_ids: 'push',
      headings: { en: title },
      contents: { en: body },
      priority: 10,
      data: { screen: '/Home', type: kind },
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (res.ok && !j.errors) {
    await ledgerRecord(base44, { email: OWNER_ALERT_EMAIL, kind, source: 'cronRefillReminders', notificationId: j.id, title });
  } else {
    console.error('[HEALTH] owner push failed:', JSON.stringify(j).slice(0, 200));
  }
}

async function ownerHealthCheck(base44: any, ctx: { allUsers: any[]; allTasks: any[]; now: Date; dryRun?: boolean }): Promise<any> {
  const { allUsers, allTasks, now } = ctx;
  const nowMs = now.getTime();
  // sinceMs: told once since then (checks 9-11, about one person), instead of
  // again every ALERT_COOLDOWN_MS.
  const problems: { title: string; body: string; sinceMs?: number }[] = [];
  const realUser = (email: string) => !!email && !OWNER_ACCOUNTS.has(email);
  const activeLately = (u: any) => nowMs - (Date.parse(u?.last_active_at || '') || 0) < 7 * H_DAY;
  const userByEmail: Record<string, any> = {};
  for (const u of allUsers) if (u?.email) userByEmail[u.email] = u;

  // 1. Can the app reach OpenAI? One tiny completion. A 429 here is the "no
  //    credits" that silently broke every AI feature on Oct 8 2026.
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      // gpt-6-luna, the cheaper model: this only proves the key and its credit
      // work, which is the same for every model (Anna, Oct 18 2026: "switch whatever wont be negatively affected to the cheaper one").
      // Room for its thinking: a cut-off answer is still a 200.
      body: JSON.stringify({ model: 'gpt-6-luna', reasoning_effort: 'low', max_completion_tokens: 200, messages: [{ role: 'user', content: 'ok' }] }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      const msg = String(err?.error?.message || res.statusText || '').slice(0, 140);
      problems.push({ title: '🚨 ADHDone: AI calls are failing', body: `OpenAI answered ${res.status}. ${msg} Smart Reminders, task parsing and steps are down until this is fixed.` });
    }
  } catch (e) {
    problems.push({ title: '🚨 ADHDone: AI calls are failing', body: `OpenAI could not be reached: ${String((e as any)?.message || e).slice(0, 120)}` });
  }

  // 1b. Is Smart Reminders running at all? It runs every 10 minutes and marks
  //     the owner's editor account when it finishes (smart_nudge_cron_ran_at).
  //     Oct 16 2026: Base44 failed to start the 9:49 AM run and then started
  //     none until 12:09 PM, while the workflow read "active" with no failures
  //     and every other scheduled job kept going. The only alert was check 2
  //     naming the one person whose plan went stale first. No mark yet (before
  //     the first run that writes one): nothing to compare.
  let nudgeStopped = false;
  {
    const ranMs = Date.parse(userByEmail['annanoelwenballew@gmail.com']?.smart_nudge_cron_ran_at || '');
    if (Number.isFinite(ranMs) && nowMs - ranMs > 40 * 60 * 1000) {
      nudgeStopped = true;
      const when = new Intl.DateTimeFormat('en-US', { timeZone: OWNER_TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ranMs));
      problems.push({ title: '🚨 ADHDone: Smart Reminders stopped running', body: `Its last run finished at ${when} (${Math.round((nowMs - ranMs) / 60000)} minutes ago); it should run every 10 minutes. Nobody is getting Smart Reminders until it runs again.` });
    }
  }

  // 2. Smart Reminders plans marked out of date for over 90 minutes in the
  //    person's daytime: the planner is failing on them run after run, and
  //    nothing else notices (Anna's own plan sat like this for five hours).
  // Only people the planner actually visits: a real user with open tasks.
  // The owner's editor account has sat "out of date" since September with no
  // tasks to plan — the first run alerted on it (Oct 9 2026, 12:21 PM).
  const openTasksOf: Record<string, number> = {};
  for (const t of allTasks) {
    if (t.status !== 'active' || t.parent_task_id || t.silenced) continue;
    const e = t.notification_recipient_email || t.created_by;
    if (e) openTasksOf[e] = (openTasksOf[e] || 0) + 1;
  }
  const stuckPlans: string[] = [];
  for (const u of allUsers) {
    if (!u?.email || !realUser(u.email) || !openTasksOf[u.email] || !activeLately(u)) continue;
    const h = localHourIn(u.timezone || OWNER_TZ, now);
    if (h < 9 || h >= 22) continue;
    const dirtyAt = Date.parse(u.smart_nudge_dirty_at || '') || 0;
    if (u.smart_nudge_schedule_dirty === true && dirtyAt && nowMs - dirtyAt > 90 * 60 * 1000) stuckPlans.push(u.email);
  }
  // When the whole run has stopped (1b), that is the reason; no second alert.
  if (stuckPlans.length && !nudgeStopped) {
    problems.push({ title: '⚠️ ADHDone: Smart Reminders not re-planning', body: `${stuckPlans.length} plan(s) have been out of date for over 90 minutes: ${stuckPlans.slice(0, 3).join(', ')}. The planner is failing on them every run.` });
  }

  // 3. Bookings the app never got to and the rescue pass above couldn't make
  //    either: the task still carries its booking marker, has no push, and
  //    its time is still ahead.
  const stuckBookings = allTasks.filter((t: any) =>
    t.status === 'active' && !t.parent_task_id && t.reminder_scheduling_since &&
    nowMs - (Date.parse(t.reminder_scheduling_since) || nowMs) > 20 * 60 * 1000 &&
    !(t.onesignal_notification_ids || []).length &&
    t.next_reminder && Date.parse(t.next_reminder) > nowMs &&
    realUser(t.notification_recipient_email || t.created_by));
  if (stuckBookings.length) {
    const names = stuckBookings.slice(0, 3).map((t: any) => `"${String(t.title || '').slice(0, 30)}" (${t.notification_recipient_email || t.created_by})`).join(', ');
    problems.push({ title: '⚠️ ADHDone: reminders never booked', body: `${stuckBookings.length} task(s) have a time coming up and no reminder booked: ${names}.` });
  }

  // 4. Pushes in the last hour that OneSignal couldn't deliver, to people who
  //    were in the app this week (an uninstalled phone fails forever and is
  //    not news). Up to 12 looked up.
  const undelivered: string[] = [];
  try {
    const rows = await filterAll(base44.asServiceRole.entities.NotificationLedger, {
      send_at: { $gte: new Date(nowMs - H_HOUR).toISOString(), $lte: now.toISOString() },
    });
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const key = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    const candidates = rows.filter((r: any) => r.notification_id && realUser(r.user_email) && activeLately(userByEmail[r.user_email]) && !String(r.kind || '').startsWith('owner_')).slice(0, 12);
    for (const r of candidates) {
      const res = await fetch(`https://onesignal.com/api/v1/notifications/${r.notification_id}?app_id=${appId}`, { headers: { Authorization: `Basic ${key}` } });
      const n: any = await res.json().catch(() => ({}));
      if (!res.ok || n.canceled) continue;
      if ((n.failed || 0) > 0 || (n.errored || 0) > 0) undelivered.push(`${r.user_email}: ${String(r.title || r.kind).slice(0, 36)}`);
    }
  } catch (e) {
    console.error('[HEALTH] delivery check failed:', e);
  }
  if (undelivered.length) {
    problems.push({ title: '⚠️ ADHDone: pushes not reaching phones', body: `${undelivered.length} push(es) in the last hour failed to deliver: ${undelivered.slice(0, 3).join('; ')}.` });
  }

  // 5. Captures typed in the last 2 hours that never became a task (the app
  //    closed before the capture finished). It resumes on their next open,
  //    but the person typed something and nothing happened.
  let stalled: { email: string; text: string; atMs: number }[] = [];
  try {
    stalled = (await stalledCaptures(base44, nowMs - 2 * H_HOUR, nowMs)).filter((s) => realUser(s.email));
  } catch (e) {
    console.error('[HEALTH] capture check failed:', e);
  }
  if (stalled.length) {
    problems.push({ title: '⚠️ ADHDone: a capture never finished', body: `${stalled.length} task(s) typed in the last 2 hours never got made: ${stalled.slice(0, 2).map((s) => `${s.email} "${s.text.slice(0, 40)}"`).join('; ')}.` });
  }

  // 6. Two pushes to one person inside the same minute (Anna, Oct 10 2026:
  //    a snooze return and a planned nudge rang together at 12:09). A
  //    phone-side snooze is invisible here, so this only catches the
  //    server's own collisions — still worth knowing about.
  // 7. A Smart Reminders nudge about a business that was closed when it went
  //    out (the hours are on the task; the planner should have read them).
  const sameMinute: string[] = [];
  const closedNudges: string[] = [];
  try {
    const hourRows = await filterAll(base44.asServiceRole.entities.NotificationLedger, {
      send_at: { $gte: new Date(nowMs - H_HOUR).toISOString(), $lte: now.toISOString() },
    });
    const byMinute: Record<string, any[]> = {};
    const taskById: Record<string, any> = {};
    for (const t of allTasks) taskById[t.id] = t;
    for (const r of hourRows) {
      if (!realUser(r.user_email) || String(r.kind || '').startsWith('owner_')) continue;
      const ms = Date.parse(r.send_at || '');
      if (!Number.isFinite(ms)) continue;
      const k = `${r.user_email}|${Math.floor(ms / 60000)}`;
      (byMinute[k] ||= []).push(r);
      const task = r.task_id ? taskById[r.task_id] : null;
      if (r.kind === 'smart_nudge' && task?.business_hours) {
        const line = businessHoursLine(task.business_hours, ms);
        if (/CLOSED right now/.test(line)) closedNudges.push(`${r.user_email}: "${String(r.title || '').slice(0, 30)}" — ${line.slice(0, 70)}`);
      }
    }
    for (const [k, list] of Object.entries(byMinute)) {
      if (list.length < 2) continue;
      sameMinute.push(`${k.split('|')[0]}: ${list.map((r: any) => String(r.title || r.kind).slice(0, 24)).join(' + ')}`);
    }
  } catch (e) {
    console.error('[HEALTH] collision / closed-business check failed:', e);
  }
  if (sameMinute.length) {
    problems.push({ title: '⚠️ ADHDone: two pushes in the same minute', body: `${sameMinute.length} collision(s) in the last hour: ${sameMinute.slice(0, 3).join('; ')}.` });
  }
  if (closedNudges.length) {
    problems.push({ title: '⚠️ ADHDone: nudged a closed business', body: `${closedNudges.length} nudge(s) in the last hour went out while the place was closed: ${closedNudges.slice(0, 2).join('; ')}.` });
  }

  // 8. In each person's 7 PM hour: a task due today that nothing — planner,
  //    fixed reminder, rhythm — mentioned all day (Anna, Oct 10 2026: "skipped
  //    tasks are worse than too many reminders"). Looks back 19 hours, which
  //    is local midnight at 7 PM.
  const unreminded: string[] = [];
  try {
    for (const u of allUsers) {
      if (!u?.email || !realUser(u.email) || !activeLately(u)) continue;
      const tz = userTimeZone(u);
      if (localHourIn(tz, now) !== 19) continue;
      const today = localDateKey(now, tz);
      const dueToday = allTasks.filter((t: any) => t.status === 'active' && !t.silenced && !t.parent_task_id
        && (t.notification_recipient_email || t.created_by) === u.email
        && t.due_date && localDateKey(new Date(t.due_date), tz) === today);
      if (!dueToday.length) continue;
      const rows = await filterAll(base44.asServiceRole.entities.NotificationLedger, {
        user_email: u.email, send_at: { $gte: new Date(nowMs - 19 * H_HOUR).toISOString(), $lte: now.toISOString() },
      });
      const mentioned = new Set(rows.map((r: any) => r.task_id).filter(Boolean));
      for (const t of dueToday) if (!mentioned.has(t.id)) unreminded.push(`${u.email}: "${String(t.title || '').slice(0, 30)}"`);
    }
  } catch (e) {
    console.error('[HEALTH] due-today check failed:', e);
  }
  if (unreminded.length) {
    problems.push({ title: '⚠️ ADHDone: due today, never reminded', body: `${unreminded.length} task(s) due today got no reminder from anything by 7 PM: ${unreminded.slice(0, 3).join('; ')}.` });
  }

  // 9-11. The app failing one person, told to Anna by name (Anna, Oct 19
  //    2026, after Michelle uninstalled: "very sad we lost michelle and that
  //    the app was not working well for her the whole time. this should have
  //    been flagged"). Michelle wrote "i work night shift" and kept the
  //    starting 10 PM to 8 AM quiet hours, so her alarms rang in the day while
  //    she most likely slept; three rang out unanswered Oct 14-15, and on Oct
  //    19 OneSignal said her phone no longer takes pushes. Nothing told Anna.
  //    Each is told once per happening (sinceMs), not every 6 hours. Left out
  //    with her own accounts: family who only installed it to try it.
  const notReal = new Set([...OWNER_ACCOUNTS, 'antonio.baird1996@gmail.com', 'aleck.baird@gmail.com']);
  const people = allUsers.filter((u: any) => u?.email && !notReal.has(u.email));
  const msOf = (v: any) => {
    const s = String(v || '');
    return s ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : NaN;
  };
  const nameOf = (u: any) => String(u?.preferred_name || u?.full_name || u?.email || 'Someone').trim();
  const clock12 = (hhmm: any) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return String(hhmm || '');
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const theirClock = (u: any, ms: number) => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: userTimeZone(u), weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
    } catch (_) {
      return new Date(ms).toISOString();
    }
  };
  const quietOf = (u: any) => (u?.quiet_hours_enabled === false
    ? 'turned off'
    : `${clock12(u?.quiet_hours_start || '22:00')} to ${clock12(u?.quiet_hours_end || '08:00')}`);
  const theirWords = (u: any) => {
    const s = String(u?.about_me || '').trim().replace(/\s+/g, ' ');
    return s ? ` They wrote: "${s.slice(0, 110)}${s.length > 110 ? '...' : ''}"` : '';
  };

  // 9. Quiet hours and what they told the app (checkQuietHoursFit): moved for
  //    them, about to be asked to change them, or the model unsure (then they
  //    are not asked on a guess, and Anna looks instead).
  for (const u of people) {
    const f = u.quiet_hours_fit;
    if (!f || typeof f !== 'object') continue;
    const appliedMs = msOf(f.applied?.at);
    const atMs = msOf(f.at);
    const why = f.why ? ` Why: ${String(f.why).slice(0, 140)}` : '';
    if (Number.isFinite(appliedMs) && nowMs - appliedMs < 3 * H_DAY) {
      problems.push({
        title: `🌙 ADHDone: moved ${nameOf(u)}'s quiet hours`,
        body: `From 10 PM to 8 AM to ${clock12(f.applied.start)} to ${clock12(f.applied.end)}, going by what they told the app. ${f.applied.told ? 'They have seen the change.' : 'The app tells them the next time they open it.'}${theirWords(u)} ${u.email}`,
        sinceMs: appliedMs,
      });
    } else if (Number.isFinite(atMs) && nowMs - atMs < 3 * H_DAY && f.answered_key !== f.key && f.fits === false) {
      problems.push({
        title: `🌙 ADHDone: ${nameOf(u)}'s quiet hours may miss their sleep`,
        body: `Their quiet hours are ${quietOf(u)}. The app asks them to set ones that fit when they open it${f.start && f.end ? ` (it suggests ${clock12(f.start)} to ${clock12(f.end)})` : ''}.${why}${theirWords(u)} ${u.email}`,
        sinceMs: atMs,
      });
    } else if (Number.isFinite(atMs) && nowMs - atMs < 3 * H_DAY && f.unsure === true) {
      problems.push({
        title: `🌙 ADHDone: not sure ${nameOf(u)}'s quiet hours fit`,
        body: `Their quiet hours are ${quietOf(u)}. The model thinks they may not fit when they sleep but couldn't say when that is, so they weren't asked.${why}${theirWords(u)} ${u.email}`,
        sinceMs: atMs,
      });
    }
  }

  // 10. Alarms that rang out with no answer, or were left with Home or Back:
  //     2 or more in 2 days. Counted from every report the phone sends (the
  //     AppEvent 'alarm_choice' log, cancelTaskNotifications), not only each
  //     task's last choice, which keeps one ring per task and loses it when
  //     the task is deleted or its day rolls over (Anna, Oct 19 2026: "make
  //     it so that we can't undercount missed alarms"). The tasks' last
  //     choices are read too, for rings reported before the log existed; a
  //     ring in both is counted once. Two is enough to look: Chad's 6:30 AM
  //     medication alarm, a time the app picked, rang out on Oct 18 and again
  //     on Oct 19.
  let alarmLogRows: number | null = null;
  const ANSWERED_MS = 3 * 3600e3;
  try {
    const sinceIso = new Date(nowMs - 2 * H_DAY).toISOString();
    const [recent, logged] = await Promise.all([
      filterAll(base44.asServiceRole.entities.Task, { updated_date: { $gte: sinceIso } }),
      filterAll(base44.asServiceRole.entities.AppEvent, { event: 'alarm_choice', created_date: { $gte: sinceIso } }),
    ]);
    const taskById: Record<string, any> = {};
    for (const t of [...allTasks, ...recent]) if (t?.id) taskById[t.id] = t;
    const userByLower: Record<string, any> = {};
    for (const u of allUsers) if (u?.email) userByLower[String(u.email).toLowerCase()] = u;
    const seenRing = new Set<string>();
    const missedBy: Record<string, { taskId: string; ms: number; how: string }[]> = {};
    const addRing = (email: any, taskId: string, choice: any, ms: number, reportId?: string) => {
      // Only alarms that rang out with nobody touching them. Home or Back on
      // a ringing alarm means they saw it and put it away (Sally's "Clean Out
      // Oil Room", Oct 20 and 21 2026): that's their "not now", still counted
      // on the task for Smart Reminders, not an alarm that isn't reaching
      // them. Anna, Oct 21 2026: "Should we even be flagging this?"
      if (choice !== 'ignored') return;
      if (!taskId || !Number.isFinite(ms) || ms > nowMs || nowMs - ms > 2 * H_DAY) return;
      const e = String(email || '').toLowerCase();
      if (!e || notReal.has(e) || !userByLower[e]) return;
      // A ring the person acted on soon after is answered, just not on the
      // alarm screen: Chad lets his 8:00 AM medication alarm ring out and
      // checks the task off from the notification 40 minutes later, every
      // day (Oct 24-27 2026), and the alert called that "going unanswered"
      // (Anna, Oct 27 2026: "Did we lose someone"). A ring younger than the
      // same window with the task still open is too soon to tell.
      const rt = taskById[taskId];
      const rtDone = rt?.status === 'completed' ? msOf(rt.completed_at) : NaN;
      if (Number.isFinite(rtDone) && rtDone >= ms - 60e3 && rtDone - ms <= ANSWERED_MS) return;
      if (!Number.isFinite(rtDone) && nowMs - ms < ANSWERED_MS) return;
      // The same ring, from the log and from the task (or sent twice).
      const key = `${taskId}|${Math.round(ms / 1000)}`;
      if (seenRing.has(key) || (reportId && seenRing.has(`r|${reportId}`))) return;
      seenRing.add(key);
      if (reportId) seenRing.add(`r|${reportId}`);
      (missedBy[e] ||= []).push({ taskId, ms, how: String(choice) });
    };
    alarmLogRows = logged.length;
    for (const r of logged) {
      const p = r?.props || {};
      addRing(r.user_email, String(p.task_id || ''), p.choice, msOf(p.at), p.report_id ? String(p.report_id) : undefined);
    }
    for (const t of Object.values(taskById)) {
      const c = t.last_alarm_choice;
      if (c) addRing(t.notification_recipient_email || t.created_by, t.id, c.choice, msOf(c.at));
    }
    for (const [e, list] of Object.entries(missedBy)) {
      if (list.length < 2) continue;
      const u = userByLower[e];
      list.sort((a, b) => a.ms - b.ms);
      const shown = list.slice(-4);
      for (const x of shown) {
        if (!taskById[x.taskId]) taskById[x.taskId] = (await base44.asServiceRole.entities.Task.get(x.taskId).catch(() => null)) || { title: null };
      }
      const rings = shown.map((x) => {
        const title = taskById[x.taskId]?.title;
        // Finished later all the same: said, so a missed ring that was
        // followed by the task getting done reads as that (Oct 21 2026).
        const t = taskById[x.taskId];
        const doneMs = t?.status === 'completed' ? msOf(t.completed_at) : NaN;
        const done = Number.isFinite(doneMs) && doneMs > x.ms ? `, done ${theirClock(u, doneMs)}` : '';
        return `${title ? `"${String(title).slice(0, 28)}"` : 'a deleted task'} ${theirClock(u, x.ms)}${x.how === 'closed' ? ' (left with Home or Back)' : ''}${done}`;
      }).join('; ');
      problems.push({
        title: `⚠️ ADHDone: ${nameOf(u)}'s alarms are going unanswered`,
        body: `${list.length} alarms in 2 days rang out with no answer${list.length > shown.length ? `, the last ${shown.length}` : ''}: ${rings} (their time). Quiet hours ${quietOf(u)}. ${u.email}`,
        // Told again for every ring the last alert didn't have. It used to be
        // once per 2 days, so Chad's Tuesday misses (8:21 and 9:10 AM) were
        // held back by Sunday's alert and only came Wednesday at 11:30 AM.
        sinceMs: list[list.length - 1].ms,
      });
    }
  } catch (e) {
    console.error('[HEALTH] unanswered-alarm check failed:', e);
  }

  // 11. Their phone stopped taking ADHDone's notifications: OneSignal answered
  //     "not subscribed" after their last open (push_unreachable_at: the app
  //     was uninstalled, or its notifications turned off), or the app saw its
  //     notifications off when they opened it (alarm_permissions). Only people
  //     in the app in the last 14 days: an account long gone quiet is not news.
  for (const u of people) {
    const lastMs = msOf(u.last_active_at);
    if (!Number.isFinite(lastMs) || nowMs - lastMs > 14 * H_DAY) continue;
    const goneMs = msOf(u.push_unreachable_at);
    if (Number.isFinite(goneMs) && goneMs > lastMs && nowMs - goneMs < 2 * H_DAY) {
      problems.push({
        title: `📵 ADHDone: ${nameOf(u)}'s phone stopped taking notifications`,
        body: `OneSignal said ${theirClock(u, goneMs)} (their time) that their phone no longer takes ADHDone's pushes: the app was uninstalled, or its notifications were turned off. Last in the app ${theirClock(u, lastMs)}. ${u.email}`,
        sinceMs: lastMs,
      });
      continue;
    }
    const perm = u.alarm_permissions;
    const permMs = msOf(perm?.checked_at);
    if (perm?.notifications === false && Number.isFinite(permMs) && nowMs - permMs < 2 * H_DAY) {
      problems.push({
        title: `📵 ADHDone: ${nameOf(u)} has notifications off`,
        body: `When they opened the app ${theirClock(u, permMs)} (their time), ADHDone's notifications were off on their phone, so no reminder or alarm can reach them. ${u.email}`,
        sinceMs: nowMs - 7 * H_DAY,
      });
    }
  }

  // A look at what would go out, sending nothing ({ previewHealth: true }).
  if (ctx.dryRun) {
    const out: any[] = [];
    for (const p of problems) {
      const told = await sentToOwner(base44, 'owner_alert', p.title, p.sinceMs ?? nowMs - ALERT_COOLDOWN_MS).catch(() => null);
      out.push({ ...p, sinceMs: p.sinceMs ? new Date(p.sinceMs).toISOString() : null, alreadyTold: told });
    }
    // alarmLogRows: alarm reports read for check 10 (null: that read failed).
    return { problems: out, alarmLogRows } as any;
  }

  // Send what's new. Each title repeats at most every ALERT_COOLDOWN_MS, or
  // is told once since its sinceMs.
  for (const p of problems) {
    try {
      if (await sentToOwner(base44, 'owner_alert', p.title, p.sinceMs ?? nowMs - ALERT_COOLDOWN_MS)) continue;
      await pushOwner(base44, 'owner_alert', p.title, p.body);
      console.log(`[HEALTH] alerted the owner: ${p.title}`);
    } catch (e) {
      console.error('[HEALTH] alert failed:', e);
    }
  }
  if (!problems.length) console.log('[HEALTH] all clear');

  // The daily note: once a day, only when the last 24 hours had anything to
  // say, after her first hour awake, which belongs to her morning summary
  // (Anna, Oct 12 2026: in her 8 o'clock hour it held the summary back), and
  // between 8 AM and 8 PM.
  const owner = userByEmail[OWNER_ALERT_EMAIL];
  const ownerTz = userTimeZone(owner) || OWNER_TZ;
  const ownerUp = owner ? wakeStartMs(owner, now, ownerTz) : null;
  const ownerHour = localHourIn(ownerTz, now);
  if (ownerUp != null && nowMs >= ownerUp + H_HOUR && ownerHour >= 8 && ownerHour < 20
    && !(await sentToOwner(base44, 'owner_daily', null, nowMs - 20 * H_HOUR))) {
    try {
      const alerts = await filterAll(base44.asServiceRole.entities.NotificationLedger, {
        user_email: OWNER_ALERT_EMAIL, kind: 'owner_alert', send_at: { $gte: new Date(nowMs - H_DAY).toISOString() },
      });
      const byTitle: Record<string, number> = {};
      for (const a of alerts) byTitle[String(a.title || '').replace(/^[^A-Za-z]*ADHDone: /, '')] = (byTitle[String(a.title || '').replace(/^[^A-Za-z]*ADHDone: /, '')] || 0) + 1;
      const dayStalled = (await stalledCaptures(base44, nowMs - H_DAY, nowMs)).filter((s) => realUser(s.email));
      const newPeople = allUsers.filter((u: any) => realUser(u?.email) && nowMs - (Date.parse(u.created_date || '') || 0) < H_DAY).map((u: any) => u.email);
      if (alerts.length || dayStalled.length) {
        const parts: string[] = [];
        for (const [k, n] of Object.entries(byTitle)) parts.push(`${k} (${n}x)`);
        if (dayStalled.length) parts.push(`${dayStalled.length} capture(s) never finished: ${dayStalled.slice(0, 2).map((s) => s.email).join(', ')}`);
        // New signups are not a problem: their own labelled line, after the problems.
        let body = `Problems: ${parts.join(' · ')}`;
        if (newPeople.length) body += `\nNew signups (not a problem): ${newPeople.join(', ')}`;
        await pushOwner(base44, 'owner_daily', '🩺 ADHDone yesterday: something was off', body.slice(0, 480));
      }
    } catch (e) {
      console.error('[HEALTH] daily note failed:', e);
    }
  }
}

// ── Repeating tasks whose day is over (Anna, Oct 17 2026) ───────────────────
// "once a recurring task passes the point of being due, just erase it and
// reschedule it for the next day". See REPEATING TASKS WHOSE DAY IS OVER in
// the handler for why. A day ends at 4 AM on their clock, the same line the
// app's own repeat code draws (taskRecurrence.jsx): until then it's still
// "last night", and the copy can still be checked off for that day.
const REPEAT_DAY_ENDS_MS = 4 * 60 * 60 * 1000;
const REPEAT_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const REPEAT_KEY_DAY_MS = 24 * 60 * 60 * 1000;

// What a fresh copy starts with: the day's own history goes with the day.
// The words, notes, pictures and settings stay.
const REPEAT_FRESH_DAY = {
  reminder_count: 0,
  snooze_count: 0,
  consecutive_snoozes: 0,
  dismissed_count: 0,
  ignored_count: 0,
  closed_count: 0,
  later_count: 0,
  later_until: null,
  last_alarm_choice: null,
  snoozed_until: null,
  due_date_pushes: 0,
  last_scheduled_until: null,
  reminder_retry_after: null,
  reminder_scheduling_since: null,
  follow_up_notification_id: null,
};

function repeatKeyMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function repeatAddDays(key: string, n: number): string {
  return new Date(repeatKeyMs(key) + n * REPEAT_KEY_DAY_MS).toISOString().slice(0, 10);
}

// A wall-clock time on a day, on their clock, as an instant (the same two-pass
// offset fix as trackerNextAt, so a DST change between is handled).
function repeatWallMs(key: string, minutes: number, timeZone: string): number {
  const asUtc = repeatKeyMs(key) + minutes * 60000;
  let at = asUtc - trackerOffsetMin(asUtc, timeZone) * 60000;
  at = asUtc - trackerOffsetMin(at, timeZone) * 60000;
  return at;
}

function repeatValueKey(v: any, timeZone: string): string | null {
  if (!v) return null;
  const s = String(v);
  if (REPEAT_DATE_ONLY.test(s)) return s;
  const ms = trackerMs(s);
  return Number.isFinite(ms) ? localDateKey(new Date(ms), timeZone) : null;
}

// The day a copy of a repeating task is for, on their clock (the same pick as
// baseOf in taskRecurrence.jsx: an event's time, an all-day task's date,
// otherwise its reminder time).
function repeatDayKey(task: any, timeZone: string): string | null {
  const v = task.classification === 'event' ? (task.event_time || task.next_reminder || task.due_date)
    : task.day_only_task ? (task.due_date || task.next_reminder)
    : (task.next_reminder || task.due_date || task.event_time || task.start_date);
  return repeatValueKey(v, timeZone);
}

// The next day the repeat lands on after `key`. Same steps as the app's own
// (nextDate in taskRecurrence.jsx).
function repeatStep(key: string, task: any): string | null {
  const dt = new Date(repeatKeyMs(key));
  const days = Array.isArray(task.recurrence_days)
    ? task.recurrence_days.filter((n: any) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  switch (task.recurrence_pattern) {
    case 'daily': dt.setUTCDate(dt.getUTCDate() + 1); break;
    case 'every_other_day': dt.setUTCDate(dt.getUTCDate() + 2); break;
    case 'weekdays':
      do { dt.setUTCDate(dt.getUTCDate() + 1); } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
      break;
    case 'weekly':
      if (days.length > 0) {
        let i = 0;
        do { dt.setUTCDate(dt.getUTCDate() + 1); } while (!days.includes(dt.getUTCDay()) && ++i < 7);
      } else {
        dt.setUTCDate(dt.getUTCDate() + 7);
      }
      break;
    case 'every_other_week': dt.setUTCDate(dt.getUTCDate() + 14); break;
    case 'monthly': dt.setUTCMonth(dt.getUTCMonth() + 1); break;
    case 'yearly': dt.setUTCFullYear(dt.getUTCFullYear() + 1); break;
    default: return null;
  }
  return dt.toISOString().slice(0, 10);
}

// A date on the task moved by whole days on their clock, keeping its time of
// day (or `hhmm` when given). A date-only value stays date-only.
function repeatShift(v: any, days: number, timeZone: string, hhmm: string | null = null): string | null {
  if (!v) return null;
  const s = String(v);
  if (REPEAT_DATE_ONLY.test(s)) return repeatAddDays(s, days);
  const ms = trackerMs(s);
  if (!Number.isFinite(ms)) return null;
  const key = repeatAddDays(localDateKey(new Date(ms), timeZone), days);
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : localMinutesOfDay(new Date(ms), timeZone);
  return new Date(repeatWallMs(key, minutes, timeZone)).toISOString();
}

// Null while the copy's day isn't over yet, or when it stays where it is.
// Otherwise the day it moves on to, and how many days that is: for an event,
// the first day it happens again from today on; for a task, the day right
// after, as long as the repeat runs on day after day (see below).
function repeatRollFor(task: any, timeZone: string, nowMs: number): { fromKey: string; toKey: string; days: number } | null {
  const fromKey = repeatDayKey(task, timeZone);
  if (!fromKey) return null;
  // A stated multi-day range (a trip Dec 3–7) is over after its last day. An
  // event that runs past midnight is still one night (end_date stays empty).
  let lastKey = fromKey;
  const endKey = repeatValueKey(task.end_date, timeZone);
  if (endKey && endKey > lastKey) lastKey = endKey;
  const todayKey = localDateKey(new Date(nowMs - REPEAT_DAY_ENDS_MS), timeZone);
  if (lastKey >= todayKey) return null;
  let toKey = fromKey;
  if (task.classification === 'event') {
    // An event is over once it has happened (there is nothing to check off):
    // on to the next time it happens.
    for (let i = 0; i < 1000 && toKey < todayKey; i++) {
      const next = repeatStep(toKey, task);
      if (!next || next <= toKey) return null;
      toKey = next;
    }
    if (toKey < todayKey) return null;
  } else {
    // A task moves on only while its repeat runs from one day straight into
    // the next: every day, Monday to Friday, a Saturday-and-Sunday chore. That
    // next day still rings (Anna, Oct 18 2026: "Anything recurring that has
    // two or more days in succession should be made to still ring the next
    // day"). Where the repeat has a gap (Friday to Monday, once a week, once a
    // month, every other day) the copy stays until it's checked off, and the
    // app makes the next one then, on the right day (Anna, Oct 17 2026:
    // "weekly things and monthly things will easily get lost ... It stays
    // until it's checked off"). A copy found a few days late walks the
    // day-after-day run as far as today, and stops on the last day before a
    // gap.
    for (let i = 0; i < 1000 && toKey < todayKey; i++) {
      const next = repeatStep(toKey, task);
      if (!next || next !== repeatAddDays(toKey, 1)) break;
      toKey = next;
    }
    if (toKey === fromKey) return null;
  }
  return { fromKey, toKey, days: Math.round((repeatKeyMs(toKey) - repeatKeyMs(fromKey)) / REPEAT_KEY_DAY_MS) };
}

// Every active repeating task or event whose day is over and that moves on
// (repeatRollFor), and any left alone because another copy of it already sits
// on that day or later.
function repeatRollPlan(tasks: any[], userMap: Record<string, any>, nowMs: number): { rolls: any[]; twins: any[] } {
  const rolls: any[] = [];
  const twins: any[] = [];
  for (const task of tasks) {
    if (!task || task.status !== 'active' || task.silenced || task.parent_task_id) continue;
    if (!task.recurrence_pattern || task.recurrence_pattern === 'none') continue;
    // Birthdays roll over to next year in the birthday pass.
    if (task.birthday_person || task.is_own_birthday || task.classification === 'birthday') continue;
    // Which ones move on and which stay until checked off: see repeatRollFor.
    // In Focus Mode: setFocusMode puts it back as it was when the session ends.
    if (task.focus_mode_original_interval) continue;
    const owner = userMap[task.created_by] || userMap[task.notification_recipient_email];
    if (!owner || owner.focus_mode_task_id === task.id) continue;
    const tz = userTimeZone(owner);
    const roll = repeatRollFor(task, tz, nowMs);
    if (!roll) continue;
    const twin = tasks.find((o: any) => o && o.id !== task.id && o.status === 'active' && !o.parent_task_id
      && o.created_by === task.created_by && o.title === task.title && o.recurrence_pattern === task.recurrence_pattern
      && (repeatDayKey(o, tz) || '') >= roll.toKey);
    if (twin) { twins.push({ task, twin }); continue; }
    rolls.push({ task, owner, tz, roll });
  }
  return { rolls, twins };
}

// The change that moves a copy on to its new day, and the pushes of the old
// day still ahead that have to be cancelled.
function repeatMove(fresh: any, owner: any, timeZone: string, roll: { days: number }, nowMs: number): { moved: any; cancel: string[] } {
  const days = roll.days;
  const anchor = /^\d{1,2}:\d{2}$/.test(String(fresh.anchor_time || '')) ? String(fresh.anchor_time) : null;
  const rhythm = !!fresh.reminder_interval && fresh.reminder_interval !== 'once';
  const moved: any = { ...REPEAT_FRESH_DAY, prep_questions: [], onesignal_notification_ids: [] };
  for (const f of ['due_date', 'event_time', 'end_time', 'end_date', 'start_date']) {
    if (fresh[f]) moved[f] = repeatShift(fresh[f], days, timeZone);
  }
  // A rhythm ("every hour until it's done") starts again at the time they gave.
  if (fresh.next_reminder) moved.next_reminder = repeatShift(fresh.next_reminder, days, timeZone, rhythm ? anchor : null);
  // The day's reminders move with it: the same times on the new day, the same
  // words, not booked yet (the promotion pass books them). Ones already past
  // on the new day are dropped.
  const old = Array.isArray(fresh.reminder_schedule) ? fresh.reminder_schedule : [];
  const schedule: any[] = [];
  old.forEach((e: any, i: number) => {
    if (!e || !e.send_at) return;
    const at = repeatShift(e.send_at, days, timeZone);
    const atMs = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(atMs) || atMs <= nowMs) return;
    const { book_error, scheduled, ...rest } = e;
    schedule.push({ ...rest, send_at: at, notification_id: `planned_${fresh.id}_r${i}_${atMs}` });
  });
  // Nothing carried over (an earlier day had its time already past): the one
  // reminder at the time they set, when they set one.
  if (schedule.length === 0 && anchor) {
    const own = atItsOwnTimeEntry({ ...fresh, ...moved }, owner);
    if (own && Date.parse(own.send_at) > nowMs) schedule.push(own);
  }
  moved.reminder_schedule = schedule;
  const cancel: string[] = old
    .filter((e: any) => isBookedId(e?.notification_id) && Date.parse(e?.send_at) > nowMs)
    .map((e: any) => String(e.notification_id));
  if (rhythm && fresh.last_scheduled_until && Date.parse(fresh.last_scheduled_until) > nowMs) {
    for (const id of fresh.onesignal_notification_ids || []) if (isBookedId(id)) cancel.push(String(id));
  }
  return { moved, cancel: [...new Set(cancel)] };
}

// ── A task's own time ─────────────────────────────────────────────────────────
// A one-time task with a clock time of its own (not all day, not a "by"
// deadline): the one kind of ordinary task that gets a reminder booked ahead,
// at that time (Anna, Oct 12 2026). Same test as Smart Reminders' isAtTime.
function hasItsOwnTime(task: any): boolean {
  return task?.reminder_interval === 'once' && !task.day_only_task && task.deadline_style !== 'by';
}

// That one reminder, as a PLANNED entry the promotion loop books once it's
// inside OneSignal's window. Null when the task has no time of its own, or the
// app picked a time that falls in their quiet hours.
function atItsOwnTimeEntry(task: any, owner: any): any | null {
  if (!hasItsOwnTime(task) || !task.next_reminder) return null;
  const at = new Date(task.next_reminder);
  if (!Number.isFinite(at.getTime())) return null;
  const timeZone = userTimeZone(owner);
  const quiet = resolveQuietHours(owner);
  if (!isTimeTheySet(task, at.getTime(), timeZone) && quiet.enabled
      && isInQuietHours(at, quiet.startMin, quiet.endMin, timeZone)) return null;
  const full = (task.title || '').trim() || 'your task';
  const t = full.length > 40 ? `${full.slice(0, 37)}...` : full;
  return {
    notification_id: `planned_${task.id}_at_${at.getTime()}`,
    send_at: at.toISOString(),
    label: 'at the time',
    notification_title: `🔔 ${t}`,
    notification_body: `It's time — "${t}". You've got this! 💪`,
  };
}
