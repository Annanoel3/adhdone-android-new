import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { ledgerCancel } from '../../shared/sendLedger.ts';
import { userTimeZone } from '../../shared/quietHours.ts';
import { pushPhoneAlarms } from '../../shared/reminderTitle.ts';

// ── Mode "later": a break the person asked for ───────────────────────────────
// Later on an alarm (or a reminder's notification) used to change nothing but a
// count. From Oct 6 2026 it gives the task a break: the first Later in a day,
// three hours; a second the same day, until tomorrow morning (never shorter
// than a break already running). Same rule as widgetBridge.js laterBreakUntil,
// which applies it when the app syncs; the phone (1.3.14+, LaterBreak) calls
// this the moment Later is tapped so it takes effect with the app closed.
// Here: the task's booked pushes inside the break are cancelled (found in the
// send ledger, which has every booked push with its time), a rhythm's next ping
// moves to the break's end, the nudge planner is told its plan is out of date,
// and the phone gets the task's alarm list without the break's alarms.
const LATER_BREAK_MS = 3 * 60 * 60 * 1000;
const LATER_MORNING_HOUR = 8;

function zoneParts(ms: number, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const g: Record<string, string> = {};
  for (const x of p) g[x.type] = x.value;
  return { y: Number(g.year), m: Number(g.month), d: Number(g.day), h: Number(g.hour), min: Number(g.minute), s: Number(g.second) };
}
function zoneDateKey(ms: number, timeZone: string): string {
  const z = zoneParts(ms, timeZone);
  return `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
}
// The instant of a wall-clock time in a zone (good to the minute across DST).
function atZoneTime(y: number, m: number, d: number, hour: number, timeZone: string): number {
  let guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  for (let i = 0; i < 2; i++) {
    const z = zoneParts(guess, timeZone);
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s);
    guess -= (asUtc - guess);
  }
  return guess;
}

function laterBreakUntil(task: any, timeZone: string, nowMs: number): number {
  const prevMs = task?.later_until ? new Date(task.later_until).getTime() : NaN;
  const today = zoneDateKey(nowMs, timeZone);
  // A break already given today (it ends today or later): this one runs
  // until tomorrow morning.
  const secondToday = Number.isFinite(prevMs) && zoneDateKey(prevMs, timeZone) >= today;
  let until: number;
  if (secondToday) {
    const z = zoneParts(nowMs + 24 * 60 * 60 * 1000, timeZone);
    until = atZoneTime(z.y, z.m, z.d, LATER_MORNING_HOUR, timeZone);
  } else {
    until = nowMs + LATER_BREAK_MS;
  }
  if (Number.isFinite(prevMs) && prevMs > until) until = prevMs;
  return until;
}

async function applyLaterBreak(base44: any, task: any, body: any, appId: string, restKey: string) {
  const nowMs = Date.now();
  const owners = await base44.asServiceRole.entities.User.filter({ email: task.created_by }).catch(() => []);
  const owner = owners?.[0] || null;
  const timeZone = (typeof body?.timezone === 'string' && body.timezone.trim()) || userTimeZone(owner);
  const untilMs = laterBreakUntil(task, timeZone, nowMs);
  const isRhythm = !!task.reminder_interval && task.reminder_interval !== 'once';

  // Which booked pushes fall inside the break (a rhythm: every live ping — the
  // refill books a fresh run from the break's end).
  let rows: any[] = [];
  try {
    rows = (await base44.asServiceRole.entities.NotificationLedger.filter({ task_id: task.id }, '-send_at', 200)) || [];
  } catch (_) { rows = []; }
  const dropIds = new Set<string>();
  for (const r of rows) {
    const at = new Date(r?.send_at || 0).getTime();
    if (r?.notification_id && at > nowMs && (isRhythm || at < untilMs)) dropIds.add(String(r.notification_id));
  }
  for (const e of (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : [])) {
    const at = new Date(e?.send_at || 0).getTime();
    if (e?.notification_id && !String(e.notification_id).startsWith('planned_') && at > nowMs && at < untilMs) dropIds.add(String(e.notification_id));
  }
  let cancelled = 0;
  for (const id of dropIds) {
    try {
      const res = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
        method: 'DELETE', headers: { 'Authorization': `Basic ${restKey}` },
      });
      if (res.ok) cancelled++;
    } catch (_) { /* a push that already went is nothing to cancel */ }
  }
  if (dropIds.size) await ledgerCancel(base44, Array.from(dropIds));

  const fields: any = {
    later_count: (task.later_count || 0) + 1,
    later_until: new Date(untilMs).toISOString(),
  };
  const ids = (task.onesignal_notification_ids || []).filter((id: string) => !dropIds.has(String(id)));
  if (ids.length !== (task.onesignal_notification_ids || []).length) fields.onesignal_notification_ids = ids;
  const schedule = (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : []).filter((e: any) => !(e?.notification_id && dropIds.has(String(e.notification_id))));
  if (schedule.length !== (task.reminder_schedule || []).length) fields.reminder_schedule = schedule;
  if (isRhythm) {
    fields.onesignal_notification_ids = [];
    fields.last_scheduled_until = null;
    fields.next_reminder = new Date(untilMs).toISOString();
  } else if (task.next_reminder) {
    const nr = new Date(task.next_reminder).getTime();
    if (nr > nowMs && nr < untilMs) fields.next_reminder = new Date(untilMs).toISOString();
  }
  await base44.asServiceRole.entities.Task.update(task.id, fields);

  // The planner looks again (with the break on the task's line) on its next run.
  if (owner?.id) {
    const nowIso = new Date(nowMs).toISOString();
    await base44.asServiceRole.entities.User.update(owner.id, { smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso }).catch(() => {});
  }
  // The phone's copy of the task's alarms, without the break's.
  if (owner) {
    await pushPhoneAlarms({ ...task, ...fields }, owner, { before: task, changedAt: nowMs, source: 'laterBreak' });
  }
  console.log(`[cancelTaskNotifications] Later break for task ${task.id} until ${fields.later_until}: ${cancelled} push(es) cancelled`);
  return { success: true, taskId: task.id, later_until: fields.later_until, canceledCount: cancelled };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { taskId } = body || {};

    if (!taskId) {
      return Response.json({ 
        success: false, 
        error: 'taskId required' 
      }, { status: 400 });
    }

    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return Response.json({ 
        success: false, 
        error: 'OneSignal credentials missing' 
      }, { status: 500 });
    }

    const base44 = createClientFromRequest(req);

    // Who's asking. Only the task's owner (or its reminder recipient), an app
    // admin, or the app's own backend (the internal key) may cancel a task's
    // reminders. Anyone holding a task id used to be able to silence it.
    const internalKey = Deno.env.get('CRON_SECRET')?.trim();
    const presentedKey = typeof body?.internalKey === 'string' ? body.internalKey.trim() : '';
    const isInternal = !!internalKey && presentedKey === internalKey;
    let me: any = null;
    if (!isInternal) {
      try {
        me = await base44.auth.me();
      } catch {
        me = null;
      }
      if (!me?.email) {
        return Response.json({ success: false, error: 'Sign in required' }, { status: 401 });
      }
    }

    const task = await base44.asServiceRole.entities.Task.get(taskId);

    if (!task) {
      return Response.json({ 
        success: false, 
        error: 'Task not found' 
      }, { status: 404 });
    }

    if (!isInternal) {
      const email = String(me.email).toLowerCase();
      const allowed = email === String(task.created_by || '').toLowerCase() ||
        email === String(task.notification_recipient_email || '').toLowerCase() ||
        me.role === 'admin';
      if (!allowed) {
        console.warn('[cancelTaskNotifications] refused: caller does not own this task');
        return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
      }
    }

    // Later tapped on the task's alarm or reminder: a break, not a full cancel.
    if (body?.mode === 'later') {
      return Response.json(await applyLaterBreak(base44, task, body, ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY));
    }

    let canceledCount = 0;

    // Cancel all pending OneSignal notifications from onesignal_notification_ids
    if (task.onesignal_notification_ids && Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0) {
      console.log(`[cancelTaskNotifications] Canceling ${task.onesignal_notification_ids.length} notifications for task ${taskId}`);

      for (const notificationId of task.onesignal_notification_ids) {
        try {
          const url = `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
          });

          if (response.ok) {
            canceledCount++;
            console.log(`[cancelTaskNotifications] Successfully canceled notification ${notificationId}`);
          } else {
            console.warn(`[cancelTaskNotifications] Failed to cancel notification ${notificationId}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[cancelTaskNotifications] Error canceling notification ${notificationId}:`, error);
        }
      }
    }

    // Also cancel one-time/event reminders stored in reminder_schedule —
    // these are separate OneSignal notification IDs not tracked in
    // onesignal_notification_ids and would otherwise keep firing.
    if (task.reminder_schedule && Array.isArray(task.reminder_schedule) && task.reminder_schedule.length > 0) {
      console.log(`[cancelTaskNotifications] Canceling ${task.reminder_schedule.length} reminder_schedule entries for task ${taskId}`);

      for (const entry of task.reminder_schedule) {
        if (!entry?.notification_id) continue;
        try {
          const url = `https://onesignal.com/api/v1/notifications/${entry.notification_id}?app_id=${ONESIGNAL_APP_ID}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
          });

          if (response.ok) {
            canceledCount++;
            console.log(`[cancelTaskNotifications] Successfully canceled reminder_schedule notification ${entry.notification_id}`);
          } else {
            console.warn(`[cancelTaskNotifications] Failed to cancel reminder_schedule notification ${entry.notification_id}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[cancelTaskNotifications] Error canceling reminder_schedule notification ${entry.notification_id}:`, error);
        }
      }
    }

    await ledgerCancel(base44, [
      ...(task.onesignal_notification_ids || []),
      ...((task.reminder_schedule || []).map((e: any) => e?.notification_id)),
    ]);

    // Clear the notification IDs, reminder_schedule, and last_scheduled_until from the task
    await base44.asServiceRole.entities.Task.update(taskId, {
      onesignal_notification_ids: [],
      reminder_schedule: [],
      last_scheduled_until: null
    });

    console.log(`[cancelTaskNotifications] Cleared notification IDs for task ${taskId}`);

    return Response.json({ 
      success: true, 
      canceledCount: canceledCount,
      taskId: taskId
    });
  } catch (error) {
    console.error('[cancelTaskNotifications] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});