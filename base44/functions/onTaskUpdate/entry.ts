import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { getReminderContent } from '../../shared/reminderTitle.ts';
import { adjustForQuietHours, parseHHMM, localMinutesOfDay, resolveQuietHours } from '../../shared/quietHours.ts';
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

async function scheduleOneSignalNotification(email, title, body, sendAfterIsoString, taskId) {
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
    if (ledgerClient) await ledgerRecord(ledgerClient, { email, taskId, kind: 'task_reminder', source: 'onTaskUpdate', sendAt: sendAfterIsoString, notificationId: result.id, title });
    return result.id;
  } catch (error) {
    console.error('[onTaskUpdate] Error scheduling OneSignal notification:', error);
    return null;
  }
}

// The Android app keeps its OWN copy of a task's alarms (booked on the phone so
// they ring even with no signal). Cancelling the task's pushes above never
// reaches that copy, so a task finished or deleted anywhere else — another
// device, the web, a calendar sync — could still ring on the phone. When that
// happens the owner's phone gets a silent message (nothing shows, no sound)
// that takes this task's alarms off it. The phone ignores it if the app has
// already rebuilt its alarm list since the change. Only sent when the task
// could have alarms at all; builds before 1.3.9 simply ignore it.
async function dropPhoneAlarms(base44, task, taskId) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || !taskId) return;
  const email = task?.created_by;
  if (!email || task?.alert_style === 'notification') return;
  try {
    if (task?.alert_style !== 'alarm') {
      const owners = await base44.asServiceRole.entities.User.filter({ email });
      if (owners?.[0]?.alarm_mode !== 'alarm') return;
    }
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
        // A data-only push: no title or text, so nothing is shown. Normal
        // priority, as OneSignal asks for pushes that never show anything.
        // The name is only for the OneSignal dashboard (never shown to anyone),
        // where a push with no title is otherwise listed as "Untitled Message".
        name: "Silent: remove a finished task's alarms from the phone",
        content_available: true,
        priority: 5,
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

Deno.serve(async (req) => {
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
      // Focus Mode check-ins live in their own field — cancel those too.
      const ids = Array.from(new Set([
        ...(old_data?.onesignal_notification_ids || []),
        ...(old_data?.focus_mode_notification_ids || []),
      ]));
      if (ids.length > 0) {
        console.log(`[onTaskUpdate] Task deleted — cancelling ${ids.length} notifications`);
        for (const notificationId of ids) {
          await cancelOneSignalNotification(notificationId);
        }
      }
      await dropPhoneAlarms(base44, old_data, event.entity_id);
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
    if (data.status === 'completed') {
      console.log('[onTaskUpdate] Task completed — cancelling all notifications and clearing scheduling fields');
      // Once, on the change itself — not again when the clean-up write below
      // re-triggers this function with the task already completed.
      if (old_data?.status && old_data.status !== 'completed') {
        await dropPhoneAlarms(base44, { ...old_data, ...data }, event.entity_id);
      }
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

      // Focus Mode check-ins are tracked in their own field — a task finished
      // mid-focus must not keep pinging "How's it going?".
      const focusCheckinIds = (data.focus_mode_notification_ids?.length
        ? data.focus_mode_notification_ids
        : (old_data?.focus_mode_notification_ids || []));
      for (const notificationId of focusCheckinIds) {
        await cancelOneSignalNotification(notificationId);
      }

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
    if (data.status === 'active' && old_data?.status === 'completed') {
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
        if (quietEnabled && user?.timezone) rhythmNext = adjustForQuietHours(rhythmNext, startMin, endMin, user.timezone);
      }
      const t = data.title.length > 40 ? data.title.slice(0, 37) + '...' : data.title;
      const candidates = rhythmMs ? [] : isEvent && eventMs > now ? [
        { at: eventMs - 24 * 60 * 60 * 1000, label: 'night before', title: `🎉 ${t}`, body: `Heads up! Your "${t}" is tomorrow. Don't forget to prep! ✨` },
        { at: eventMs - 60 * 60 * 1000, label: '1 hour before', title: `⏰ ${t}`, body: `Almost time! Your "${t}" is in about an hour. Time to head out! 🚗` },
        { at: eventMs, label: 'at the time', title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` },
      ] : timed && data.deadline_style !== 'by' && clockMs > now ? [
        { at: clockMs, label: 'at the time', title: `🔔 ${t}`, body: `It's time — "${t}". You've got this! 💪` },
      ] : [];

      const newIds = [];
      const newSchedule = [];
      for (const c of candidates.filter((x) => x.at > now)) {
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
      for (const notificationId of [...liveIds, ...scheduleIds]) {
        await cancelOneSignalNotification(notificationId);
      }
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
      const timeZone = user && user.timezone ? user.timezone : null;

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
        let sendAt = new Date(now + ms);
        if (quietEnabled && timeZone) {
          sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
        }
        await base44.asServiceRole.entities.Task.update(event.entity_id, {
          next_reminder: sendAt.toISOString(),
          ...restoreUrgency,
        });
      } else if (Array.isArray(data.reminder_schedule) && data.reminder_schedule.length > 0 && email) {
        // One-time / event task — reschedule each future reminder from the
        // preserved send_at times, repopulating the live OneSignal IDs.
        const newIds = [];
        const newSchedule = [];
        for (const entry of data.reminder_schedule) {
          const sendAtMs = entry?.send_at ? new Date(entry.send_at).getTime() : 0;
          if (sendAtMs <= now) { newSchedule.push(entry); continue; }
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

        // Owner quiet hours (local "HH:MM"). Apply only when enabled AND the owner
        // has a recorded timezone — otherwise we can't convert local wall-time to UTC.
        // Mirrors cronRefillReminders so a reschedule here never fires at 4 AM.
        const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(user);
        const timeZone = user && user.timezone ? user.timezone : null;
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
});