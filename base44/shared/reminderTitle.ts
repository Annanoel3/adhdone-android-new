// Shared reminder title/body logic for recurring task notifications.
// Used by onTaskUpdate and cronRefillReminders so the wording stays consistent
// with the client-side reminderCopy helper: warm, deadline-aware, never a flat
// "Task Reminder — tap to mark as complete!".
//
// "Today", "tomorrow" and the weekday are worked out on the OWNER'S calendar
// (their timezone), the way the app shows them. They used to be compared as UTC
// dates, and a task captured as "due Friday" is saved as Friday 11:59 PM local,
// which is already Saturday in UTC — so a Friday-evening reminder said "due
// tomorrow" and named the wrong weekday for US users.
import { DEFAULT_TIME_ZONE, localDateKey, resolveQuietHours, isInQuietHours } from './quietHours.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Days since 1970 of the local calendar date — so two dates can be subtracted.
function localDay(iso: string, timeZone: string): number {
  const [y, m, d] = localDateKey(new Date(iso), timeZone).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function dayLabel(dueDay: number, daysAway: number): string {
  // dueDay counts days since 1970 on the owner's calendar, so reading it back
  // as a UTC date gives exactly that local date.
  const due = new Date(dueDay * DAY_MS);
  if (Math.abs(daysAway) < 7) return WEEKDAYS[due.getUTCDay()];
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Every body names the task. The body is the line people read in the
// notification (and the only line the dashboard lists), and it is what the
// spoken alarm reads out loud, so "no pressure, just a friendly nudge" on its
// own tells nobody what the reminder is for.
function sentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

export function getReminderContent(
  taskTitle: string | null | undefined,
  dueDateISO: string | null | undefined,
  sendAtISO: string,
  timeZone: string = DEFAULT_TIME_ZONE
): { title: string; body: string } {
  const title = (taskTitle || '').trim() || 'your task';
  const quoted = `"${title}"`;
  if (!dueDateISO) {
    // Only tasks with a rhythm the person asked for land here ("remind me at
    // 10 and keep reminding me until I do it"), so no "no pressure" — they
    // asked to be reminded.
    return { title: `📌 ${title}`, body: `Reminder: ${sentence(title)}` };
  }
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const dueDay = localDay(dueDateISO, tz);
  const days = dueDay - localDay(sendAtISO, tz);
  const label = dayLabel(dueDay, days);
  if (days < 0) {
    return { title: `⚠️ ${title}`, body: `${quoted} slipped past ${label}. No shame — just pick it back up when you can.` };
  }
  if (days === 0) {
    return { title: `📅 ${title}`, body: `${quoted} is due today — you've got this. Tap when it's done.` };
  }
  if (days === 1) {
    return { title: `Heads up: ${title}`, body: `${quoted} is due tomorrow — plenty of time to plan for it.` };
  }
  return { title: `Don't forget: ${title}`, body: `${quoted} is due ${label} — plenty of time to get it done.` };
}

// ---------------------------------------------------------------------------
// PHONE ALARMS, worked out on the server.
//
// The app hands the phone its alarm list every time it opens
// (alarmSetFor in src/components/utils/widgetBridge.js). A change made while
// the app is closed (a calendar event moving, a repeating reminder moving on
// to its next time, an edit made on another device, the server re-planning a
// task) used to leave the phone ringing at the old time until the app was
// next opened. So the server works out that ONE task's alarms by the very
// same rules and sends them to the phone in a silent push
// ("set_alarms_task"); phone builds from 1.3.10 replace what they hold for
// that task (AlarmScheduler.replaceTask). Older builds ignore it.
//
// KEEP THESE RULES IN STEP WITH alarmSetFor / reminderMomentsFor /
// ringsOutLoud in widgetBridge.js. The ids must match too
// (`${task.id}:${ms}`), so the app's next full sync keeps what this booked.

function alertStyleOf(task: any, owner: any): 'alarm' | 'notification' {
  if (task?.alert_style === 'alarm' || task?.alert_style === 'notification') return task.alert_style;
  return owner?.alarm_mode === 'alarm' ? 'alarm' : 'notification';
}

export function taskRingsAsAlarm(task: any, owner: any): boolean {
  return alertStyleOf(task, owner) === 'alarm';
}

function whenMs(v: any): number {
  if (!v) return NaN;
  return new Date(v).getTime();
}

// Which of a task's reminders ring out loud (see ringsOutLoud in widgetBridge.js).
// "Same day" is the owner's own calendar day.
function ringsOutLoudOn(task: any, momentMs: number, timeZone: string): boolean {
  const anchor = whenMs(task.event_time || task.due_date || task.next_reminder);
  if (isNaN(anchor)) return true;
  const day = (ms: number) => localDateKey(new Date(ms), timeZone);
  const momentDay = day(momentMs);
  const anchorDay = day(anchor);
  if (momentDay === anchorDay) return true;
  const isEvent = task.classification === 'event' || task.classification === 'birthday' || !!task.birthday_person;
  if (isEvent) return false;
  const start = whenMs(task.start_date);
  if (!isNaN(start) && momentDay >= day(start) && momentMs <= anchor) return true;
  if (!task.due_date && !task.event_time) return true;
  const pressing = task.urgency === 'high' || task.urgency === 'urgent';
  if (!pressing) return false;
  const isDeadline = task.deadline_style === 'by' || (!!task.due_date && !task.event_time && task.reminder_interval !== 'once');
  const pinnedLater = (!!task.event_time || !!task.due_date) && !isDeadline && momentDay < anchorDay;
  return !pinnedLater;
}

// Every moment a push is booked for this task, with that push's words
// (see reminderMomentsFor in widgetBridge.js).
function reminderMoments(task: any, timeZone: string): { at: number; heading: string; body: string }[] {
  const out = new Map<number, { at: number; heading: string; body: string }>();
  const schedule = (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : []).filter((r: any) => r && r.send_at);
  for (const r of schedule) {
    const t = whenMs(r.send_at);
    if (isNaN(t) || out.has(t)) continue;
    out.set(t, { at: t, heading: r.notification_title || '', body: r.notification_body || '' });
  }
  if (schedule.length === 0 && task.next_reminder && !task.day_only_task && task.deadline_style !== 'by') {
    const t = whenMs(task.next_reminder);
    if (!isNaN(t) && !out.has(t)) {
      const copy = getReminderContent(task.title, task.due_date, new Date(t).toISOString(), timeZone);
      out.set(t, { at: t, heading: copy.title || '', body: copy.body || '' });
    }
  }
  return Array.from(out.values());
}

// This task's upcoming alarms, exactly as the app would list them for the
// phone. Empty when it doesn't ring (finished, silenced, a step, not an alarm
// task, or nothing ahead outside quiet hours).
export function phoneAlarmsFor(task: any, owner: any, now: number = Date.now()): any[] {
  if (!task || !task.id || task.status !== 'active' || task.silenced || task.parent_task_id) return [];
  if (!taskRingsAsAlarm(task, owner)) return [];
  const timeZone = owner?.timezone || DEFAULT_TIME_ZONE;
  const quiet = resolveQuietHours(owner);
  const out: any[] = [];
  for (const m of reminderMoments(task, timeZone)) {
    if (m.at <= now) continue;
    if (quiet.enabled && isInQuietHours(new Date(m.at), quiet.startMin, quiet.endMin, timeZone)) continue;
    if (!ringsOutLoudOn(task, m.at, timeZone)) continue;
    const alarm: any = { id: `${task.id}:${m.at}`, at: m.at, title: task.title || 'Task', heading: m.heading, body: m.body };
    if (task.birthday_person && !task.is_own_birthday) {
      alarm.openLabel = task.birthday_text_message ? 'Send a text' : 'Write a text';
    }
    out.push(alarm);
  }
  return out.sort((a, b) => a.at - b.at);
}

// A push's data has to stay small (OneSignal and Google cap the whole push at
// about 4 KB), so the nearest alarms go and the rest follow on the next app
// open. The words are trimmed first if one alarm alone would not fit.
const ALARM_LIST_MAX_BYTES = 1800;

function alarmListJson(alarms: any[]): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const trim = (s: string, n: number) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
  const kept: any[] = [];
  for (const a of alarms) {
    let item = a;
    if (kept.length === 0 && bytes(JSON.stringify([a])) > ALARM_LIST_MAX_BYTES) {
      item = { ...a, title: trim(a.title, 80), heading: trim(a.heading, 100), body: trim(a.body, 200) };
    }
    if (bytes(JSON.stringify([...kept, item])) > ALARM_LIST_MAX_BYTES) break;
    kept.push(item);
  }
  return JSON.stringify(kept);
}

// A time as the platform stores it ("2026-09-25T04:30:39.123000", UTC with no
// zone letter) in milliseconds.
export function platformTimeMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
}

// Sends this task's alarms to the owner's phone when they changed. `before` is
// the task as it was (when known): nothing is sent when the alarm list did not
// change, and a task that stopped being an alarm task gets an empty list,
// which takes its alarms off the phone. `changedAt` is when the change was
// saved (server time); the phone ignores it if the app rebuilt its whole list
// after that. Never throws: a failure only means the phone waits for the next
// app open, as before.
export async function pushPhoneAlarms(
  task: any,
  owner: any,
  opts: { before?: any; changedAt?: number; source?: string } = {}
): Promise<'sent' | 'unchanged' | 'skipped' | 'failed'> {
  const source = opts.source || 'server';
  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
    const email = task?.created_by;
    if (!appId || !restKey || !email || !task?.id || !owner) return 'skipped';
    // Without the owner's own timezone, "which day" and quiet hours could be
    // worked out wrong; the app's own sync on open stays in charge then.
    if (!owner.timezone) return 'skipped';
    const before = opts.before || null;
    if (!taskRingsAsAlarm(task, owner) && !(before && taskRingsAsAlarm(before, owner))) return 'skipped';
    const now = Date.now();
    const after = phoneAlarmsFor(task, owner, now);
    if (before) {
      const was = phoneAlarmsFor({ ...before, id: task.id }, owner, now);
      if (JSON.stringify(was) === JSON.stringify(after)) return 'unchanged';
    }
    const changedAt = opts.changedAt && isFinite(opts.changedAt) ? opts.changedAt : now;
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Basic ${restKey}` },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [email],
        channel_for_external_user_ids: 'push',
        isAndroid: true,
        // A data-only push: no title or text, so nothing is shown. The name is
        // only for the OneSignal dashboard.
        name: "Silent: update a task's alarms on the phone",
        content_available: true,
        // High priority, or a sleeping phone may only get it after the old time rang.
        priority: 10,
        // Six hours. A late copy is harmless: the phone keeps the newest list.
        ttl: 6 * 60 * 60,
        data: { set_alarms_task: task.id, alarms: alarmListJson(after), changed_at: changedAt },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[phoneAlarms:${source}] push failed (${res.status}) for task ${task.id}:`, JSON.stringify(err));
      return 'failed';
    }
    console.log(`[phoneAlarms:${source}] sent ${after.length} alarm(s) for task ${task.id}`);
    return 'sent';
  } catch (e) {
    console.error(`[phoneAlarms:${source}] error for task ${task?.id}:`, e);
    return 'failed';
  }
}
