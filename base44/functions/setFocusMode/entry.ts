import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { adjustForQuietHours, parseHHMM, localMinutesOfDay } from '../../shared/quietHours.ts';
import { FOCUS_MODE_INTERVAL, FOCUS_MODE_INTERVAL_MS, getFocusModeContent } from '../../shared/focusMode.ts';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

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

      // ── Focus task: switch to hourly check-ins with focus-mode text ──
      const focusTask = await base44.asServiceRole.entities.Task.get(taskId);
      if (!focusTask) return Response.json({ error: 'Task not found' }, { status: 404 });

      const focusIds = Array.isArray(focusTask.onesignal_notification_ids) ? focusTask.onesignal_notification_ids : [];
      if (focusIds.length) await cancelOneSignal(focusIds);

      const originalInterval = focusTask.reminder_interval || 'daily';

      // Owner quiet hours (applied to the focus check-in batch)
      const quietEnabled = !!(user && user.quiet_hours_enabled);
      const timeZone = user && user.timezone ? user.timezone : null;
      const startMin = user && user.quiet_hours_start ? parseHHMM(user.quiet_hours_start) : parseHHMM('22:00');
      const endMin = user && user.quiet_hours_end ? parseHHMM(user.quiet_hours_end) : parseHHMM('08:00');
      const useQuiet = quietEnabled && !!timeZone;

      const now = Date.now();
      const notificationIds: string[] = [];
      let lastScheduledAt: Date | null = null;
      let scheduleTime = now + FOCUS_MODE_INTERVAL_MS;

      for (let i = 0; i < 6; i++) {
        let sendAt = new Date(scheduleTime);
        if (useQuiet) {
          sendAt = adjustForQuietHours(sendAt, startMin, endMin, timeZone);
          if (localMinutesOfDay(sendAt, timeZone) === endMin) { scheduleTime += FOCUS_MODE_INTERVAL_MS; continue; }
          if (lastScheduledAt && Math.abs(sendAt.getTime() - lastScheduledAt.getTime()) < 60000) { scheduleTime += FOCUS_MODE_INTERVAL_MS; continue; }
        }
        if (sendAt.getTime() <= now) { scheduleTime += FOCUS_MODE_INTERVAL_MS; continue; }
        const { title, body } = getFocusModeContent(focusTask.title);
        try {
          const res = await base44.asServiceRole.functions.invoke('schedulePush', {
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
          if (r?.notificationId) {
            notificationIds.push(r.notificationId);
            lastScheduledAt = sendAt;
          }
        } catch (e) {
          console.error('[setFocusMode] Failed to schedule focus check-in:', e);
        }
        scheduleTime += FOCUS_MODE_INTERVAL_MS;
      }

      const newLastScheduledUntil = lastScheduledAt
        ? lastScheduledAt.toISOString()
        : new Date(now + FOCUS_MODE_INTERVAL_MS * 6).toISOString();

      await base44.asServiceRole.entities.Task.update(taskId, {
        reminder_interval: FOCUS_MODE_INTERVAL,
        focus_mode_original_interval: originalInterval,
        onesignal_notification_ids: notificationIds,
        last_scheduled_until: newLastScheduledUntil,
        next_reminder: new Date(now + FOCUS_MODE_INTERVAL_MS).toISOString()
      });

      // ── Non-focus recurring tasks: silence until Focus Mode ends ──
      const tasks = await base44.asServiceRole.entities.Task.filter({
        notification_recipient_email: user.email,
        status: 'active'
      }, '-updated_date', 500);

      const recurring = tasks.filter(t =>
        t.reminder_interval && t.reminder_interval !== 'once' && t.id !== taskId
      );

      for (const t of recurring) {
        const ids = Array.isArray(t.onesignal_notification_ids) ? t.onesignal_notification_ids : [];
        if (ids.length) await cancelOneSignal(ids);
        await base44.asServiceRole.entities.Task.update(t.id, {
          onesignal_notification_ids: [],
          last_scheduled_until: null
        });
      }

      // ── Persist focus state on the user ──
      await base44.asServiceRole.entities.User.update(user.id, {
        focus_mode_task_id: taskId,
        focus_mode_entered_at: startedAt || new Date().toISOString()
      });

      return Response.json({ success: true, focusMode: true, taskId });
    }

    if (action === 'exit') {
      // Restore the focus task's original interval + clear its focus check-ins.
      const focusTaskId = user.focus_mode_task_id;
      if (focusTaskId) {
        const focusTask = await base44.asServiceRole.entities.Task.get(focusTaskId).catch(() => null);
        if (focusTask) {
          const ids = Array.isArray(focusTask.onesignal_notification_ids) ? focusTask.onesignal_notification_ids : [];
          if (ids.length) await cancelOneSignal(ids);
          const orig = focusTask.focus_mode_original_interval || focusTask.reminder_interval || 'daily';
          await base44.asServiceRole.entities.Task.update(focusTaskId, {
            reminder_interval: orig,
            focus_mode_original_interval: null,
            onesignal_notification_ids: [],
            last_scheduled_until: null,
            next_reminder: null
          });
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