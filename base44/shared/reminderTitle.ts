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
import { DEFAULT_TIME_ZONE, localDateKey, localMinutesOfDay, resolveQuietHours, isInQuietHours, isTimeTheySet } from './quietHours.ts';
import OpenAI from 'npm:openai';
import { REMINDER_BRIEF } from './reminderBrief.ts';

// The words of the one reminder a task gets AT the time they set for it,
// written from the same brief Smart Reminders runs on, so the app has one
// voice. Anna, Oct 12 2026, on "It's time — 'Clean the litter box'. You've got
// this! 💪": that is the app talking, not an assistant. The brief's own
// example for that moment is "Litter box time. It's 9 — the cats will thank
// you."
//
// Every path that books that reminder still starts from the plain words
// ("It's time — "…), and schedulePush, which every booking goes through,
// swaps them for these. Null when no good answer comes back in time: the plain
// words go out, so a reminder is never held up or lost over its wording.
export async function atTimeWords(task: any, atMs: number, timeZone: string, timeoutMs = 6000): Promise<{ title: string; body: string } | null> {
  try {
    const title = String(task?.title || '').trim();
    if (!title || !Number.isFinite(atMs)) return null;
    const said = String(task?.original_input || '').trim().replace(/\s+/g, ' ');
    const notes = [task?.description, task?.notes].map((x: any) => String(x || '').trim()).filter(Boolean).join(' / ').replace(/\s+/g, ' ');
    let when = '';
    try {
      when = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || DEFAULT_TIME_ZONE, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(atMs));
    } catch (_) {
      when = new Date(atMs).toISOString();
    }
    const repeats = task?.recurrence_pattern && task.recurrence_pattern !== 'none' ? String(task.recurrence_pattern).replace(/_/g, ' ') : '';
    const isEvent = task?.classification === 'event';
    const facts = [
      `The ${isEvent ? 'event' : 'task'}: "${title.slice(0, 200)}"`,
      said && said.toLowerCase() !== title.toLowerCase() ? `Their words when they added it: "${said.slice(0, 400)}"` : '',
      notes ? `Notes: ${notes.slice(0, 300)}` : '',
      `The time they set for it: ${when}${repeats ? ` (it repeats ${repeats})` : ''}`,
      task?.location ? `Location they typed: ${String(task.location).slice(0, 200)}` : '',
    ].filter(Boolean).join('\n');
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    // gpt-6-astra (was gpt-6-luna, the cheaper one, from Sept 27 2026). Anna, Oct 17 2026: "Move them to astra like I already asked weeks ago" (she asked for the newest model everywhere on Sept 17 2026).
    const ask = openai.chat.completions.create({
      model: 'gpt-6-astra',
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: REMINDER_BRIEF },
        { role: 'user', content: `${facts}\n\nThis is the one reminder that goes out at exactly that time, the reminder for the time they set. Write it. It has to be plain from the words alone what it is for and that the time is now. Return JSON only: {"title": "<2-6 words, may include one emoji that fits what it literally says>", "body": "<one or two complete sentences>"}` },
      ],
    });
    // A late answer is dropped, not waited for.
    ask.catch(() => {});
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const res: any = await Promise.race([ask, late]);
    if (!res) return null;
    const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const t = String(parsed?.title || '').replace(/\s+/g, ' ').trim();
    const b = String(parsed?.body || '').replace(/\s+/g, ' ').trim();
    if (!t || !b || t.length > 60 || b.length > 240) return null;
    return { title: t, body: b };
  } catch (e) {
    console.log('[atTimeWords] no words, the plain ones stay:', (e as any)?.message || e);
    return null;
  }
}

// The plain words every path books the reminder at a task's own time with.
export function isPlainAtTimeWords(body: any): boolean {
  return /^It's time — "/.test(String(body || ''));
}

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

// A reminder the person asked to get every day (or every other day). Once its
// first day has gone by, every one after it is that same daily reminder, not
// a task that "slipped past" anything (Oct 16 2026: Michelle's "Check email."
// read "⚠️ … slipped past Wednesday. No shame…" every morning). Anna: "Daily
// reminders should stop using that wording."
const DAILY_RHYTHMS = new Set(['daily', 'every_other_day']);

export function getReminderContent(
  taskTitle: string | null | undefined,
  dueDateISO: string | null | undefined,
  sendAtISO: string,
  timeZone: string = DEFAULT_TIME_ZONE,
  interval: string | null | undefined = null
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
    if (DAILY_RHYTHMS.has(String(interval || ''))) return { title: `📌 ${title}`, body: `Reminder: ${sentence(title)}` };
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
export function ringsOutLoudOn(task: any, momentMs: number, timeZone: string, label = ''): boolean {
  const anchor = whenMs(task.event_time || task.due_date || task.next_reminder);
  if (isNaN(anchor)) return true;
  const isEvent = task.classification === 'event' || task.classification === 'birthday' || !!task.birthday_person;
  // A timed event rings at its own time and at "leave now"; its heads-ups
  // (the night before, "in about an hour") stay pushes (Anna, Oct 13 2026).
  // A day-only event keeps its morning-of.
  if (task.classification === 'event' && task.event_time && !task.day_only_task) {
    const eventMs = whenMs(task.event_time);
    return Math.abs(momentMs - eventMs) < 60 * 1000 || /leave now/i.test(String(label || ''));
  }
  const day = (ms: number) => localDateKey(new Date(ms), timeZone);
  const momentDay = day(momentMs);
  const anchorDay = day(anchor);
  if (momentDay === anchorDay) return true;
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
// An ordinary task (not an event, a birthday or a rhythm they asked for)
// rings only at its own time; the rest is Smart Reminders' (see
// onlyItsOwnTime in widgetBridge.js, Anna Oct 12 2026).
function onlyItsOwnTime(task: any): boolean {
  if (task.classification === 'event' || task.classification === 'birthday' || task.birthday_person || task.is_own_birthday) return false;
  return !task.reminder_interval || task.reminder_interval === 'once';
}

function hasItsOwnTime(task: any): boolean {
  return task.reminder_interval === 'once' && !task.day_only_task && task.deadline_style !== 'by';
}

function reminderMoments(task: any, timeZone: string): { at: number; heading: string; body: string; theirs?: boolean; label?: string }[] {
  const out = new Map<number, { at: number; heading: string; body: string; theirs?: boolean; label?: string }>();
  const own = onlyItsOwnTime(task);
  const ownAt = own && hasItsOwnTime(task) ? whenMs(task.next_reminder) : NaN;
  const schedule = (Array.isArray(task.reminder_schedule) ? task.reminder_schedule : []).filter((r: any) => r && r.send_at)
    .filter((r: any) => !own || r.their_time === true || Math.abs(whenMs(r.send_at) - ownAt) < 60 * 1000);
  for (const r of schedule) {
    const t = whenMs(r.send_at);
    if (isNaN(t) || out.has(t)) continue;
    // their_time: a reminder they added at a time they picked (see
    // SmartReminderEditor), which may ring inside quiet hours.
    out.set(t, { at: t, heading: r.notification_title || '', body: r.notification_body || '', theirs: r.their_time === true, label: String(r.label || '') });
  }
  if (schedule.length === 0 && task.next_reminder && !task.day_only_task && task.deadline_style !== 'by'
      && (!own || hasItsOwnTime(task))) {
    const t = whenMs(task.next_reminder);
    if (!isNaN(t) && !out.has(t)) {
      const copy = getReminderContent(task.title, task.due_date, new Date(t).toISOString(), timeZone, task.reminder_interval);
      out.set(t, { at: t, heading: copy.title || '', body: copy.body || '' });
    }
  }
  return Array.from(out.values());
}

// The heading of an alarm at a time they set themselves starts with the bell.
// Phones on builds 39–42 only know such an alarm by that bell
// (AlarmService.isPinned): without it, the alarm could be moved 10 minutes
// past another task's alarm, again and again. The at-the-time words written by
// atTimeWords (Oct 12 2026) and the plain 📌 / 📅 headings had no bell, so
// Anna's 10 AM call ("Call (210) 621-7099 at 10:00 tomorrow") rang at 10:31 on
// Oct 21 2026, behind "Set watch to record continuously", also at 10:00 and
// snoozed twice. Build 43 on reads theirTime instead. Same as bellHeading in
// widgetBridge.js.
export function bellHeading(heading: any, title: any): string {
  const h = String(heading || '').trim();
  if (h.startsWith('🔔')) return h;
  const rest = h.replace(/^(📌|📅)\s*/u, '').trim() || String(title || '').trim() || 'Reminder';
  return `🔔 ${rest}`;
}

// Two or more alarms at times they set in the same minute ring in the order
// that matters (alarmOrder.ts judges it; Anna, Oct 21 2026: "which one sounds
// more important..... a scheduled phone call involving another persons time
// or a watch setting"). Each task keeps its place by clock time in its own
// alarm_order; each one after the first rings this much later per place, so
// the first rings on the minute and the phone rings the next the moment it's
// answered. Same as orderWaitMs in widgetBridge.js.
export const ORDER_STEP_MS = 10 * 1000;

export function clockKey(ms: number, timeZone: string): string {
  const m = localMinutesOfDay(new Date(ms), timeZone || DEFAULT_TIME_ZONE);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function orderWaitMs(task: any, atMs: number, timeZone: string): number {
  const all = task?.alarm_order && typeof task.alarm_order === 'object' ? task.alarm_order : null;
  const place = all ? all[clockKey(atMs, timeZone)] : null;
  const rank = Math.max(0, Math.min(5, Math.floor(Number(place?.rank) || 0)));
  return rank * ORDER_STEP_MS;
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
  // A break they asked for (Later on the alarm): no alarm inside it. Same
  // rule as alarmSetFor in widgetBridge.js.
  const breakMs = whenMs(task.later_until);
  for (const m of reminderMoments(task, timeZone)) {
    if (m.at <= now) continue;
    if (Number.isFinite(breakMs) && m.at < breakMs) continue;
    // Inside quiet hours only a time they set themselves rings (RULES.md §9
    // Q4: a 5 AM flight), or a task they asked to run through the night.
    const inQuiet = quiet.enabled && isInQuietHours(new Date(m.at), quiet.startMin, quiet.endMin, timeZone);
    // A time they set themselves (the call "at 10:00 tomorrow", "remind me at
    // 10 a.m."), quiet hours or not.
    const setByThem = m.theirs === true || isTimeTheySet(task, m.at, timeZone);
    const theirTime = inQuiet && setByThem;
    if (inQuiet && task.quiet_hours_exempt !== true && !theirTime) continue;
    if (!ringsOutLoudOn(task, m.at, timeZone, m.label)) continue;
    const alarm: any = { id: `${task.id}:${m.at}`, at: setByThem ? m.at + orderWaitMs(task, m.at, timeZone) : m.at, title: task.title || 'Task', heading: setByThem ? bellHeading(m.heading, task.title) : m.heading, body: m.body };
    // It rings at that time. The phone never moves it to keep 10 minutes from
    // another task's alarm, and a reminder the app picked that is ringing then
    // makes way for it (AlarmService: build 43 on reads theirTime, builds
    // 39–42 the bell at the start of the heading).
    if (setByThem) alarm.theirTime = true;
    // Home or Back on this one rings it again in 10 minutes instead of closing
    // it (build 40 on; AlarmService.leftRinging): one sleepy press mustn't
    // silence the only alarm they asked for in the night.
    if (theirTime) alarm.throughQuiet = true;
    // Which repeated thing it is: two alarms of one family at the same moment
    // ring as one (the phone's PairDecisions, build 39 on).
    if (task.task_family) alarm.family = String(task.task_family).slice(0, 40);
    // A pet's birthday has no text (Oct 12 2026): plain "Got it".
    if (task.birthday_person && !task.is_own_birthday && !task.birthday_animal) {
      alarm.openLabel = task.birthday_text_message ? 'Send a text' : 'Write a text';
    }
    // An event (an appointment, Bike Night): the phone (build 42 on) shows
    // "Got it" only — no snooze, no Done, no Later (Anna, Oct 13 2026).
    // Older builds ignore this. Same as alarmSetFor in widgetBridge.js.
    if (task.classification === 'event') {
      alarm.event = true;
      // The at-the-time reminder worded for recording notes: the alarm's
      // second button opens the event's page (Record notes). Otherwise Got
      // it is the only button. Same as alarmSetFor in widgetBridge.js.
      if (/record notes/i.test(String(m.label || ''))) alarm.openLabel = 'Record notes';
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
    // An alarm due within two hours is coming off the phone (a cancel, a
    // Later, a plan change): this push goes at high priority so a sleeping
    // phone gets it before that alarm would ring, with no app open (Anna, Oct
    // 10 2026). Everything else stays at normal priority (see below).
    let removesSoon = false;
    if (before) {
      const was = phoneAlarmsFor({ ...before, id: task.id }, owner, now);
      if (JSON.stringify(was) === JSON.stringify(after)) return 'unchanged';
      const kept = new Set(after.map((a: any) => a.id));
      removesSoon = was.some((a: any) => !kept.has(a.id) && a.at - now < 2 * 60 * 60 * 1000);
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
        // Normal priority, on purpose: this push shows nothing, and Google (FCM)
        // demotes every push to a phone whose high-priority pushes keep showing
        // nothing — real reminders then arrive late (see onTaskUpdate's drop
        // push). A sleeping phone may get a changed alarm time a little late;
        // the app also re-syncs alarms on every open.
        priority: removesSoon ? 10 : 5,
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
