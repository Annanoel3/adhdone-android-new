import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { adjustForQuietHours, parseHHMM, localMinutesOfDay } from '../../shared/quietHours.ts';
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

      // Owner quiet hours (applied to the focus check-in batch)
      const quietEnabled = !!(user && user.quiet_hours_enabled);
      const timeZone = user && user.timezone ? user.timezone : null;
      const startMin = user && user.quiet_hours_start ? parseHHMM(user.quiet_hours_start) : parseHHMM('22:00');
      const endMin = user && user.quiet_hours_end ? parseHHMM(user.quiet_hours_end) : parseHHMM('08:00');
      const useQuiet = quietEnabled && !!timeZone;

      const now = Date.now();
      const checkinIds: string[] = [];
      let lastScheduledAt: Date | null = null;
      let scheduleTime = now + FOCUS_MODE_INTERVAL_MS;

      // Work out the six check-in moments first (the quiet-hours shuffle needs
      // them in order), then book them all at once — six pushes one after the
      // other was most of the wait behind "Keep going" and liftoff.
      const slots: Date[] = [];
      let lastPlanned: Date | null = null;
      for (let i = 0; i < 6; i++) {
        let sendAt = new Date(scheduleTime);
        if (useQuiet) {
          sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
          if (localMinutesOfDay(sendAt, timeZone) === endMin) { scheduleTime += FOCUS_MODE_INTERVAL_MS; continue; }
          if (lastPlanned && Math.abs(sendAt.getTime() - lastPlanned.getTime()) < 60000) { scheduleTime += FOCUS_MODE_INTERVAL_MS; continue; }
        }
        if (sendAt.getTime() <= now) { scheduleTime += FOCUS_MODE_INTERVAL_MS; continue; }
        slots.push(sendAt);
        lastPlanned = sendAt;
        scheduleTime += FOCUS_MODE_INTERVAL_MS;
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
            data: { screen: '/TaskNotification', taskId, urgency: focusTask.urgency || 'medium', type: 'task_reminder', focus: true },
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
      for (const b of booked) {
        if (!b) continue;
        checkinIds.push(b.id);
        lastScheduledAt = b.sendAt;
      }

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
          onesignal_notification_ids: checkinIds,
          last_scheduled_until: newLastScheduledUntil,
          next_reminder: new Date(now + FOCUS_MODE_INTERVAL_MS).toISOString()
        });
      } else {
        // Smart-reminder or one-time task: its interval, its date/time and its
        // own reminders are left exactly as they are. Only the check-ins are
        // tracked, in their own field, so exit can cancel them and nothing else.
        await base44.asServiceRole.entities.Task.update(taskId, {
          focus_mode_notification_ids: checkinIds
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
              onesignal_notification_ids: [],
              last_scheduled_until: null,
              next_reminder: nextStillAhead ? savedNext : null
            });
          } else if (checkinIds.length) {
            // Smart-reminder or one-time task: cancel the check-ins, touch nothing else.
            await cancelOneSignal(checkinIds);
            await base44.asServiceRole.entities.Task.update(focusTaskId, {
              focus_mode_notification_ids: []
            });
          }
        }
      }

      await base44.asServiceRole.entities.User.update(user.id, {
        focus_mode_task_id: null,
        focus_mode_entered_at: null
      });

      return Response.json({ success: true, focusMode: false });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[setFocusMode] Error:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}