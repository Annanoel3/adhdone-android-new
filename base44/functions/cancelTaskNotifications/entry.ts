// Re-saved Oct 13 2026 so the bundled shared/reminderTitle.ts is picked up: a timed event's alarm rings at its time (and "leave now"), its heads-ups stay pushes.
// Re-saved Oct 12 2026 (pets) so the bundled shared/reminderTitle.ts is picked up: a pet's birthday alarm has no "Write a text" button.
// Re-saved Oct 12 2026 so the bundled shared/reminderTitle.ts is picked up: a time
// they set inside quiet hours rings as an alarm (throughQuiet), RULES.md §9 Q4.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { ledgerCancel } from '../../shared/sendLedger.ts';
import { userTimeZone, resolveQuietHours } from '../../shared/quietHours.ts';
import { pushPhoneAlarms } from '../../shared/reminderTitle.ts';
import { judgeAlarmPairs } from '../../shared/runTaskParse.ts';

// ── Mode "later": a break the person asked for ───────────────────────────────
// Later on an alarm (or a reminder's notification) used to change nothing but a
// count. From Oct 6 2026 it gives the task a break: the first Later in a day,
// three hours; a second the same day, until their next morning, when their
// quiet hours end (never shorter
// than a break already running). Same rule as widgetBridge.js laterBreakUntil,
// which applies it when the app syncs; the phone (1.3.14+, LaterBreak) calls
// this the moment Later is tapped so it takes effect with the app closed.
// Here: the task's booked pushes inside the break are cancelled (found in the
// send ledger, which has every booked push with its time), a rhythm's next ping
// moves to the break's end, the nudge planner is told its plan is out of date,
// and the phone gets the task's alarm list without the break's alarms.
const LATER_BREAK_MS = 3 * 60 * 60 * 1000;
// A second Later's break ends at their morning: when their quiet hours end
// (08:00 unless they changed it), next one coming, never less than the
// three hours a first Later gives.

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
// Each pass moves the guess by how far its wall clock is from the one wanted.
// (Until Oct 10 2026 the second pass measured against the guess instead of the
// wanted time and added the zone offset twice: a second Later in Austin ran
// to 1 PM the next day instead of 8 AM.)
function atZoneTime(y: number, m: number, d: number, hour: number, timeZone: string, minute = 0): number {
  const want = Date.UTC(y, m - 1, d, hour, minute, 0);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const z = zoneParts(guess, timeZone);
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s);
    guess += (want - asUtc);
  }
  return guess;
}

// Due today: its due date falls on today in their time zone ("by end of today",
// "by 5", "today"), or, with no due date, the time they set for it does ("walk
// the dog at 8:20").
function dueToday(task: any, timeZone: string, nowMs: number): boolean {
  const raw = task?.due_date ? String(task.due_date) : (task?.event_time ? String(task.event_time) : '');
  if (!raw) return false;
  if (raw.length <= 10) return raw === zoneDateKey(nowMs, timeZone);
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + 'Z');
  return Number.isFinite(ms) && zoneDateKey(ms, timeZone) === zoneDateKey(nowMs, timeZone);
}

function laterBreakUntil(task: any, timeZone: string, nowMs: number, owner: any): number {
  // A task due today doesn't count for the Later rules (Anna, Oct 11 2026,
  // after a second Later at 3:19 PM sent "Go to PetSmart", due by the end of
  // the day, to the next morning): no break. Later only says "not this
  // minute"; Smart Reminders decides when it comes back today. The same for
  // an urgent task, whatever its date (Anna, Oct 11 2026: "urgent tasks should
  // maybe not get long breaks after pressing later").
  if (task?.urgency === 'urgent' || dueToday(task, timeZone, nowMs)) return nowMs;
  const prevMs = task?.later_until ? new Date(task.later_until).getTime() : NaN;
  const today = zoneDateKey(nowMs, timeZone);
  // A break already given today (it ends today or later): this one runs
  // until tomorrow morning.
  const secondToday = Number.isFinite(prevMs) && zoneDateKey(prevMs, timeZone) >= today;
  let until: number;
  if (secondToday) {
    // Their next morning (Anna, Oct 10 2026: not everyone's quiet hours end at
    // 8): a Later at 2 PM comes back tomorrow morning, one at 1 AM this
    // morning; one so close to their morning that it's under three hours away
    // gets the three hours instead (never a whole day). It comes back as an ordinary
    // task: Smart Reminders weighs it against everything else by priority, so
    // it doesn't jump ahead of more urgent things (a repeating ping it already
    // had resumes then, at its own pace).
    const endMin = resolveQuietHours(owner).endMin;
    until = NaN;
    for (const dayOffset of [0, 1, 2]) {
      const z = zoneParts(nowMs + dayOffset * 24 * 60 * 60 * 1000, timeZone);
      const at = atZoneTime(z.y, z.m, z.d, Math.floor(endMin / 60), timeZone, endMin % 60);
      if (at > nowMs) { until = Math.max(at, nowMs + LATER_BREAK_MS); break; }
    }
    if (!Number.isFinite(until)) until = nowMs + LATER_BREAK_MS;
  } else {
    until = nowMs + LATER_BREAK_MS;
  }
  if (Number.isFinite(prevMs) && prevMs > until) until = prevMs;
  return until;
}

// When the phone says the tap happened (build 39 sends it, since a tap made
// with no signal arrives later): trusted within the last 3 days, never ahead.
function tapTime(body: any, nowMs: number): number {
  const at = Number(body?.at);
  return Number.isFinite(at) && at > nowMs - 3 * 24 * 60 * 60 * 1000 && at <= nowMs + 60 * 1000 ? Math.min(at, nowMs) : nowMs;
}

async function applyLaterBreak(base44: any, task: any, body: any, appId: string, restKey: string) {
  const nowMs = Date.now();
  // The phone's report queue retries until it hears back: a Later already
  // applied is answered again, never applied twice (a second Later the same
  // day means "until tomorrow morning").
  const reportId = typeof body?.report_id === 'string' ? body.report_id.slice(0, 64) : '';
  const seenIds: string[] = Array.isArray(task.alarm_report_ids) ? task.alarm_report_ids : [];
  if (reportId && seenIds.includes(reportId)) {
    return { success: true, taskId: task.id, later_until: task.later_until || null, duplicate: true };
  }
  const owners = await base44.asServiceRole.entities.User.filter({ email: task.created_by }).catch(() => []);
  const owner = owners?.[0] || null;
  const timeZone = (typeof body?.timezone === 'string' && body.timezone.trim()) || userTimeZone(owner);
  const untilMs = laterBreakUntil(task, timeZone, tapTime(body, nowMs), owner);
  // No break (a task due today): nothing is cancelled or moved.
  const noBreak = untilMs <= nowMs;
  const isRhythm = !noBreak && !!task.reminder_interval && task.reminder_interval !== 'once';

  // Which booked pushes fall inside the break (a rhythm: every live ping — the
  // refill books a fresh run from the break's end).
  let rows: any[] = [];
  try {
    rows = (await base44.asServiceRole.entities.NotificationLedger.filter({ task_id: task.id }, '-send_at', 200)) || [];
  } catch (_) { rows = []; }
  const dropIds = new Set<string>();
  for (const r of rows) {
    const at = new Date(r?.send_at || 0).getTime();
    if (!noBreak && r?.notification_id && at > nowMs && (isRhythm || at < untilMs)) dropIds.add(String(r.notification_id));
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
  // (Only the ones still ahead leave the ledger; one already sent stays on
  // the record Smart Reminders budgets from — sendLedger.ledgerCancel.)
  if (dropIds.size) await ledgerCancel(base44, Array.from(dropIds));

  const fields: any = {
    later_count: (task.later_count || 0) + 1,
    later_until: new Date(untilMs).toISOString(),
    last_alarm_choice: { choice: 'later', at: new Date(tapTime(body, nowMs)).toISOString(), until: new Date(untilMs).toISOString() },
  };
  if (reportId) fields.alarm_report_ids = [...seenIds, reportId].slice(-20);
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

// ── The phone's other reports (build 39 on, Base44Api.phoneReport) ─────────
// Anna, Oct 10 2026: "make sure nothing requires the user to open the app for
// something to update", and Smart Reminders sees "any choice made on an alarm
// (10 min, 30 min, 1 hour etc)". The phone sends each choice the moment it's
// made (retrying in the background without a connection):
//  - "alarm_choice": a snooze (and when it brings the reminder back), Stop, or
//    ringing out unanswered, on an alarm or a reminder's notification. Counted
//    once per report_id. The planner looks again on its next run.
//  - "pair": two alarms for different tasks at the same moment: one alarm
//    naming both, or the second waits 10 minutes? The model judges
//    (runTaskParse.judgeAlarmPairs); answers are kept on the person.
//  - "woke": "Notice when I wake up" is on and the phone was first unlocked
//    this morning at woke_at (WakeWatch on the phone).
// Only the signed-in person's own tasks and profile are touched.
const PAIR_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

function localDay(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

async function phoneReport(req: Request, body: any): Promise<Response> {
  const base44 = createClientFromRequest(req);
  let me: any = null;
  try { me = await base44.auth.me(); } catch { me = null; }
  if (!me?.email) return Response.json({ success: false, error: 'Sign in required' }, { status: 401 });
  const svc = base44.asServiceRole.entities;
  const email = String(me.email).toLowerCase();
  const owns = (t: any) => !!t && (String(t.created_by || '').toLowerCase() === email
    || String(t.notification_recipient_email || '').toLowerCase() === email);
  const owner = (await svc.User.filter({ email: me.email }, '-created_date', 1).catch(() => []))?.[0] || null;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const timeZone = (typeof body?.timezone === 'string' && body.timezone.trim()) || userTimeZone(owner);

  if (body.mode === 'woke') {
    const ms = Date.parse(String(body?.woke_at || ''));
    if (!Number.isFinite(ms) || ms > nowMs + 60 * 1000 || ms < nowMs - 24 * 60 * 60 * 1000) {
      return Response.json({ success: false, error: 'woke_at out of range' }, { status: 400 });
    }
    if (owner?.id) {
      await svc.User.update(owner.id, { woke_at: new Date(ms).toISOString(), smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso });
    }
    console.log(`[phoneReport] ${email} up at ${new Date(ms).toISOString()}`);
    return Response.json({ success: true });
  }

  if (body.mode === 'pair') {
    const asked = (Array.isArray(body?.pairs) ? body.pairs : []).slice(0, 20)
      .map((p: any) => ({ id: String(p?.id || ''), a: String(p?.a || ''), b: String(p?.b || '') }))
      .filter((p: any) => p.id && p.a && p.b && p.a !== p.b);
    const ids = [...new Set(asked.flatMap((p: any) => [p.a, p.b]))] as string[];
    const tasks: Record<string, any> = {};
    await Promise.all(ids.map(async (id) => {
      const t = await svc.Task.get(id).catch(() => null);
      if (owns(t)) tasks[id] = t;
    }));
    const cache: Record<string, any> = { ...(owner?.alarm_pairs || {}) };
    const answers: Record<string, { together: boolean }> = {};
    const toJudge: any[] = [];
    for (const p of asked) {
      if (!tasks[p.a] || !tasks[p.b]) continue;
      const hit = cache[p.id];
      if (hit && typeof hit.together === 'boolean' && nowMs - Date.parse(hit.at || '') < PAIR_KEEP_MS) {
        answers[p.id] = { together: hit.together };
        continue;
      }
      const show = (t: any) => ({ title: t.title, said: t.original_input || null, urgency: t.urgency || null, location: t.location || null });
      toJudge.push({ id: p.id, a: show(tasks[p.a]), b: show(tasks[p.b]) });
    }
    if (toJudge.length) {
      const got = await judgeAlarmPairs(toJudge).catch((e) => { console.error('[phoneReport] pair judgment failed:', e?.message || e); return {} as any; });
      for (const [id, v] of Object.entries(got as Record<string, any>)) {
        answers[id] = { together: v.together };
        cache[id] = { together: v.together, why: v.why || null, at: nowIso };
      }
      if (owner?.id && Object.keys(got).length) {
        const kept = Object.entries(cache)
          .filter(([, v]: any) => nowMs - Date.parse(v?.at || '') < PAIR_KEEP_MS)
          .sort((x: any, y: any) => Date.parse(y[1]?.at || '') - Date.parse(x[1]?.at || ''))
          .slice(0, 200);
        await svc.User.update(owner.id, { alarm_pairs: Object.fromEntries(kept) }).catch(() => {});
      }
    }
    return Response.json({ success: true, answers });
  }

  // "alarm_choice"
  const task = await svc.Task.get(String(body?.task_id || '')).catch(() => null);
  if (!task) return Response.json({ success: false, error: 'Task not found' }, { status: 404 });
  if (!owns(task)) return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
  const reportId = typeof body?.report_id === 'string' ? body.report_id.slice(0, 64) : '';
  const seenIds: string[] = Array.isArray(task.alarm_report_ids) ? task.alarm_report_ids : [];
  if (reportId && seenIds.includes(reportId)) return Response.json({ success: true, duplicate: true });
  const choice = String(body?.choice || '');
  if (!['snooze', 'dismiss', 'ignored', 'closed'].includes(choice)) {
    return Response.json({ success: false, error: 'unknown choice' }, { status: 400 });
  }
  const atMs = tapTime(body, nowMs);
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(Number(body?.minutes) || 0)));
  const untilMs = Number(body?.until);
  // Home or Back on the alarm screen while it rang (build 40 on): 'closed'
  // with how = 'home' | 'back' | 'closed' (the screen went away some other
  // way), or a 'snooze' with how set when Home or Back rang it again in 10
  // minutes (a time they set inside quiet hours). Anna, Oct 12 2026.
  const how = ['home', 'back', 'closed'].includes(String(body?.how || '')) ? String(body.how) : null;
  const fields: any = {
    last_alarm_choice: {
      choice,
      at: new Date(atMs).toISOString(),
      minutes: choice === 'snooze' ? minutes : null,
      until: choice === 'snooze' && Number.isFinite(untilMs) && untilMs > 0 ? new Date(untilMs).toISOString() : null,
      ...(how ? { how } : {}),
    },
  };
  if (reportId) fields.alarm_report_ids = [...seenIds, reportId].slice(-20);
  if (choice === 'snooze') {
    fields.snooze_count = (task.snooze_count || 0) + 1;
    fields.consecutive_snoozes = (task.consecutive_snoozes || 0) + 1;
    if (Number.isFinite(untilMs) && untilMs > nowMs && untilMs < nowMs + 24 * 60 * 60 * 1000) {
      fields.snoozed_until = new Date(untilMs).toISOString();
    }
  } else {
    if (choice === 'dismiss') fields.dismissed_count = (task.dismissed_count || 0) + 1;
    if (choice === 'ignored') fields.ignored_count = (task.ignored_count || 0) + 1;
    if (choice === 'closed') fields.closed_count = (task.closed_count || 0) + 1;
    // The ring that just ended was the snooze coming back: that snooze is over.
    const snoozeMs = Date.parse(task.snoozed_until || '');
    if (Number.isFinite(snoozeMs) && snoozeMs <= nowMs + 2 * 60 * 1000) fields.snoozed_until = null;
  }
  await svc.Task.update(task.id, fields);
  if (owner?.id) {
    const userFields: any = { smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso };
    // The first time today they did something with a reminder: a sign they're
    // up (an alarm ringing out unanswered is not).
    const firstMs = Date.parse(owner.day_first_sign_at || '');
    if (choice !== 'ignored' && !(Number.isFinite(firstMs) && localDay(firstMs, timeZone) === localDay(atMs, timeZone))) {
      userFields.day_first_sign_at = new Date(atMs).toISOString();
    }
    await svc.User.update(owner.id, userFields).catch(() => {});
  }
  console.log(`[phoneReport] ${choice}${choice === 'snooze' ? ` ${minutes} min` : ''} on task ${task.id}`);
  return Response.json({ success: true });
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    if (body?.mode === 'alarm_choice' || body?.mode === 'pair' || body?.mode === 'woke') {
      return await phoneReport(req, body);
    }
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

    // Clear the notification IDs, reminder_schedule, and last_scheduled_until from the task.
    // mode "drop_rhythm" (admin only) also turns an every-X rhythm into a single
    // reminder at the task's time; its wish is still there for the nudge planner
    // to keep at them. Used Oct 7 2026 to take "Take Pills" off hourly pings.
    const dropRhythm = body?.mode === 'drop_rhythm' && me?.role === 'admin';
    await base44.asServiceRole.entities.Task.update(taskId, {
      onesignal_notification_ids: [],
      reminder_schedule: [],
      last_scheduled_until: null,
      ...(dropRhythm ? { reminder_interval: 'once' } : {}),
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