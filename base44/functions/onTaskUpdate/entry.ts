// Re-saved Oct 21 2026 so the bundled shared/reminderTitle.ts is picked up: an alarm at a time they set is marked theirTime and headed with the bell, so the phone never moves it.
// Re-saved Oct 16 2026 so the bundled shared/reminderTitle.ts is picked up: a daily reminder after its first day reads as a reminder, never "slipped past".
// Re-saved Oct 13 2026 (night) so the bundled shared/reminderTitle.ts is picked up: an appointment's alarm carries "Record notes" as its second button.
// Re-saved Oct 13 2026 (evening) so the bundled shared/reminderTitle.ts is picked up: an event's alarm is marked `event` for the phone (build 42 on shows "Got it" only).
// Re-saved Oct 13 2026 so the bundled shared/reminderTitle.ts is picked up: a timed event's alarm rings at its time (and "leave now"), its heads-ups stay pushes.
// Re-saved Oct 12 2026 (pets) so the bundled shared/reminderTitle.ts is picked up: a pet's birthday alarm has no "Write a text" button.
// Re-saved Oct 12 2026 so the bundled shared/workHours.ts (via sendLedger) is picked up:
// an overnight shift belongs to the day it starts and runs past midnight.
// Re-saved Oct 6 2026 so the bundled shared/reminderTitle.ts (Later break: no alarm inside later_until) is picked up.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// Reminder wording: every body names the task (the spoken alarm reads it).
import { getReminderContent, pushPhoneAlarms, platformTimeMs, phoneCanRing } from '../../shared/reminderTitle.ts';
import { orderSameMinuteAlarms } from '../../shared/alarmOrder.ts';
import { adjustForQuietHours, resolveQuietHours, anchorToDaytime, placeRepeatingSlot, userTimeZone, rhythmNamedMin, notBeforeNamedTime, isTimeTheySet, placeAppReminder } from '../../shared/quietHours.ts';
import { ledgerCheck, ledgerRecord, ledgerCancel } from '../../shared/sendLedger.ts';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

// Set per request so the module-level helpers below can reach the send ledger.
let ledgerClient: any = null;

async function cancelOneSignalNotification(notificationId) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.log('[onTaskUpdate] OneSignal credentials missing, skipping cancel');
    return false;
  }

  if (ledgerClient) await ledgerCancel(ledgerClient, [notificationId]);

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

// Task.quiet_hours_exempt: "keep reminding me until I mark it complete", and a
// yes to running through the night. Its rhythm ignores quiet hours, and each
// ping rings as an alarm on a phone set to full-screen reminders.
function nagsThroughNight(t: any): boolean {
  return t?.quiet_hours_exempt === true;
}
function ringsEachPing(t: any, user: any): boolean {
  return nagsThroughNight(t) && phoneCanRing(user) && (t.alert_style === 'alarm' || (t.alert_style !== 'notification' && user?.alarm_mode === 'alarm'));
}

async function scheduleOneSignalNotification(email, title, body, sendAfterIsoString, taskId, alarm = false) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.log('[onTaskUpdate] OneSignal credentials missing, skipping schedule');
    return null;
  }

  if (ledgerClient) {
    const gate = await ledgerCheck(ledgerClient, { email, taskId, kind: 'task_reminder', sendAt: sendAfterIsoString });
    if (!gate.allowed) return null;
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
        type: 'task_reminder',
        ...(alarm ? { alarm: true } : {})
      },
      // A ring-on-arrival push: not held by Doze, and never re-delivered by
      // OneSignal's restore after 10 minutes (same as schedulePush).
      ...(alarm ? { priority: 10, ttl: 10 * 60 } : {})
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
    if (ledgerClient) await ledgerRecord(ledgerClient, { email, taskId, kind: 'task_reminder', source: 'onTaskUpdate', sendAt: sendAfterIsoString, notificationId: result.id, title });
    return result.id;
  } catch (error) {
    console.error('[onTaskUpdate] Error scheduling OneSignal notification:', error);
    return null;
  }
}

// The Android app keeps its OWN copy of a task's alarms (booked on the phone so
// they ring even with no signal). Cancelling the task's pushes above never
// reaches that copy, so a task finished, deleted or moved to the Back Burner
// anywhere else — another device, the web, a calendar sync — could still ring
// on the phone. When that happens the owner's phone gets a silent message
// (nothing shows, no sound) that takes this task's alarms off it. The phone
// ignores it if the app has already rebuilt its alarm list since the change.
// From 1.3.13 the same message also takes the task's reminders out of the
// notification shade, including one that was already on its way when the task
// was checked off (a push booked for that same minute), so it goes to every
// owner, not only alarm users. Builds before 1.3.9 simply ignore it.
async function dropPhoneAlarms(base44, task, taskId) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || !taskId) return;
  const email = task?.created_by;
  if (!email) return;
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [email],
        channel_for_external_user_ids: 'push',
        isAndroid: true,
        // A data-only push: no title or text, so nothing is shown.
        // The name is only for the OneSignal dashboard (never shown to anyone),
        // where a push with no title is otherwise listed as "Untitled Message".
        name: "Silent: remove a finished task's alarms and reminders from the phone",
        content_available: true,
        // Normal priority, on purpose. This push never shows anything, and
        // Google (FCM) watches for exactly that: an app whose high-priority
        // pushes keep arriving with nothing shown gets ALL its pushes to that
        // phone knocked down to normal priority for a while — which is how a
        // demo reminder reached Anna's phone 30 minutes after OneSignal sent it
        // (Oct 1, 2026). Every edit and every finished task used to send one of
        // these at high priority. A sleeping phone may now get this a little
        // late; the phone also takes a finished task's alarms off on its own
        // when the task is finished there, and re-syncs on every open.
        priority: 5,
        // Six hours: at normal priority a sleeping phone may not get it for a
        // while, and a late copy is harmless (taking off alarms twice is nothing).
        ttl: 6 * 60 * 60,
        data: { drop_alarms_task: taskId, changed_at: Date.now() }
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`[onTaskUpdate] alarm drop push failed (${response.status}):`, JSON.stringify(error));
    } else {
      console.log('[onTaskUpdate] Told the phone to drop alarms for task', taskId);
    }
  } catch (error) {
    console.error('[onTaskUpdate] alarm drop push error:', error);
  }
}

// Where a rhythm picks up again when it comes back (un-checked, or back from
// the Back Burner): one interval from now, kept out of the owner's night.
// A daily (or longer) rhythm goes to the daytime slot (anchorToDaytime, the
// same rule the refill job uses for a schedule starting from scratch). It used
// to be moved to the exact minute quiet hours end — the one minute the refill
// job dropped as "the morning digest covers it", every single day — so a daily
// task un-checked at night never rang again. Shorter rhythms still wait for
// quiet hours to end.
// A repeating task's rhythm also never starts before the time they named
// (see rhythmNamedMin in quietHours).
function nextRhythmStart(at: Date, rhythmMs: number, quietEnabled: boolean, startMin: number, endMin: number, timeZone: string, task?: any): Date {
  // The time they set themselves stays put, quiet hours or not (RULES.md §9 Q4).
  if (task && isTimeTheySet(task, at.getTime(), timeZone)) return at;
  if (rhythmMs >= 24 * 60 * 60 * 1000) return anchorToDaytime(at, startMin, endMin, timeZone);
  const next = quietEnabled && !nagsThroughNight(task) ? adjustForQuietHours(at, startMin, endMin, timeZone) : at;
  const namedMin = rhythmNamedMin(task, rhythmMs);
  return namedMin === null ? next : notBeforeNamedTime(next, namedMin, timeZone);
}

// ── Smart nudges ─────────────────────────────────────────────────────────────
// The same split cronSmartTaskNudge uses. Keep the two in step.
const RECURRING_INTERVALS = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
const RHYTHM_OWNED_SINCE = Date.parse('2026-09-24T00:00:00Z');

// Base44 timestamps can come back without a zone marker; they are UTC.
function utcMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

// The refill cron sends a user-asked rhythm ("every hour") — except a
// dateless one made before 2026-09-24, and one with no recipient.
function refillSendsRhythm(t: any): boolean {
  if (!t.notification_recipient_email) return false;
  const dateless = !t.due_date && !t.event_time && !t.start_date && !t.day_only_task;
  if (!dateless) return true;
  const created = utcMs(t.created_date);
  return Number.isFinite(created) && created >= RHYTHM_OWNED_SINCE;
}

// Does the smart-nudge planner read this task? Its own tasks (everything but
// birthdays and a rhythm the refill cron sends — an "at" task counts, it
// joins the moment its time goes by), their steps, and appointments (context).
function plannerReads(t: any): boolean {
  if (!t || t.status !== 'active') return false;
  if (t.classification === 'birthday' || t.birthday_person) return false;
  if (t.parent_task_id || t.classification === 'event') return true;
  return !RECURRING_INTERVALS.has(t.reminder_interval) || !refillSendsRhythm(t);
}

// Everything the planner reads off a task. A change to any of them has to
// reach it right away, not tomorrow.
const PLANNER_FIELDS = [
  'title', 'description', 'notes', 'original_input', 'urgency', 'energy_required',
  'due_date', 'start_date', 'next_reminder', 'event_time', 'end_time', 'anchor_time',
  'day_only_task', 'deadline_style', 'location', 'reminder_wish', 'classification',
  'life_area', 'recurrence_pattern', 'recurrence_days', 'reminder_interval', 'parent_task_id',
  'subtask_order', 'due_date_pushes',
];
const norm = (v: any) => (v === undefined || v === null || v === '' ? null : JSON.stringify(v));
function plannerFieldsChanged(a: any, b: any): string[] {
  // A rhythm task's next_reminder is moved along by cronTaskReminders with
  // every ping — bookkeeping, not an edit.
  const rhythm = RECURRING_INTERVALS.has(a?.reminder_interval) && RECURRING_INTERVALS.has(b?.reminder_interval);
  return PLANNER_FIELDS.filter((f) => !(rhythm && f === 'next_reminder') && norm(a?.[f]) !== norm(b?.[f]));
}

// Marks the owner's smart-nudge plan out of date — the flag, plus WHEN, so a
// plan made from older information never clears a newer change. Returns the
// owner's email when the planner should also be asked to re-plan them right
// now (kickPlanner) instead of at the next run: at most once per person every
// 2 minutes — a burst of edits gets one, and the mark carries anything after
// it to the next scheduled run. Calendar imports and new sub-steps only mark.
const KICK_GAP_MS = 2 * 60 * 1000;
async function markPlanStale(base44: any, ownerEmail: string, reason: string, kick = true): Promise<string | null> {
  if (!ownerEmail) return null;
  let owner: any = null;
  try {
    owner = (await base44.asServiceRole.entities.User.filter({ email: ownerEmail }))?.[0] || null;
  } catch (e) {
    console.error('[onTaskUpdate] Owner lookup failed for smart-nudge re-plan:', e);
  }
  if (!owner?.id) return null;
  const nowIso = new Date().toISOString();
  const lastKick = utcMs(owner.smart_nudge_kick_at);
  const kickNow = kick && !(Number.isFinite(lastKick) && Date.now() - lastKick < KICK_GAP_MS);
  try {
    await base44.asServiceRole.entities.User.update(owner.id, {
      smart_nudge_schedule_dirty: true,
      smart_nudge_dirty_at: nowIso,
      ...(kickNow ? { smart_nudge_kick_at: nowIso } : {}),
    });
  } catch (e) {
    console.error('[onTaskUpdate] Failed to mark the smart-nudge plan out of date:', e);
    return null;
  }
  console.log(`[onTaskUpdate] Smart-nudge plan out of date (${reason})${kickNow ? ' — re-planning now' : ''}`);
  return kickNow ? ownerEmail : null;
}

// Asks the planner to re-plan one person now. Called last, after this
// function's own work, and waited on for at most 20 seconds: the plan is
// already marked out of date, so if this doesn't finish the next scheduled
// run does it.
async function kickPlanner(base44: any, ownerEmail: string | null) {
  if (!ownerEmail) return;
  try {
    await Promise.race([
      base44.asServiceRole.functions.invoke('cronSmartTaskNudge', { email: ownerEmail }),
      new Promise((resolve) => setTimeout(resolve, 20000)),
    ]);
  } catch (e) {
    console.error('[onTaskUpdate] Immediate re-plan failed; the next scheduled run will do it:', e?.message || e);
  }
}

async function handleTaskEvent(req: Request): Promise<Response> {
  try {
    console.log('[onTaskUpdate] ========== FUNCTION START ==========');
    
    const base44 = createClientFromRequest(req);
    ledgerClient = base44;
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    
    const { event, old_data: rawOldData } = payload;
    let data = payload.data;
    const old_data = rawOldData || {};

    // The trigger omits record data when the payload is too large. Without this
    // every field read below throws (Cannot read properties of null), the whole
    // run 500s, and the task silently keeps its stale notifications.
    if (!data && event.type !== 'delete') {
      console.log('[onTaskUpdate] Payload had no data — fetching the task directly');
      const fetched = await base44.asServiceRole.entities.Task.filter({ id: event.entity_id });
      if (fetched.length === 0) {
        console.log('[onTaskUpdate] Task no longer exists — nothing to do');
        return Response.json({ success: true, skipped: true, reason: 'task_missing' });
      }
      data = fetched[0];
    }

    console.log('[onTaskUpdate] Event type:', event.type);
    console.log('[onTaskUpdate] Task ID:', event.entity_id);
    console.log('[onTaskUpdate] Old data:', JSON.stringify(old_data, null, 2));
    console.log('[onTaskUpdate] New data:', JSON.stringify(data, null, 2));

    // On delete: cancel any lingering OneSignal notifications using old_data
    if (event.type === 'delete') {
      // Focus Mode check-ins live in their own field — cancel those too, and
      // the "next step" follow-up booked when it was finished (its own field
      // as well; see logTaskCompletion).
      const ids = Array.from(new Set([
        ...(old_data?.onesignal_notification_ids || []),
        ...(old_data?.focus_mode_notification_ids || []),
        ...(old_data?.follow_up_notification_id ? [old_data.follow_up_notification_id] : []),
        // A reminder plan's pushes (the day-before and morning-of ones), the
        // same as completing a task cancels them. 'planned_' entries were never
        // booked, so there is nothing to cancel for those.
        ...(Array.isArray(old_data?.reminder_schedule) ? old_data.reminder_schedule : [])
          .map((e) => e?.notification_id)
          .filter((id) => id && !String(id).startsWith('planned_')),
      ]));
      if (ids.length > 0) {
        console.log(`[onTaskUpdate] Task deleted — cancelling ${ids.length} notifications`);
        for (const notificationId of ids) {
          await cancelOneSignalNotification(notificationId);
        }
      }
      await dropPhoneAlarms(base44, old_data, event.entity_id);
      // A deleted task can still be in today's smart-nudge plan; mark the plan
      // out of date so it is planned without it (the nudge cron also refuses
      // to send a nudge about a task that no longer exists).
      if (plannerReads(old_data) && !old_data.silenced) {
        const kick = await markPlanStale(base44, old_data.created_by || user.email, 'task deleted', !old_data.google_event_id && !old_data.parent_task_id);
        await kickPlanner(base44, kick);
      }
      return Response.json({ success: true, cancelled: ids.length, reason: 'task_deleted' });
    }

    // On create: anything the smart-nudge planner reads (a task of its own, a
    // step of one, an appointment) makes today's plan out of date, so it is
    // re-planned right away with the new task in it. Being re-planned only
    // means the planner looks again; whether and when to nudge is still its
    // call, so a task months out is not nudged early. (This used to test a
    // narrower copy of the cron's rule, and the two drifted apart — an urgent
    // task due today got nothing until the next morning.)
    if (event.type === 'create') {
      const reads = plannerReads(data) && !data.silenced;
      if (reads) {
        const kick = await markPlanStale(base44, data.created_by || user.email, 'task added', !data.google_event_id && !data.parent_task_id);
        await kickPlanner(base44, kick);
      }
      // An event made with no date or time gets no reminders, and the "would
      // notes help?" check rides on its reminders, so it never showed Record
      // notes (Anna, Oct 20 2026). Asked here instead.
      await judgeNotesForUndatedEvent(base44, data, event.entity_id);
      return Response.json({ success: true, created: true, smartNudge: reads });
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
        // Everything back to normal now: the other recurring reminders that
        // went quiet for the session are booked again at once (the refill job,
        // scoped to this account) rather than at its next hourly run. Anna,
        // Oct 13 2026: "then everything goes back to normal".
        try {
          await base44.asServiceRole.functions.invoke('cronRefillReminders', { onlyEmail: user.email });
        } catch (e) {
          console.warn('[onTaskUpdate] could not rebook the other reminders right away; the hourly job will:', e);
        }
      }
    }

    // An edit puts a put-off task back on normal reminders (Anna, Oct 22 2026:
    // editing it is new information): its put-off days and eased plan
    // (shared/easeOff.ts) are cleared when they change its wording, priority
    // or date. A repeating task's date moves on by itself, so only a one-off
    // task's date counts. ease_plan is set to {} (an object field can't be null).
    const hadEase = (Array.isArray(old_data?.put_off_days) && old_data.put_off_days.length > 0)
      || !!(old_data?.ease_plan && old_data.ease_plan.plan);
    if (hadEase && data.status === 'active') {
      const differs = (k: string) => String(data?.[k] ?? '') !== String(old_data?.[k] ?? '');
      const repeating = !!data.reminder_interval && !['once', 'none'].includes(String(data.reminder_interval));
      const edited = ['title', 'urgency', 'original_input', 'description', 'notes'].some(differs)
        || (!repeating && (differs('due_date') || differs('event_time')));
      if (edited) {
        try {
          await base44.asServiceRole.entities.Task.update(event.entity_id, { put_off_days: [], ease_plan: {} });
          data.put_off_days = [];
          data.ease_plan = {};
          console.log(`[onTaskUpdate] ${event.entity_id} edited: back on normal reminders (put-off days cleared)`);
        } catch (e) {
          console.error('[onTaskUpdate] could not clear the eased plan:', e);
        }
      }
    }

    // A SNOOZE IS NOT A COMPLETION. The snooze handler has just booked the one
    // reminder the user asked for and written its id plus the new next_reminder.
    // Treating 'snoozed' like 'completed' cancelled that reminder and wiped the
    // task's reminder time, interval and recipient, so a snoozed task went silent
    // for good. Leave it exactly as the snooze handler wrote it.
    if (data.status === 'snoozed') {
      console.log('[onTaskUpdate] Task snoozed — leaving its snooze reminder and fields untouched');
      return Response.json({ success: true, skipped: true, reason: 'task_snoozed' });
    }

    // CRITICAL: If task is completed, cancel ALL notifications and wipe all
    // scheduling fields. This MUST come before the empty-notification-IDs early
    // return below — otherwise a task whose onesignal_notification_ids was already
    // cleared (e.g. by the frontend or by setFocusMode exit) would skip this block
    // and keep its reminder_interval / next_reminder set, leaving orphaned push
    // notifications in OneSignal that fire long after completion.
    // A cancelled event (not happening) takes its reminders down the same way;
    // it just never counts as done.
    if (data.status === 'completed' || data.status === 'cancelled') {
      console.log(`[onTaskUpdate] Task ${data.status} — cancelling all notifications and clearing scheduling fields`);
      // Fall back to old_data IDs when the update cleared them — otherwise the
      // real OneSignal notifications would be orphaned and keep firing forever.
      const ids = (data.onesignal_notification_ids?.length
        ? data.onesignal_notification_ids
        : (old_data?.onesignal_notification_ids || []));

      // Also cancel one-time/event reminders stored in reminder_schedule —
      // these are separate OneSignal notification IDs that are NOT in
      // onesignal_notification_ids, so they'd otherwise keep firing after
      // the task is completed.
      const scheduleEntries = (data.reminder_schedule?.length
        ? data.reminder_schedule
        : (old_data?.reminder_schedule || []));

      // Focus Mode check-ins are tracked in their own field — a task finished
      // mid-focus must not keep pinging "How's it going?".
      const focusCheckinIds = (data.focus_mode_notification_ids?.length
        ? data.focus_mode_notification_ids
        : (old_data?.focus_mode_notification_ids || []));

      // All at once, not one after another. A "keep reminding me" task holds
      // up to twenty booked pushes (the new batch and the one before it), and
      // cancelling them in turn took seconds, while a push booked for that
      // same minute could still go out ("Take Pills" checked off at 5:00 PM
      // still got its 5:00 PM push).
      const toCancel = new Set<string>([
        ...ids,
        ...scheduleEntries.map((e: any) => e?.notification_id).filter(Boolean),
        ...focusCheckinIds,
      ]);
      await Promise.all([
        // Once, on the change itself — not again when the clean-up write below
        // re-triggers this function with the task already completed.
        ...(old_data?.status && old_data.status !== 'completed' && old_data.status !== 'cancelled'
          ? [dropPhoneAlarms(base44, { ...old_data, ...data }, event.entity_id)]
          : []),
        ...[...toCancel].map((notificationId) => cancelOneSignalNotification(notificationId)),
      ]);

      // GUARD: Only update if there's actually something to clear. Without this,
      // the Task.update() call below re-triggers this very automation (entity
      // update event), which sees the same completed status, enters this
      // block again, and calls update again — an infinite self-triggering loop
      // that burns integration credits (48k+ in 9 days).
      // next_reminder and reminder_interval are KEPT: they're the task's own
      // time ("pills at 10") and how the user asked to be reminded ("keep
      // reminding me until I do it"), and un-checking the task needs both to
      // bring its reminders back as they were. Nothing sends for a completed
      // task (every sender reads active tasks only).
      const needsClearing =
        (data.onesignal_notification_ids?.length > 0) ||
        (data.reminder_schedule?.length > 0) ||
        data.last_scheduled_until ||
        data.notification_recipient_email ||
        (data.focus_mode_notification_ids?.length > 0) ||
        data.focus_mode_original_interval;

      if (needsClearing) {
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          onesignal_notification_ids: [],
          reminder_schedule: [],
          last_scheduled_until: null,
          notification_recipient_email: null,
          focus_mode_notification_ids: [],
          focus_mode_original_interval: null,
          focus_mode_original_next_reminder: null
        });
        console.log('[onTaskUpdate] Cleared scheduling fields');
      } else {
        console.log('[onTaskUpdate] Scheduling fields already clear — skipping update to prevent loop');
      }

      return Response.json({ success: true, cancelled: true, reason: 'task_completed' });
    }

    // Un-completing a task (completed → active): the completed branch above wipes
    // its scheduling fields (recipient, interval, booked pushes). This puts back
    // what the task needs to be reminded again — for EVERY task. It used to act
    // only on a task with a date still ahead, so a dateless task checked off by
    // accident and un-checked stayed silent for good (no recipient, so nothing
    // ever picked it up again).
    //  - The recipient always comes back, and smart nudges re-plan right away:
    //    they cover a dateless task, a day-only task, any deadline's run-up, and
    //    anything whose time already went by.
    //  - What kind of task it was comes back with it: an appointment, an "at"
    //    task, a "by 5 PM" deadline or a day-only task is 'once' again (a task
    //    with only a due date stays a smart-nudge task — making it 'once' used
    //    to pin it until that date and silence it).
    //  - A thing tied to a clock time still ahead gets its own pushes back: an
    //    appointment its heads-ups and at-time reminder, an "at" task its
    //    at-time reminder. (Every task used to get the appointment set, "Time
    //    to head out! 🚗" included — a day-only chore got them at 11 PM and
    //    midnight.)
    if (data.status === 'active' && (old_data?.status === 'completed' || old_data?.status === 'cancelled')) {
      const email = data.notification_recipient_email || data.created_by || user.email;
      const now = Date.now();
      const isEvent = data.classification === 'event';
      const dayOnly = !!data.day_only_task;
      // The time a timed task is set for. Kept through completion from now on;
      // older completions only have event_time (tasks captured from outside
      // the app) to go on.
      const clockMs = utcMs(data.next_reminder || data.event_time);
      const timed = !isEvent && !dayOnly && !!(data.anchor_time || data.event_time) && Number.isFinite(clockMs);
      const eventMs = isEvent ? utcMs(data.event_time || data.next_reminder || data.due_date) : NaN;
      // A rhythm the user asked for ("keep reminding me until I do it") picks up
      // again one interval from now; the refill cron books it from there.
      const RHYTHM_MS = {
        '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000, '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };
      const rhythmMs = RHYTHM_MS[data.reminder_interval] || 0;
      let rhythmNext: Date | null = null;
      if (rhythmMs) {
        rhythmNext = new Date(now + rhythmMs);
        const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(user);
        rhythmNext = nextRhythmStart(rhythmNext, rhythmMs, quietEnabled, startMin, endMin, userTimeZone(user), { ...old_data, ...data });
      }

      // The "next step" follow-up booked when it was checked off ("move the
      // laundry to the dryer") is for a task that's no longer done — take it back.
      const followUpId = data.follow_up_notification_id || old_data?.follow_up_notification_id;
      if (followUpId) await cancelOneSignalNotification(followUpId);

      const t = data.title.length > 40 ? data.title.slice(0, 37) + '...' : data.title;
      // An event with a day but no clock time hangs on a 9 AM anchor: the day
      // before and the morning of, never "It's time" at 9 AM (Oct 12 2026).
      const eventNoClock = isEvent && (dayOnly || !data.event_time);
      const candidates = rhythmMs ? [] : eventNoClock && eventMs + 14 * 60 * 60 * 1000 > now ? [
        { at: eventMs - 13 * 60 * 60 * 1000, label: 'night before', title: `Heads up 🌙 ${t}`, body: `Just a heads up: "${t}" is tomorrow.` },
        { at: eventMs, label: 'morning of', title: `📅 ${t}`, body: `Just a reminder: "${t}" is today.` },
      ] : isEvent && eventMs > now ? [
        { at: eventMs - 24 * 60 * 60 * 1000, label: 'night before', title: `🎉 ${t}`, body: `Heads up! Your "${t}" is tomorrow. Don't forget to prep! ✨` },
        { at: eventMs - 60 * 60 * 1000, label: '1 hour before', title: `⏰ ${t}`, body: `Almost time! Your "${t}" is in about an hour. Time to head out! 🚗` },
        // One minute before the start (Anna, Oct 29 2026: "exactly one minute before an event").
        { at: eventMs - 60 * 1000, label: 'at the time', title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` },
      ] : timed && data.deadline_style !== 'by' && clockMs > now ? [
        { at: clockMs, label: 'at the time', title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` },
      ] : [];

      const newIds = [];
      const newSchedule = [];
      // Quiet hours (RULES.md §9 Q4): the time they set themselves goes out then
      // (a 5 AM flight); a heads-up the app adds that lands inside them moves to
      // when they end, or is dropped when that's too late. These used to be
      // booked as they came — a 5 AM event's "1 hour before" at 4 AM.
      const backQuiet = resolveQuietHours(user);
      const backTz = userTimeZone(user);
      const backTask = { ...old_data, ...data };
      for (const c of candidates.filter((x) => x.at > now)) {
        if (!nagsThroughNight(backTask) && !isTimeTheySet(backTask, c.at, backTz)) {
          const placed = placeAppReminder(c.at, eventNoClock ? null : isEvent ? eventMs : clockMs, backQuiet, backTz);
          if (placed == null || placed <= now) continue;
          if (placed !== c.at && newSchedule.some((x) => Math.abs(Date.parse(x.send_at) - placed) < 5 * 60 * 1000)) continue;
          c.at = placed;
        }
        const sendAtISO = new Date(c.at).toISOString();
        const notificationId = await scheduleOneSignalNotification(email, c.title, c.body, sendAtISO, event.entity_id);
        newSchedule.push({
          notification_id: notificationId,
          send_at: sendAtISO,
          label: c.label,
          notification_title: c.title,
          notification_body: c.body,
        });
        if (notificationId) newIds.push(notificationId);
      }

      // Mark the plan out of date BEFORE writing the task: that write can
      // re-trigger this function, and the second pass must see this one's
      // re-plan request so it doesn't make another.
      const kick = await markPlanStale(base44, data.created_by || email, 'task un-completed');
      console.log(`[onTaskUpdate] Task un-completed — recipient restored, ${newIds.length} push(es) rebooked`);
      await base44.asServiceRole.entities.Task.update(event.entity_id, {
        notification_recipient_email: email,
        ...(rhythmNext ? { next_reminder: rhythmNext.toISOString(), last_scheduled_until: null } : {}),
        ...(!rhythmMs && (isEvent || timed || dayOnly) ? { reminder_interval: data.reminder_interval || 'once' } : {}),
        ...(isEvent && Number.isFinite(eventMs) && !data.next_reminder ? { next_reminder: new Date(eventMs).toISOString() } : {}),
        ...(followUpId ? { follow_up_notification_id: null } : {}),
        reminder_schedule: newSchedule,
        onesignal_notification_ids: newIds,
      });
      await kickPlanner(base44, kick);
      return Response.json({ success: true, restored: newIds.length });
    }

    // Back Burner: a silenced task gets NO notifications. Cancel every live
    // OneSignal notification, but PRESERVE the task's config and its
    // reminder_schedule send_at times (with dead notification_ids nulled) so the
    // task can be fully restored on reactivation. Only the live notification IDs
    // and the refill bookkeeping field are cleared.
    if (data.silenced === true && old_data?.silenced !== true) {
      console.log('[onTaskUpdate] Task silenced (back burner) — cancelling all notifications');
      const liveIds = (data.onesignal_notification_ids?.length
        ? data.onesignal_notification_ids
        : (old_data?.onesignal_notification_ids || []));
      const scheduleEntries = (data.reminder_schedule?.length
        ? data.reminder_schedule
        : (old_data?.reminder_schedule || []));
      const scheduleIds = scheduleEntries.map((e) => e?.notification_id).filter(Boolean);
      // Focus Mode check-ins live in their own field, the same as on complete
      // and delete — a parked task must not keep asking "How's it going?".
      const focusCheckinIds = (data.focus_mode_notification_ids?.length
        ? data.focus_mode_notification_ids
        : (old_data?.focus_mode_notification_ids || []));
      for (const notificationId of new Set([...liveIds, ...scheduleIds, ...focusCheckinIds])) {
        await cancelOneSignalNotification(notificationId);
      }
      // The phone keeps its own copy of the task's alarms, which cancelling the
      // pushes never reaches — tell it to drop them, as complete and delete do.
      await dropPhoneAlarms(base44, { ...old_data, ...data }, event.entity_id);
      // Keep the send_at times so reactivation can reschedule them; null the
      // now-dead OneSignal IDs so nothing tries to cancel them twice.
      const preservedSchedule = scheduleEntries.map((e) => ({ ...e, notification_id: null }));
      // A back-burnered task is by definition not a priority right now — force
      // it to low so it stops sorting to the top of the list, remembering the
      // real urgency so it can be restored on reactivation.
      const currentUrgency = data.urgency || 'medium';
      await base44.asServiceRole.entities.Task.update(event.entity_id, {
        onesignal_notification_ids: [],
        reminder_schedule: preservedSchedule,
        last_scheduled_until: null,
        ...(focusCheckinIds.length ? { focus_mode_notification_ids: [] } : {}),
        urgency: 'low',
        pre_backburner_urgency: data.pre_backburner_urgency || currentUrgency,
        // Permanent mark: a task that was ever parked counts as a rescue when
        // it is finished, even after it was brought back first.
        was_back_burnered: true,
      });
      await kickPlanner(base44, await markPlanStale(base44, data.created_by || user.email, 'task moved to the back burner'));
      return Response.json({ success: true, silenced: true });
    }

    if (data.silenced === false && old_data?.silenced === true) {
      console.log('[onTaskUpdate] Task reactivated from back burner — rescheduling');
      const RECURRING = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);
      const email = data.notification_recipient_email || user.email;
      const now = Date.now();
      const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(user);
      const timeZone = userTimeZone(user);

      // Restore the priority the task had before it went to the Back Burner
      // (it was forced to low while silenced). Merged into each branch's update
      // so reactivation stays a single write per branch.
      const restoreUrgency = data.pre_backburner_urgency
        ? { urgency: data.pre_backburner_urgency, pre_backburner_urgency: null }
        : {};

      if (data.reminder_interval && RECURRING.has(data.reminder_interval) && email) {
        // Recurring interval task — the refill cron reschedules the batch (it's
        // excluded while silenced; last_scheduled_until is null so it'll force a
        // fresh schedule). Just make sure next_reminder is in the future so the
        // first reminder doesn't fire instantly in the past.
        const intervalMs = {
          '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000, '4hours': 4 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };
        const ms = intervalMs[data.reminder_interval];
        // Kept out of the night; a daily rhythm gets a real daytime slot (see
        // nextRhythmStart — the exact quiet-hours-end minute silenced it).
        const sendAt = nextRhythmStart(new Date(now + ms), ms, quietEnabled, startMin, endMin, timeZone, { ...old_data, ...data });
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          next_reminder: sendAt.toISOString(),
          ...restoreUrgency,
        });
      } else if (Array.isArray(data.reminder_schedule) && data.reminder_schedule.length > 0 && email) {
        // One-time / event task — reschedule each future reminder from the
        // preserved send_at times, repopulating the live OneSignal IDs.
        const newIds = [];
        const newSchedule = [];
        // A task that isn't an event gets back only its reminder at its own
        // time (or one they added themselves); an old AI plan's heads-ups are
        // Smart Reminders' now (Anna, Oct 12 2026).
        const isEventTask = data.classification === 'event';
        const ownAt = data.reminder_interval === 'once' && !data.day_only_task && data.deadline_style !== 'by' && data.next_reminder
          ? new Date(data.next_reminder).getTime() : NaN;
        for (const entry of data.reminder_schedule) {
          const sendAtMs = entry?.send_at ? new Date(entry.send_at).getTime() : 0;
          if (sendAtMs <= now) { newSchedule.push(entry); continue; }
          if (!isEventTask && entry?.their_time !== true && !(Math.abs(sendAtMs - ownAt) < 60 * 1000)) continue;
          const sendAtISO = entry.send_at;
          const title = entry.notification_title || `📌 ${data.title}`;
          const body = entry.notification_body || `You've got this! ${data.title}`;
          const notificationId = await scheduleOneSignalNotification(email, title, body, sendAtISO, event.entity_id);
          if (notificationId) {
            newIds.push(notificationId);
            newSchedule.push({ ...entry, notification_id: notificationId });
          } else {
            newSchedule.push(entry);
          }
        }
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          onesignal_notification_ids: newIds,
          reminder_schedule: newSchedule,
          ...restoreUrgency,
        });
      } else {
        // Smart-nudge task (no interval, no event schedule): the re-plan below
        // brings it back into today's nudges.
        if (data.pre_backburner_urgency) {
          await base44.asServiceRole.entities.Task.update(event.entity_id, restoreUrgency);
        }
      }
      await kickPlanner(base44, await markPlanStale(base44, data.created_by || user.email, 'task back from the back burner'));
      return Response.json({ success: true, reactivated: true });
    }

    // Smart nudge reassessment: a change to ANYTHING the planner reads off
    // this task (its time, date, title, notes, priority, place, steps, how the
    // user asked to be reminded…) takes effect right away — the owner's plan
    // is marked out of date and re-planned now. It used to be priority,
    // energy and due date only, re-planned at the next run, so moving a time
    // or rewording a task did nothing until the next day. (Fixed-interval
    // reminders are deliberately not touched here — priority must never wipe
    // a schedule the user asked for.)
    const changedForPlanner = plannerFieldsChanged(old_data, data);
    let pendingKick: string | null = null;
    if (changedForPlanner.length > 0 && (plannerReads(data) || plannerReads(old_data))) {
      pendingKick = await markPlanStale(base44, data.created_by || user.email, `changed: ${changedForPlanner.join(', ')}`, !data.google_event_id);
    }
    // The immediate re-plan waits until this function's own work below is done.
    const finish = async (body: any, init?: any) => {
      await kickPlanner(base44, pendingKick);
      return Response.json(body, init);
    };

    // Focus Mode owns this task's reminders for the length of the session, and
    // the enter/exit writes themselves change reminder_interval. Rescheduling
    // here cancelled the focus check-ins, booked ten generic hourly pushes in
    // their place, and raced the exit write. Stand down for all of it.
    if (data.focus_mode_original_interval || old_data?.focus_mode_original_interval) {
      console.log('[onTaskUpdate] Focus Mode owns this task right now — not rescheduling');
      return finish({ success: true, skipped: true, reason: 'focus_mode_owned' });
    }

    // Check if there are scheduled notifications for this task
    if (!data.onesignal_notification_ids || data.onesignal_notification_ids.length === 0) {
      console.log('[onTaskUpdate] No scheduled notifications for this task');
      return finish({ success: true, noNotifications: true });
    }

    // For one-time reminders, the frontend handles all scheduling — don't cancel or reschedule
    if (data.reminder_interval === 'once') {
      console.log('[onTaskUpdate] One-time reminder — frontend handles scheduling, skipping');
      return finish({ success: true, skipped: true, reason: 'one_time_reminder' });
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
        return finish({ success: false, error: 'Task not found' }, { status: 500 });
      }

      const currentTask = task[0];

      // We just cancelled every live notification. From here the task MUST end up
      // with either a fresh batch or a genuinely empty list — never the stale IDs
      // of the notifications we just deleted. A stale non-empty list makes the
      // refill cron believe the task is still covered (it only refills tasks with
      // an empty list), so the task would go permanently silent.
      if (currentTask.reminder_interval) {
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
        // next_reminder can be missing or already in the past (cron bookkeeping,
        // or a due-date edit that outran it). Fall back to one interval from now
        // so an edit never leaves a recurring task with zero notifications.
        const storedNext = currentTask.next_reminder ? new Date(currentTask.next_reminder).getTime() : 0;
        const nextReminderTime = storedNext > now ? storedNext : now + ms;

        // Owner quiet hours (local "HH:MM"), in the owner's timezone (the shared
        // fallback when none is saved). Mirrors cronRefillReminders so a
        // reschedule here never fires at 4 AM.
        const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(user);
        const timeZone = userTimeZone(user);
        const useQuiet = quietEnabled && !nagsThroughNight(currentTask);
        const ringEach = ringsEachPing(currentTask, user);

        // Schedule the next 10 notifications with updated title
        const newNotificationIds = [];
        let scheduleTime = nextReminderTime;
        let lastScheduledAt: number | null = null;

        for (let i = 0; i < 10; i++) {
          let sendAt = new Date(scheduleTime);
          // The slot at the time they set themselves goes out then, quiet
          // hours or not (RULES.md §9 Q4, same as the refill job).
          if (useQuiet && !isTimeTheySet(currentTask, sendAt.getTime(), timeZone)) {
            // Same rule as the refill job (placeRepeatingSlot): a night-time
            // ping of a short rhythm is dropped for the morning digest, a daily
            // one moves to a daytime slot. Dropping every slot on the minute
            // quiet hours end silenced a daily rhythm that sat there.
            const placed = placeRepeatingSlot(sendAt, ms, startMin, endMin, timeZone);
            if (!placed) {
              scheduleTime += ms;
              continue;
            }
            sendAt = placed;
            // Skip duplicates that collapse onto the same minute.
            if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt) < 60000) {
              scheduleTime += ms;
              continue;
            }
          }
          // Only schedule if it's in the future
          if (sendAt.getTime() > now) {
            const sendAtISO = sendAt.toISOString();
            const { title, body } = getReminderContent(currentTask.title, currentTask.due_date, sendAtISO, timeZone, currentTask.reminder_interval);
            const notificationId = await scheduleOneSignalNotification(
              currentTask.notification_recipient_email || user.email,
              title,
              body,
              sendAtISO,
              currentTask.id,
              ringEach
            );

            if (notificationId) {
              newNotificationIds.push(notificationId);
              lastScheduledAt = sendAt.getTime();
            }
          }

          scheduleTime += ms;
        }

        // Always write the result — including an empty list when every schedule
        // call failed. Leaving the old (now-cancelled) IDs in place would hide the
        // task from the refill cron and silence it for good.
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          onesignal_notification_ids: newNotificationIds,
          last_scheduled_until: newNotificationIds.length > 0
            ? new Date(scheduleTime - ms).toISOString()
            : null,
          next_reminder: new Date(nextReminderTime).toISOString()
        });

        if (newNotificationIds.length > 0) {
          console.log('[onTaskUpdate] Rescheduled', newNotificationIds.length, 'notifications');
        } else {
          console.warn('[onTaskUpdate] Reschedule produced 0 notifications — cleared IDs so the refill cron picks this task up');
        }
      } else {
        // Interval was removed (e.g. switched to smart nudges) — the cancelled IDs
        // must still be cleared so nothing stale lingers on the task.
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          onesignal_notification_ids: [],
          last_scheduled_until: null
        });
        console.log('[onTaskUpdate] No interval after edit — cleared cancelled notification IDs');
      }
    }

    console.log('[onTaskUpdate] ========== SUCCESS ==========');
    return finish({ success: true });

  } catch (error) {
    console.error('[onTaskUpdate] Unhandled error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// An event with no date or time yet: would recording it help? (The same
// yes/no its reminders ask once it has a time; generateReminderSchedule
// notesCheck, gpt-6-luna.) Only for owners whose phone can record, once per
// event. The answer is kept on the task (notes_worthy) for its Record notes
// button. Never throws: no answer just means no button until it has a time.
async function judgeNotesForUndatedEvent(base44: any, task: any, id: string) {
  try {
    if (!task || !id || task.classification !== 'event' || task.status !== 'active') return;
    if (task.event_time || task.due_date || task.parent_task_id || task.birthday_person) return;
    if (typeof task.notes_worthy === 'boolean') return;
    const owners = await base44.asServiceRole.entities.User.filter({ email: task.created_by });
    if (owners?.[0]?.notes_can_record !== true) return;
    const res = await base44.asServiceRole.functions.invoke('generateReminderSchedule', {
      notesCheck: { title: task.title || '', location: task.location || '' },
    });
    const notes = (res?.data ?? res)?.notes === true;
    await base44.asServiceRole.entities.Task.update(id, { notes_worthy: notes });
    console.log(`[onTaskUpdate] undated event ${id}: notes would ${notes ? '' : 'not '}help`);
  } catch (e) {
    console.error('[onTaskUpdate] notes check failed:', (e as any)?.message || e);
  }
}

// After a task changes, the phone's alarms for it follow right away: an edit
// made on another device, a calendar event that moved, or the server re-booking
// the task used to leave the phone ringing at the old time until the app was
// next opened. Only the task's own alarm list is sent, and only when it changed
// (see pushPhoneAlarms). A finished task is left to dropPhoneAlarms above.
async function movePhoneAlarms(client: any, payload: any) {
  try {
    const event = payload?.event;
    if (!event || (event.type !== 'update' && event.type !== 'create') || !event.entity_id) return;
    const rows = await client.asServiceRole.entities.Task.filter({ id: event.entity_id });
    const task = rows?.[0];
    if (!task || !task.created_by || task.status === 'completed' || task.status === 'cancelled') return;
    const oldData = payload.old_data && Object.keys(payload.old_data).length > 0 ? payload.old_data : null;
    // Set to plain notifications, now and before: it never rang as an alarm.
    if (task.alert_style === 'notification' && (!oldData || oldData.alert_style === 'notification')) return;
    const owners = await client.asServiceRole.entities.User.filter({ email: task.created_by });
    const owner = owners?.[0];
    if (!owner) return;
    // Another alarm at a time they set in the same minute: the one that
    // matters rings first (alarmOrder.ts, Anna, Oct 21 2026).
    const ordered = await orderSameMinuteAlarms(client, task, owner).catch((e: any) => {
      console.error('[onTaskUpdate] alarm order failed:', e?.message || e);
      return task;
    });
    await pushPhoneAlarms(ordered, owner, {
      before: oldData,
      changedAt: platformTimeMs(task.updated_date),
      source: 'onTaskUpdate',
    });
  } catch (e) {
    console.error('[onTaskUpdate] phone alarm update failed:', e);
  }
}

Deno.serve(async (req) => {
  let payload: any = null;
  try {
    payload = JSON.parse(await req.clone().text());
  } catch (_) {
    // Unreadable: the handler below reports it.
  }
  const client = createClientFromRequest(req);
  const res = await handleTaskEvent(req);
  if (payload && res.ok) await movePhoneAlarms(client, payload);
  return res;
});
