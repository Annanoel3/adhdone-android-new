import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isInQuietHours, localMinutesOfDay, resolveQuietHours, userTimeZone } from '../../shared/quietHours.ts';
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

// The next moment the owner's clock reads `targetMin` minutes into the day,
// strictly after `fromMs` (null if that minute never comes round in a day).
function nextLocalMinuteMs(fromMs: number, targetMin: number, timeZone: string): number | null {
  const base = Math.floor(fromMs / 60000) * 60000 + 60000;
  for (let i = 0; i <= 24 * 60; i++) {
    const t = base + i * 60000;
    if (localMinutesOfDay(new Date(t), timeZone) === targetMin) return t;
  }
  return null;
}

// Books the hourly "how's it going?" check-ins from `fromMs`, up to six, and
// returns their ids with the last one's time. A slot inside quiet hours is
// simply dropped — quiet hours start, nothing asks anyone to stay up (Anna,
// Oct 13 2026) — and the morning question (bookMorningQuestion) picks the
// session back up at their end.
async function bookCheckins(base44: any, user: any, focusTask: any, fromMs: number) {
  const { enabled: quietEnabled, startMin, endMin } = resolveQuietHours(user);
  const timeZone = userTimeZone(user);
  const useQuiet = quietEnabled && focusTask.quiet_hours_exempt !== true;
  const now = Date.now();
  const slots: Date[] = [];
  let scheduleTime = fromMs + FOCUS_MODE_INTERVAL_MS;
  for (let i = 0; i < 6; i++, scheduleTime += FOCUS_MODE_INTERVAL_MS) {
    const sendAt = new Date(scheduleTime);
    if (useQuiet && isInQuietHours(sendAt, startMin, endMin, timeZone)) continue;
    if (sendAt.getTime() <= now) continue;
    slots.push(sendAt);
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

// The morning question (Anna, Oct 13 2026): quiet hours just start — the
// check-ins stop for the night and nothing asks anyone to stay up — and at
// the END of quiet hours one push asks whether to pick the session back up:
// "Good morning — pick up "laundry" where you left off?" A tap opens the app
// on that choice (FocusModePrompt): continue (a fresh run of check-ins until
// quiet hours, and the same question the next morning) or let it go (Focus
// Mode ends, everything back to normal). Unanswered, the session ends on its
// own (cronRefillReminders) — Anna, Oct 14 2026: "ignored morning ends focus
// mode" — but the offer stands until quiet hours start again (`until`), so
// opening the app that day still asks the question. Booked for the next end
// of quiet hours; cancelled with the session like every other push on it.
async function bookMorningQuestion(base44: any, user: any, focusTask: any) {
  if (focusTask.quiet_hours_exempt === true) return null;
  const { enabled, startMin, endMin } = resolveQuietHours(user);
  if (!enabled || startMin === endMin) return null;
  const timeZone = userTimeZone(user);
  const now = Date.now();
  let endMs = nextLocalMinuteMs(now, endMin, timeZone);
  // A session started in the last half hour of quiet hours is a morning
  // session, not a night one: its question is for tomorrow morning.
  if (endMs && endMs - now < 30 * 60000) endMs = nextLocalMinuteMs(endMs, endMin, timeZone);
  if (!endMs) return null;
  const untilMs = nextLocalMinuteMs(endMs, startMin, timeZone);
  const sendAt = new Date(endMs);
  try {
    const res = await base44.asServiceRole.functions.invoke('schedulePush', {
      internalKey: Deno.env.get('CRON_SECRET'),
      toUserExternalId: user.email,
      title: 'Good morning ☀️',
      body: `Pick up "${(focusTask.title || '').trim() || 'your task'}" where you left off? Tap to continue your focus session, or let it go for now.`,
      sendAtISO: sendAt.toISOString(),
      data: { screen: '/Home', taskId: focusTask.id, type: 'focus_morning', focus: true },
    });
    const r = res?.data || res;
    return r?.notificationId ? { id: String(r.notificationId), sendAt, until: untilMs ? new Date(untilMs) : null } : null;
  } catch (e) {
    console.error('[setFocusMode] Failed to book the morning question:', e);
    return null;
  }
}

// One run of a session: the check-ins until quiet hours, then the morning
// question. Returns everything the task and profile need to remember it.
async function bookSession(base44: any, user: any, focusTask: any, fromMs: number) {
  const { ids: checkinIds, lastAt } = await bookCheckins(base44, user, focusTask, fromMs);
  const quietAsk = await bookMorningQuestion(base44, user, focusTask);
  if (quietAsk) checkinIds.push(quietAsk.id);
  return { checkinIds, lastAt, quietAsk };
}

// The morning offer on the profile: which task, from when (the end of quiet
// hours, when the push goes out) until when (the next start of quiet hours).
// The app shows the question inside that window; nothing booked = no offer.
function offerPatch(focusTask: any, quietAsk: any) {
  return {
    focus_mode_offer_task_id: quietAsk ? focusTask.id : null,
    focus_mode_offer_from: quietAsk ? quietAsk.sendAt.toISOString() : null,
    focus_mode_offer_until: quietAsk?.until ? quietAsk.until.toISOString() : null,
  };
}

// Enter: Focus Mode on `focusTask` for `user` — the hourly check-ins, the
// morning question, and every other recurring reminder of theirs silenced.
async function enterFocus(base44: any, user: any, focusTask: any, startedAt: string | null) {
  const taskId = focusTask.id;
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

  // The six hourly check-ins (bookCheckins: none inside quiet hours), then
  // the morning question for the end of quiet hours.
  const now = Date.now();
  const { checkinIds, lastAt: lastScheduledAt, quietAsk } = await bookSession(base44, user, focusTask, now);

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
      focus_mode_quiet_ask_at: quietAsk ? quietAsk.sendAt.toISOString() : null
    });
  }

  await base44.asServiceRole.entities.User.update(user.id, offerPatch(focusTask, quietAsk));

  // ── Non-focus recurring tasks: silence until Focus Mode ends ──
  const tasks = await base44.asServiceRole.entities.Task.filter({
    notification_recipient_email: user.email,
    status: 'active'
  }, '-updated_date', 500);

  const recurring = tasks.filter((t: any) =>
    t.reminder_interval && t.reminder_interval !== 'once' && t.id !== taskId
  );

  // All at once, not one task after another.
  await Promise.all(recurring.map(async (t: any) => {
    const ids = Array.isArray(t.onesignal_notification_ids) ? t.onesignal_notification_ids : [];
    if (ids.length) await cancelOneSignal(ids);
    await base44.asServiceRole.entities.Task.update(t.id, {
      onesignal_notification_ids: [],
      last_scheduled_until: null
    });
  }));
}

// Exit: the session's pushes cancelled, the task put back exactly as it was,
// the profile cleared, the other reminders back right away. `keepOffer`
// (the hourly job ending an unanswered morning question) leaves the morning
// offer on the profile so the app can still ask that day.
async function exitFocus(base44: any, user: any, keepOffer: boolean) {
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
          focus_mode_quiet_ask_at: null
        });
      } else {
        await base44.asServiceRole.entities.Task.update(focusTaskId, { focus_mode_checkins_until: null, focus_mode_quiet_ask_at: null }).catch(() => {});
      }
    }
  }

  await base44.asServiceRole.entities.User.update(user.id, {
    focus_mode_task_id: null,
    focus_mode_entered_at: null,
    ...(keepOffer ? {} : offerPatch(null, null))
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
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action, taskId } = body;

    // The app's own backend (cronRefillReminders ending a session whose
    // morning question went unanswered) proves itself with CRON_SECRET and
    // names the owner; it may only exit. Never log the key or the email.
    const internalKey = Deno.env.get('CRON_SECRET')?.trim();
    const presentedKey = typeof body.internalKey === 'string' ? body.internalKey.trim() : '';
    const isInternal = !!internalKey && presentedKey === internalKey && typeof body.email === 'string' && !!body.email.trim();
    let user: any = null;
    if (isInternal) {
      if (action !== 'exit') return Response.json({ error: 'Internal callers may only exit' }, { status: 403 });
      const rows = await base44.asServiceRole.entities.User.filter({ email: body.email.trim() }, '-updated_date', 1).catch(() => []);
      user = Array.isArray(rows) ? rows[0] : null;
    } else {
      user = await base44.auth.me();
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

      await enterFocus(base44, user, focusTask, startedAt);
      return Response.json({ success: true, focusMode: true, taskId });
    }

    if (action === 'exit') {
      await exitFocus(base44, user, isInternal && body.keepOffer === true);
      return Response.json({ success: true, focusMode: false });
    }

    // "Continue" on the morning question. Still in focus (answered before the
    // hourly job ended the session): the check-ins resume now and tomorrow's
    // question is booked. Already ended: a fresh session on the same task —
    // the push and the in-app question both offered exactly that, so a late
    // tap is honoured too (check-ins never land in quiet hours anyway). "Let
    // it go" is a plain exit, which the app sends as action: 'exit'.
    if (action === 'morning') {
      const inFocusId = user.focus_mode_task_id || null;
      const offerId = user.focus_mode_offer_task_id || null;
      const wantedId = (typeof taskId === 'string' && taskId) || inFocusId || offerId;
      if (!wantedId) return Response.json({ success: false, error: 'not_in_focus' });
      const focusTask = await base44.asServiceRole.entities.Task.get(wantedId).catch(() => null);
      if (!focusTask) return Response.json({ success: false, error: 'task_missing' });
      const email = String(user.email || '').toLowerCase();
      const theirs = [focusTask.notification_recipient_email, focusTask.created_by].some((e) => String(e || '').toLowerCase() === email);
      if (!theirs) return Response.json({ success: false, error: 'not_your_task' }, { status: 403 });
      if (focusTask.status !== 'active') return Response.json({ success: false, error: 'task_done' });

      if (inFocusId && inFocusId === focusTask.id) {
        const wasRecurring = !!focusTask.focus_mode_original_interval; // a recurring task's session keeps its check-ins in both id lists
        const { checkinIds: ids, lastAt, quietAsk } = await bookSession(base44, user, focusTask, Date.now());
        const prior = Array.isArray(focusTask.focus_mode_notification_ids) ? focusTask.focus_mode_notification_ids : [];
        const patch: any = {
          focus_mode_notification_ids: [...prior, ...ids],
          focus_mode_checkins_until: lastAt ? lastAt.toISOString() : new Date().toISOString(),
          focus_mode_quiet_ask_at: quietAsk ? quietAsk.sendAt.toISOString() : null,
        };
        if (wasRecurring) {
          patch.onesignal_notification_ids = [...(Array.isArray(focusTask.onesignal_notification_ids) ? focusTask.onesignal_notification_ids : []), ...ids];
          patch.last_scheduled_until = lastAt ? lastAt.toISOString() : null;
          patch.next_reminder = new Date(Date.now() + FOCUS_MODE_INTERVAL_MS).toISOString();
        }
        await base44.asServiceRole.entities.Task.update(focusTask.id, patch);
        await base44.asServiceRole.entities.User.update(user.id, offerPatch(focusTask, quietAsk));
        return Response.json({ success: true, focusMode: true, taskId: focusTask.id, booked: ids.length });
      }
      if (inFocusId) return Response.json({ success: false, error: 'other_focus' }); // focusing on something else by now
      await enterFocus(base44, user, focusTask, null);
      return Response.json({ success: true, focusMode: true, taskId: focusTask.id });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[setFocusMode] Error:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
