import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { adjustForQuietHours, isInQuietHours, localMinutesOfDay, resolveQuietHours, userTimeZone } from '../../shared/quietHours.ts';
import { FOCUS_MODE_INTERVAL, FOCUS_MODE_INTERVAL_MS, getFocusModeContent } from '../../shared/focusMode.ts';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

// The only intervals that count as "this task repeats". A task with no interval
// (smart reminder) or 'once' (a dated one-time task or event) is NOT recurring,
// and Focus Mode must never turn it into one.
const RECURRING = new Set(['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day']);

async function cancelOneSignal(ids: string[]) {
  if (!ids.length) return;
  await Promise.allSettled(ids.map(id =>
    fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${ONESIGNAL_APP_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` }
    })
  ));
}

// The next moment quiet hours begin, on the owner's clock, at or after `fromMs`
// (null when quiet hours are off or start and end coincide).
function nextQuietStartMs(fromMs: number, startMin: number, endMin: number, timeZone: string): number | null {
  if (startMin === endMin) return null;
  const base = Math.floor(fromMs / 60000) * 60000;
  for (let i = 0; i <= 24 * 60; i++) {
    const t = base + i * 60000;
    if (localMinutesOfDay(new Date(t), timeZone) === startMin) return t;
  }
  return null;
}

// Books the hourly "how's it going?" check-ins from `fromMs`, up to six, and
// returns their ids with the last one's time. Quiet hours move a slot to their
// end (one such slot is kept) unless `throughQuiet` — the person answered the
// quiet-hours question with "keep going".
async function bookCheckins(base44: any, user: any, focusTask: any, fromMs: number, throughQuiet: boolean) {
  const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(user);
  const timeZone = userTimeZone(user);
  const useQuiet = quietEnabled && !throughQuiet && focusTask.quiet_hours_exempt !== true;
  const now = Date.now();
  const slots: Date[] = [];
  let lastPlanned: Date | null = null;
  let scheduleTime = fromMs + FOCUS_MODE_INTERVAL_MS;
  for (let i = 0; i < 6; i++, scheduleTime += FOCUS_MODE_INTERVAL_MS) {
    let sendAt = new Date(scheduleTime);
    if (useQuiet) {
      sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
      // Several night slots land on the same morning minute: one is enough.
      if (lastPlanned && Math.abs(sendAt.getTime() - lastPlanned.getTime()) < 60000) continue;
    }
    if (sendAt.getTime() <= now) continue;
    slots.push(sendAt);
    lastPlanned = sendAt;
  }
  const { title, body } = getFocusModeContent(focusTask.title);
  const booked = await Promise.all(slots.map(async (sendAt) => {
    try {
      const res = await base44.asServiceRole.functions.invoke('schedulePush', {
        internalKey: Deno.env.get('CRON_SECRET'), // proves this call comes from the app's own backend
        toUserExternalId: user.email,
        title,
        body,
        sendAtISO: sendAt.toISOString(),
        data: { screen: '/TaskNotification', taskId: focusTask.id, urgency: focusTask.urgency || 'medium', type: 'task_reminder', focus: true },
        buttons: [
          { id: 'snooze_15', text: 'Snooze 15 min' },
          { id: 'snooze_60', text: 'Snooze 1 hour' },
          { id: 'complete', text: '✅ Done' }
        ]
      });
      const r = res?.data || res;
      return r?.notificationId ? { id: String(r.notificationId), sendAt } : null;
    } catch (e) {
      console.error('[setFocusMode] Failed to schedule focus check-in:', e);
      return null;
    }
  }));
  const ids: string[] = [];
  let lastAt: Date | null = null;
  for (const b of booked) {
    if (!b) continue;
    ids.push(b.id);
    lastAt = b.sendAt;
  }
  return { ids, lastAt };
}

// The quiet-hours question (Anna, Oct 13 2026): a minute before quiet hours
// start — or right away, for a session that starts inside them — one push:
// "Quiet time usually starts now. Keep going until you finish, or pick this up
// tomorrow morning?" A tap opens the app on that choice (FocusModePrompt).
// Returns the push id and its time, or null when quiet hours are off or the
// person already answered this session.
async function bookQuietQuestion(base44: any, user: any, focusTask: any) {
  if (focusTask.quiet_hours_exempt === true) return null;
  const { enabled, startMin, endMin } = resolveQuietHours(user);
  if (!enabled) return null;
  const timeZone = userTimeZone(user);
  const now = Date.now();
  const inside = isInQuietHours(new Date(now), startMin, endMin, timeZone);
  const startMs = inside ? now + 60000 : nextQuietStartMs(now, startMin, endMin, timeZone);
  if (!startMs) return null;
  const sendAt = new Date(inside ? startMs : startMs - 60000);
  try {
    const res = await base44.asServiceRole.functions.invoke('schedulePush', {
      internalKey: Deno.env.get('CRON_SECRET'),
      toUserExternalId: user.email,
      title: inside ? 'Quiet time has started' : 'Quiet time usually starts now',
      body: `Still on "${(focusTask.title || '').trim() || 'your task'}"? Keep going until you finish, or pick this up tomorrow morning? Tap to choose.`,
      sendAtISO: sendAt.toISOString(),
      data: { screen: '/Home', taskId: focusTask.id, type: 'focus_quiet', focus: true },
    });
    const r = res?.data || res;
    return r?.notificationId ? { id: String(r.notificationId), sendAt } : null;
  } catch (e) {
    console.error('[setFocusMode] Failed to book the quiet-hours question:', e);
    return null;
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, taskId } = body;
    // Optional: a caller (e.g. the 5-minute sprint "Keep going" handoff) can
    // pass the moment the work actually started so the Focus Mode elapsed timer
    // continues from there instead of restarting at 0.
    const startedAt = typeof body.startedAt === 'string' && body.startedAt
      ? body.startedAt
      : null;

    if (action === 'enter') {
      if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 });

      const focusTask = await base44.asServiceRole.entities.Task.get(taskId);
      if (!focusTask) return Response.json({ error: 'Task not found' }, { status: 404 });

      // The session is on the profile before any of the slower work below, so
      // anything reading the profile meanwhile already sees Focus Mode on.
      await base44.asServiceRole.entities.User.update(user.id, {
        focus_mode_task_id: taskId,
        focus_mode_entered_at: startedAt || new Date().toISOString()
      });

      const wasRecurring = RECURRING.has(focusTask.reminder_interval);
      const ownIds = Array.isArray(focusTask.onesignal_notification_ids) ? focusTask.onesignal_notification_ids : [];

      // A recurring task's own nags are replaced by hourly check-ins for the
      // session. A smart-reminder or one-time task keeps its own reminders —
      // cancelling them here is how a dated task lost its reminders for good.
      if (wasRecurring && ownIds.length) await cancelOneSignal(ownIds);

      // The six hourly check-ins (bookCheckins: quiet hours move a slot to
      // their end), then the quiet-hours question for tonight.
      const now = Date.now();
      const { ids: checkinIds, lastAt: lastScheduledAt } = await bookCheckins(base44, user, focusTask, now, false);
      const quietAsk = await bookQuietQuestion(base44, user, focusTask);
      if (quietAsk) checkinIds.push(quietAsk.id);

      if (wasRecurring) {
        const newLastScheduledUntil = lastScheduledAt
          ? lastScheduledAt.toISOString()
          : new Date(now + FOCUS_MODE_INTERVAL_MS * 6).toISOString();

        // Recurring task: switch to the hourly focus cadence for the session and
        // remember exactly what it had, so exit can put it back.
        await base44.asServiceRole.entities.Task.update(taskId, {
          reminder_interval: FOCUS_MODE_INTERVAL,
          focus_mode_original_interval: focusTask.reminder_interval,
          focus_mode_original_next_reminder: focusTask.next_reminder || null,
          focus_mode_notification_ids: checkinIds,
          focus_mode_checkins_until: lastScheduledAt ? lastScheduledAt.toISOString() : null,
          focus_mode_quiet_choice: null,
          focus_mode_quiet_ask_at: quietAsk ? quietAsk.sendAt.toISOString() : null,
          onesignal_notification_ids: checkinIds,
          last_scheduled_until: newLastScheduledUntil,
          next_reminder: new Date(now + FOCUS_MODE_INTERVAL_MS).toISOString()
        });
      } else {
        // Smart-reminder or one-time task: its interval, its date/time and its
        // own reminders are left exactly as they are. Only the check-ins are
        // tracked, in their own field, so exit can cancel them and nothing else.
        // focus_mode_checkins_until lets the hourly job (cronRefillReminders)
        // keep the check-ins coming past these first six, until it's done.
        await base44.asServiceRole.entities.Task.update(taskId, {
          focus_mode_notification_ids: checkinIds,
          focus_mode_checkins_until: lastScheduledAt ? lastScheduledAt.toISOString() : new Date(now).toISOString(),
          focus_mode_quiet_choice: null,
          focus_mode_quiet_ask_at: quietAsk ? quietAsk.sendAt.toISOString() : null
        });
      }

      // ── Non-focus recurring tasks: silence until Focus Mode ends ──
      const tasks = await base44.asServiceRole.entities.Task.filter({
        notification_recipient_email: user.email,
        status: 'active'
      }, '-updated_date', 500);

      const recurring = tasks.filter(t =>
        t.reminder_interval && t.reminder_interval !== 'once' && t.id !== taskId
      );

      // All at once, not one task after another.
      await Promise.all(recurring.map(async (t) => {
        const ids = Array.isArray(t.onesignal_notification_ids) ? t.onesignal_notification_ids : [];
        if (ids.length) await cancelOneSignal(ids);
        await base44.asServiceRole.entities.Task.update(t.id, {
          onesignal_notification_ids: [],
          last_scheduled_until: null
        });
      }));

      return Response.json({ success: true, focusMode: true, taskId });
    }

    if (action === 'exit') {
      const focusTaskId = user.focus_mode_task_id;
      if (focusTaskId) {
        const focusTask = await base44.asServiceRole.entities.Task.get(focusTaskId).catch(() => null);
        if (focusTask) {
          const checkinIds = Array.isArray(focusTask.focus_mode_notification_ids) ? focusTask.focus_mode_notification_ids : [];
          const savedInterval = focusTask.focus_mode_original_interval;

          if (savedInterval) {
            // Recurring task (or a session started before check-ins were tracked
            // separately): everything booked on it right now is a focus check-in.
            const ownIds = Array.isArray(focusTask.onesignal_notification_ids) ? focusTask.onesignal_notification_ids : [];
            const toCancel = Array.from(new Set([...ownIds, ...checkinIds]));
            if (toCancel.length) await cancelOneSignal(toCancel);

            // Put back what the task actually had. Never invent an interval.
            const savedNext = focusTask.focus_mode_original_next_reminder;
            const nextStillAhead = !!savedNext && new Date(savedNext).getTime() > Date.now();
            await base44.asServiceRole.entities.Task.update(focusTaskId, {
              reminder_interval: savedInterval,
              focus_mode_original_interval: null,
              focus_mode_original_next_reminder: null,
              focus_mode_notification_ids: [],
              focus_mode_checkins_until: null,
              focus_mode_quiet_choice: null,
              focus_mode_quiet_ask_at: null,
              onesignal_notification_ids: [],
              last_scheduled_until: null,
              next_reminder: nextStillAhead ? savedNext : null
            });
          } else if (checkinIds.length) {
            // Smart-reminder or one-time task: cancel the check-ins, touch nothing else.
            await cancelOneSignal(checkinIds);
            await base44.asServiceRole.entities.Task.update(focusTaskId, {
              focus_mode_notification_ids: [],
              focus_mode_checkins_until: null,
              focus_mode_quiet_choice: null,
              focus_mode_quiet_ask_at: null
            });
          } else {
            await base44.asServiceRole.entities.Task.update(focusTaskId, { focus_mode_checkins_until: null, focus_mode_quiet_choice: null, focus_mode_quiet_ask_at: null }).catch(() => {});
          }
        }
      }

      await base44.asServiceRole.entities.User.update(user.id, {
        focus_mode_task_id: null,
        focus_mode_entered_at: null
      });

      // Everything back to normal NOW, not at the next hourly run: the other
      // recurring reminders that went quiet on enter are booked again (the
      // refill job, scoped to this one account). Anna, Oct 13 2026: "then
      // everything goes back to normal".
      try {
        await base44.asServiceRole.functions.invoke('cronRefillReminders', { onlyEmail: user.email });
      } catch (e) {
        console.warn('[setFocusMode] could not rebook the other reminders right away; the hourly job will:', e);
      }

      return Response.json({ success: true, focusMode: false });
    }

    // The answer to the quiet-hours question. keep: the check-ins carry on
    // through quiet hours until the task is done — tonight's deferred ones are
    // replaced by hourly ones from now. morning: nothing to rebook; what is
    // booked already waits for the end of quiet hours.
    if (action === 'quiet') {
      const choice = body.choice === 'keep' ? 'keep' : 'morning';
      const focusTaskId = user.focus_mode_task_id;
      if (!focusTaskId) return Response.json({ success: false, error: 'not_in_focus' });
      const focusTask = await base44.asServiceRole.entities.Task.get(focusTaskId).catch(() => null);
      if (!focusTask) return Response.json({ success: false, error: 'task_missing' });
      if (choice === 'morning') {
        await base44.asServiceRole.entities.Task.update(focusTaskId, { focus_mode_quiet_choice: 'morning' });
        return Response.json({ success: true, choice });
      }
      const wasRecurring = !!focusTask.focus_mode_original_interval; // a recurring task's session keeps its check-ins in both id lists
      const oldIds = Array.from(new Set([
        ...(Array.isArray(focusTask.focus_mode_notification_ids) ? focusTask.focus_mode_notification_ids : []),
        ...(wasRecurring && Array.isArray(focusTask.onesignal_notification_ids) ? focusTask.onesignal_notification_ids : []),
      ]));
      if (oldIds.length) await cancelOneSignal(oldIds);
      const { ids, lastAt } = await bookCheckins(base44, user, focusTask, Date.now(), true);
      const patch: any = {
        focus_mode_quiet_choice: 'keep',
        focus_mode_notification_ids: ids,
        focus_mode_checkins_until: lastAt ? lastAt.toISOString() : new Date().toISOString(),
      };
      if (wasRecurring) {
        patch.onesignal_notification_ids = ids;
        patch.last_scheduled_until = lastAt ? lastAt.toISOString() : null;
        patch.next_reminder = new Date(Date.now() + FOCUS_MODE_INTERVAL_MS).toISOString();
      }
      await base44.asServiceRole.entities.Task.update(focusTaskId, patch);
      return Response.json({ success: true, choice, booked: ids.length });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[setFocusMode] Error:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}