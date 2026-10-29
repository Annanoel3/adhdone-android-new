/**
 * Client-side helper for scheduling and canceling push reminders
 * Uses Base44 server functions that forward to OneSignal
 */

import { base44 } from "@/api/base44Client";

/**
 * Checks if a given time is within quiet hours. Exported so the full-screen
 * alarm set (widgetBridge) follows the same window as pushes do.
 */
export function isInQuietHours(dateTime) {
  // RULES.md hard rule 4: quiet hours default to ON. Only an explicit 'false'
  // (the user turned them off) disables them — a missing value must never read
  // as "off". The defaults match the server and the Layout (22:00–08:00).
  if (localStorage.getItem('quiet_hours_enabled') === 'false') return false;
  const quietStart = localStorage.getItem('quiet_hours_start') || '22:00';
  const quietEnd = localStorage.getItem('quiet_hours_end') || '08:00';
  
  const date = new Date(dateTime);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTime = hours * 100 + minutes; // Convert to HHMM format for easy comparison
  
  const [startHour, startMin] = quietStart.split(':').map(Number);
  const [endHour, endMin] = quietEnd.split(':').map(Number);
  const startTime = startHour * 100 + startMin;
  const endTime = endHour * 100 + endMin;
  
  // Handle case where quiet hours span midnight (e.g., 8 PM to 8 AM)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  } else {
    return currentTime >= startTime && currentTime < endTime;
  }
}

// RULES.md §9 Q4 (Anna, Oct 12 2026): a time the person set themselves inside
// their quiet hours (a 5 AM flight) is the one thing that goes through them,
// alarm and all. True when the task says they set its clock time (time_stated:
// they said or typed one, or picked one in the app) and `ms` is that time: the
// event's start, or the named clock time on its day. Never a time the app
// picked. Same rule as isTimeTheySet in base44/shared/quietHours.ts.
export function isTimeTheySet(task, ms) {
  if (!task || task.time_stated !== true || !Number.isFinite(ms)) return false;
  const when = (v) => (v ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? v : `${v}Z`).getTime() : NaN);
  const ev = when(task.event_time);
  // The start, or the "It's time" a minute before it (an event's rings one
  // minute early since Oct 29 2026, Anna: "exactly one minute before").
  if (Number.isFinite(ev) && Math.abs(ev - ms) <= 90 * 1000) return true;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task.anchor_time || ''));
  if (!m) return false;
  const d = new Date(ms);
  if (d.getHours() !== Number(m[1]) || d.getMinutes() !== Number(m[2])) return false;
  // On the task's own day for a one-time task, on one of its days for a
  // repeating one.
  if (!task.recurrence_pattern || task.recurrence_pattern === 'none') {
    return [task.due_date, task.next_reminder, task.event_time]
      .map(when).filter(Number.isFinite)
      .some((t) => new Date(t).toDateString() === d.toDateString());
  }
  if (Array.isArray(task.recurrence_days) && task.recurrence_days.length) return task.recurrence_days.includes(d.getDay());
  return true;
}

/**
 * Adjusts send time to avoid quiet hours
 */
function adjustForQuietHours(dateTime) {
  let adjustedTime = new Date(dateTime);
  let guard = 0;

  while (isInQuietHours(adjustedTime) && guard++ < 3) {
    const quietEnd = localStorage.getItem('quiet_hours_end') || '08:00';
    const [endHour, endMin] = quietEnd.split(':').map(Number);
    const slot = new Date(adjustedTime);

    // Jump to the end of THIS quiet stretch: the first quiet-end after the
    // slot. Setting the end time on the slot's own day moved a late-evening
    // slot on a later day (11 PM Friday) to 8 AM that same Friday — earlier
    // than the time it was asked for.
    adjustedTime.setHours(endHour, endMin, 0, 0);
    if (adjustedTime <= slot) {
      adjustedTime.setDate(adjustedTime.getDate() + 1);
    }

    // If adjusted time is now in the past, move to tomorrow
    if (adjustedTime < new Date()) {
      adjustedTime.setDate(adjustedTime.getDate() + 1);
    }
  }

  return adjustedTime;
}

/**
 * Returns the time a reminder will ACTUALLY be sent at, after quiet-hour
 * adjustment. Exact reminders (the user's chosen clock time) are never moved.
 * Exported so callers can persist/display the real time, not the requested one.
 */
export function resolveSendTime(sendAtISO, exact) {
  const t = new Date(sendAtISO);
  if (!exact && isInQuietHours(t)) return adjustForQuietHours(t).toISOString();
  return t.toISOString();
}

/**
 * Schedules push notifications and returns OneSignal notification ID
 */
// A push booked before this phone is linked for pushes is refused by OneSignal
// and lost. On a brand-new account that is exactly the moment the first task
// goes in: the notifications question was just answered and OneSignalInit is
// still telling OneSignal whose phone this is. So a booking waits for the
// link (the first one on a fresh install waits a few seconds; every later one
// finds it already made), plus a short settle so OneSignal's side has the
// subscription before it is asked to deliver to it. Phone app only — in a
// browser there is nothing to wait for.
const PUSH_LINK_WAIT_MS = 45000;
const PUSH_LINK_SETTLE_MS = 2500;
async function waitForPushLink() {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  if (window.__adhdonePushLinked) return;
  const linked = await new Promise((resolve) => {
    const done = (ok) => { window.removeEventListener('adhdone:push-linked', onLinked); clearTimeout(t); resolve(ok); };
    const onLinked = () => done(true);
    const t = setTimeout(() => done(!!window.__adhdonePushLinked), PUSH_LINK_WAIT_MS);
    window.addEventListener('adhdone:push-linked', onLinked);
  });
  if (linked) await new Promise((r) => setTimeout(r, PUSH_LINK_SETTLE_MS));
}

export async function scheduleReminder({
  email,
  title,
  body,
  minutesFromNow,
  sendAtISO,
  taskId,
  data,
  android_channel_id,
  buttons,
  exact,
  // Called with { title, body } when the push went out in other words than
  // the ones passed in: the reminder at a task's own time is reworded by
  // schedulePush (shared/reminderTitle.ts, atTimeWords), and whoever saves the entry on the
  // task saves those, so the phone's alarm says the same thing as the push.
  onWords,
  // Called with the ISO time the push was really booked for, when that
  // differs from sendAtISO (a heads-up moved off another push's minute).
  onSendAt
}) {
  console.log('[scheduleReminder] Called with:', { email, title, body, sendAtISO, minutesFromNow, taskId, exact });
  
  if (!email) throw new Error("email required");
  if (!title) throw new Error("title required");
  if (!body) throw new Error("body required");

  await waitForPushLink();

  const payload = {
    toUserExternalId: email,
    title,
    body,
  };

  if (sendAtISO) {
    let scheduleTime = new Date(sendAtISO);
    // Adjust for quiet hours — EXCEPT for exact reminders. When the user asked
    // for a specific clock time, that reminder fires at that time, period.
    if (!exact && isInQuietHours(scheduleTime)) {
      scheduleTime = adjustForQuietHours(scheduleTime);
      console.log('[scheduleReminder] Adjusted time to avoid quiet hours:', scheduleTime.toISOString());
    }
    payload.sendAtISO = scheduleTime.toISOString();
    console.log('[scheduleReminder] Using absolute time:', payload.sendAtISO);
  } else if (typeof minutesFromNow === "number") {
    payload.minutesFromNow = minutesFromNow;
    console.log('[scheduleReminder] Using relative time:', minutesFromNow, 'minutes');
  }

  if (data || taskId) {
    payload.data = {
      screen: "/Tasks",
      ...(taskId && { taskId }),
      ...(data || {})
    };
  }

  if (android_channel_id) {
    payload.android_channel_id = android_channel_id;
  }

  if (buttons && buttons.length > 0) {
    payload.buttons = buttons;
  }

  console.log('[scheduleReminder] Full payload to schedulePush:', JSON.stringify(payload, null, 2));

  try {
    console.log('[scheduleReminder] Invoking base44.functions.invoke("schedulePush", ...)');
    const response = await base44.functions.invoke('schedulePush', payload);
    console.log('[scheduleReminder] Raw response:', response);
    
    const result = response.data || response;
    console.log('[scheduleReminder] Result:', result);
    
    if (result.success === false) {
      console.error('[scheduleReminder] Function returned success: false', result);
      throw new Error(result.error || 'Failed to schedule notification');
    }
    
    console.log('[scheduleReminder] SUCCESS - Notification ID:', result.notificationId);
    if (onWords && result.notificationId && result.words?.title && result.words?.body) {
      try { onWords({ title: result.words.title, body: result.words.body }); } catch (e) { /* the id still counts */ }
    }
    // The minute it really went at: a heads-up that would have landed on
    // another push is moved to a free minute nearby (schedulePush).
    if (onSendAt && result.notificationId && typeof result.sendAt === 'string' && result.sendAt) {
      try { onSendAt(result.sendAt); } catch (e) { /* the id still counts */ }
    }
    return result.notificationId; // Return the OneSignal notification ID
  } catch (error) {
    console.error('[scheduleReminder] FAILED - Error:', error);
    console.error('[scheduleReminder] Error details:', error.message, error.stack);
    throw error;
  }
}

/**
 * Every reminder booked for this task that hasn't gone yet: the ids on the
 * copy of the task this screen holds, plus the server's own record of what it
 * booked (NotificationLedger, readable for one's own rows). The copy on screen
 * can be missing a booking: a new task's reminder is booked on the server a
 * few seconds to a minute after the task appears, and saved on the task only
 * when that's done. Tricia (Oct 28 2026) said "remind me tomorrow at 9am",
 * moved it to 7 AM on the card a minute later, and got both: the 9 AM one was
 * booked but not on the task yet, so the card had nothing to cancel.
 * Only the kinds a time change rebooks (the reminder at the time, its
 * heads-ups and check-ins); Focus Mode, birthday and Smart Reminders pushes
 * have their own owners.
 */
const REBOOKED_KINDS = new Set(['task_reminder', 'task_checkin', 'event_reminder']);
export async function bookedIdsForTask(task) {
  const ids = new Set([
    ...(task?.onesignal_notification_ids || []),
    ...((task?.reminder_schedule || []).map((r) => r?.notification_id)),
  ]);
  if (task?.id) {
    try {
      const rows = await base44.entities.NotificationLedger.filter({ task_id: task.id });
      const now = Date.now();
      for (const r of rows || []) {
        if (r?.notification_id && REBOOKED_KINDS.has(r.kind || 'task_reminder') && Date.parse(r.send_at) > now) {
          ids.add(r.notification_id);
        }
      }
    } catch (e) {
      // The copy's own ids still go.
    }
  }
  return Array.from(ids).filter((id) => id && !String(id).startsWith('planned_'));
}

/**
 * Cancels scheduled push notification(s) by OneSignal notification ID(s)
 * Accepts either a single ID string or an array of IDs
 */
export async function cancelScheduledReminder(notificationIds) {
  if (!notificationIds) {
    console.log('[cancelScheduledReminder] No notification ID provided, skipping');
    return;
  }

  // Convert single ID to array for uniform processing
  const idsArray = Array.isArray(notificationIds) ? notificationIds : [notificationIds];

  try {
    console.log('[cancelScheduledReminder] Canceling notifications:', idsArray);
    
    // Cancel all notifications in parallel
    const cancelPromises = idsArray.map(id => 
      base44.functions.invoke('cancelScheduled', { notificationId: id })
        .catch(error => {
          console.error(`[cancelScheduledReminder] Failed to cancel ${id}:`, error);
          return null; // Don't fail the whole operation
        })
    );
    
    const results = await Promise.all(cancelPromises);
    console.log('[cancelScheduledReminder] Canceled all:', results);
    return results;
  } catch (error) {
    console.error('[cancelScheduledReminder] Failed:', error);
    // Don't throw - deletion should succeed even if notification cancel fails
  }
}

/**
 * Schedules multiple recurring reminders and returns array of notification IDs
 */
// ── "Keep reminding me until I mark it complete" vs quiet hours ─────────────
// A repeating rhythm the user asked for stops at quiet hours like everything
// else, so a 9 PM chore rang once and the night was lost. When a task comes in
// with a short rhythm AND the user's own instruction to keep going, the app
// asks BEFORE its reminders are booked (QuietHoursNagPrompt puts the question
// on screen): run through the night too? Yes marks the task exempt
// (Task.quiet_hours_exempt) and books it right the first time — straight
// through, ringing as an alarm on a full-screen phone. Asking after the
// booking, then cancelling and waiting for the hourly refill job, left a gap
// of twenty minutes to two hours, and could miss the batch still being booked.
export const NAG_INTERVALS = { '10min': 'every 10 minutes', '20min': 'every 20 minutes', '30min': 'every 30 minutes', '1hour': 'every hour', '2hours': 'every 2 hours', '4hours': 'every 4 hours' };

export function shouldAskQuietHoursNag(task, user) {
  if (!task || task.parent_task_id || task.quiet_hours_exempt) return false;
  if (!NAG_INTERVALS[task.reminder_interval]) return false;
  if (!String(task.reminder_wish || '').trim()) return false;
  return user?.quiet_hours_enabled !== false;
}

// Resolves true only when the person taps yes. No popup mounted (nothing
// registered on the window), or no answer within five minutes: no, and quiet
// hours stand.
export async function askQuietHoursNag(task) {
  const ask = window.__quietHoursNagAsk;
  if (typeof ask !== 'function') return false;
  try {
    return !!(await ask(task));
  } catch (e) {
    return false;
  }
}

export async function scheduleRecurringReminders({
  email,
  title,
  body,
  startTime,
  intervalMs,
  count = 10, // Schedule next 10 occurrences
  taskId,
  data,
  android_channel_id,
  buttons,
  // Task.quiet_hours_exempt: no quiet-hours moves, and (alarm) each ping asks
  // the phone to ring on arrival. Left out by a caller (an edit, an un-check,
  // a Back Burner return re-booking the rhythm): read off the task, so a task
  // that said yes keeps running through the night after any of those too.
  throughQuietHours,
  alarm,
  // The task itself, when the caller has it: a slot at the time they set
  // themselves (isTimeTheySet) goes out then, quiet hours or not (RULES.md
  // §9 Q4: "every day at 6 AM" pings at 6, not 8).
  task
}) {
  console.log('[scheduleRecurringReminders] Scheduling', count, 'notifications starting at', startTime);

  if (throughQuietHours === undefined && taskId) {
    try {
      const t = await base44.entities.Task.get(taskId);
      throughQuietHours = t?.quiet_hours_exempt === true;
      if (throughQuietHours && alarm === undefined) {
        alarm = t.alert_style === 'alarm' ||
          (t.alert_style !== 'notification' && (await base44.auth.me().catch(() => null))?.alarm_mode === 'alarm');
      }
    } catch (e) {
      throughQuietHours = false;
    }
  }
  throughQuietHours = throughQuietHours === true;
  alarm = alarm === true;
  
  const baseData = {
    screen: "/Tasks",
    ...(taskId && { taskId }),
    ...(data || {}),
    ...(alarm ? { alarm: true } : {})
  };

  // One at a time, not all at once. The send ledger (NotificationLedger) can
  // only turn away a duplicate it has already seen recorded; ten bookings
  // racing in parallel all got past it together.
  const validIds = [];
  const bookedMinutes = new Set();
  let lastBookedAt = null;
  for (let i = 0; i < count; i++) {
    let sendAt = new Date(new Date(startTime).getTime() + (intervalMs * i));

    // Adjust for quiet hours — unless this task was asked, and said yes, to
    // keep going through them, or this slot is at the time they set.
    const theirTime = !!task && isTimeTheySet(task, sendAt.getTime());
    if (!throughQuietHours && !theirTime && isInQuietHours(sendAt)) {
      sendAt = adjustForQuietHours(sendAt);
    }

    // Every overnight slot of an hourly reminder moves to the same morning
    // minute — that was nine identical pushes at 8 AM. Only the first one
    // for any minute is booked.
    const minute = Math.floor(sendAt.getTime() / 60000);
    if (bookedMinutes.has(minute)) continue;
    bookedMinutes.add(minute);

    try {
      const notificationId = await scheduleReminder({
        email,
        title,
        body,
        sendAtISO: sendAt.toISOString(),
        taskId,
        data: baseData,
        android_channel_id,
        buttons,
        // Keeps the slot where it is (no second quiet-hours move below).
        exact: throughQuietHours || theirTime
      });
      if (notificationId) {
        console.log(`[scheduleRecurringReminders] Scheduled #${i + 1} for ${sendAt.toISOString()}: ${notificationId}`);
        validIds.push(notificationId);
        lastBookedAt = sendAt;
      }
    } catch (error) {
      console.error(`[scheduleRecurringReminders] Failed to schedule #${i + 1}:`, error);
    }
  }

  console.log(`[scheduleRecurringReminders] Scheduled ${validIds.length}/${count} notifications`);

  // Return both the IDs and the last scheduled time so callers can persist
  // last_scheduled_until — the time the last one really goes out (slots moved
  // or skipped for quiet hours no longer line up with start + n × interval),
  // the same thing the refill cron records.
  const lastScheduledUntil = lastBookedAt ? lastBookedAt.toISOString() : null;

  return { notificationIds: validIds, lastScheduledUntil };
}