// Pushes today's task list to the native Android home-screen widget through the
// WidgetBridge Capacitor plugin. Native-only: on web the plugin is absent and
// every call here is a no-op.
//
// This is a one-way mirror. The widget is a DISPLAY of what the app already
// decided is on today's plate — nothing in here filters, schedules, or reasons
// about tasks beyond formatting them for a small screen. Today's list is
// computed in exactly one place (isTodayTask), and both the Home screen and the
// widget read from it, so the two can never disagree.

import { isTodayTask, isUpcomingTask, getLocalDateString } from './todayTasks';
import { base44 } from '@/api/base44Client';
import { cancelScheduledReminder } from './reminderScheduler';
import { isInQuietHours } from './reminderScheduler';
import { getReminderCopy } from './reminderCopy';
import { isStepDone, markStepDone } from '@/components/onboarding/onboardingGate';

// The widget only has room for a handful of rows, and a wall of text is the
// opposite of useful on a home screen.
const MAX_WIDGET_TASKS = 5;

// Skip redundant bridge calls — this fires on every task edit, and re-pushing an
// identical list makes the widget redraw for nothing.
let lastPayloadJson = '';

// A clock time only when the task genuinely has one. Day-only tasks are anchored
// at 9 AM internally, so showing "9:00 AM" would invent a time the user never set.
function displayTimeFor(task) {
  if (task.day_only_task) return '';
  const at = task.event_time || (task.reminder_interval === 'once' ? task.next_reminder : null);
  if (!at) return '';
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function todaysWidgetTasks(tasks) {
  return (tasks || [])
    .filter((t) =>
      t.status === 'active' &&
      !t.parent_task_id &&
      !t.birthday_person &&
      isTodayTask(t)
    )
    .slice(0, MAX_WIDGET_TASKS)
    .map((t) => ({
      id: t.id,
      title: t.title,
      time: displayTimeFor(t),
      urgency: t.urgency || 'medium',
    }));
}

// A clear day shouldn't render as a blank widget — that reads as "broken" rather
// than "you're clear". Instead we show what's coming, so the widget still tells
// the user something true and useful.
function upcomingWidgetTasks(tasks) {
  return (tasks || [])
    .filter((t) =>
      t.status === 'active' &&
      !t.parent_task_id &&
      !t.birthday_person &&
      !t.silenced &&
      isUpcomingTask(t)
    )
    .sort((a, b) =>
      new Date(a.due_date || a.next_reminder) - new Date(b.due_date || b.next_reminder)
    )
    .slice(0, MAX_WIDGET_TASKS)
    .map((t) => {
      const at = t.due_date || t.next_reminder;
      return {
        id: t.id,
        title: t.title,
        // For an upcoming item the useful label is WHICH DAY, not a clock time.
        time: at
          ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '',
        urgency: t.urgency || 'medium',
      };
    });
}

export async function pushWidgetTasks(tasks) {
  const WidgetBridge = window.Capacitor?.Plugins?.WidgetBridge;
  if (!WidgetBridge) return;

  const today = todaysWidgetTasks(tasks);
  const upcoming = today.length === 0 ? upcomingWidgetTasks(tasks) : [];

  const payload = {
    generatedFor: getLocalDateString(),
    // heading is empty on a normal day; the widget only draws it when set.
    heading: today.length === 0
      ? (upcoming.length > 0 ? 'No tasks due today. Upcoming:' : 'No tasks due today.')
      : '',
    tasks: today.length > 0 ? today : upcoming,
  };

  const json = JSON.stringify(payload);
  if (json === lastPayloadJson) return;
  lastPayloadJson = json;

  try {
    await WidgetBridge.updateTasks(payload);
  } catch (err) {
    // The widget failing to redraw must never break the screen the user is on.
    console.error('Widget update failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Alarms — the task's EXISTING reminders, delivered as a real, out-loud alarm
// instead of (for now: as well as) a push. Through the AlarmBridge Capacitor
// plugin, Android only. The plugin is absent on web and on app builds older
// than the one that added it, and every call here is then a no-op.
//
// Same one-way mirror as the widget: the app hands native the WHOLE set every
// time tasks change. Native books them with AlarmManager, keeps them across
// reboots and rings them with or without a network. Anything missing from the
// latest set is cancelled on the phone.
//
// Nothing here decides WHEN a task reminds — that is already decided by the
// reminder plan (reminder_schedule) and next_reminder. This only decides HOW:
// a task rings as an alarm when its own alert_style is 'alarm', or when it has
// none of its own and the user's default (alarm_mode) is 'alarm'. Off for
// everyone until they turn it on.

// Native keeps snooze/dismiss state for an alarm whose time hasn't changed, so
// a recently-past alarm must still be listed — otherwise a snoozed ring would
// be cancelled the moment the app opened. Anything older than this is dropped.
const ALARM_KEEP_PAST_MS = 24 * 60 * 60 * 1000;
// AlarmManager refuses new alarms once an app holds a few hundred; the nearest
// ones are the ones that matter, and the set is rebuilt on every app open.
const ALARM_MAX = 100;

// null = the signed-in user's default isn't known yet. Native is never touched
// on a guess: an empty set would cancel every alarm on the phone.
let alarmMode = null;
let lastAlarmsJson = '';

export function supportsAlarms() {
  return !!window.Capacitor?.Plugins?.AlarmBridge;
}

// ---- Alarms the phone owns outright: a timer's end. ----
// The focus timer, the 5-minute sprint and the launchpad ring like an alarm
// when their time is up — always, whatever the account's reminder style —
// with the sound picked for that feature, never the account-wide alarm sound.
// These are booked on the phone's alarm clock directly, so they ring with the
// app closed too, and the task sync never touches them. Older builds without
// bookOwn keep the in-app sound loop and the fallback push.
export function timerAlarmsSupported() {
  return !!window.Capacitor?.Plugins?.AlarmBridge?.bookOwn;
}

// `actions` (up to three { label, path }) become buttons on the alarm screen in
// place of snooze; tapping one stops the ring and opens the app at that path.
export async function bookOwnAlarm({ id, taskId = '', title, heading = '', body = '', at, soundUrl = '', noSnooze = true, actions = [] }) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.bookOwn || !id || !at) return false;
  try {
    await AlarmBridge.bookOwn({ id, taskId, title: title || 'ADHDone', heading: heading || title || '', body, at, soundUrl, noSnooze, actions });
    return true;
  } catch (e) {
    console.warn('[alarm] bookOwn failed:', e?.message || e);
    return false;
  }
}

export async function cancelOwnAlarm(id) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.cancelOwn || !id) return false;
  try {
    await AlarmBridge.cancelOwn({ id });
    return true;
  } catch (e) {
    console.warn('[alarm] cancelOwn failed:', e?.message || e);
    return false;
  }
}

export function setAlarmMode(mode) {
  alarmMode = mode === 'alarm' ? 'alarm' : 'notification';
}

export function getAlarmMode() {
  return alarmMode;
}

// How this task alerts: its own choice, else the user's default.
export function alertStyleFor(task, userDefault = alarmMode) {
  if (task?.alert_style === 'alarm' || task?.alert_style === 'notification') return task.alert_style;
  return userDefault === 'alarm' ? 'alarm' : 'notification';
}

// Every moment a push notification is already booked for this task, each
// with the exact words that push carries. An alarm only ever stands in for
// one of these — same time, same title, same body — never a moment of its
// own. So:
//  - a task with a smart reminder schedule rings ONLY at those entries, with
//    each entry's own title and body (a "night before" entry says "night
//    before" things);
//  - a task with no schedule rings at its one booked push time
//    (next_reminder), with the copy that push was given;
//  - a day-only task's next_reminder is just a 9 AM anchor, not a push, so it
//    is never an alarm — its real pushes are in the schedule;
//  - a "by 5 PM" deadline's next_reminder is the deadline itself, which is
//    never booked as a push either (too late then) — only its schedule rings.
function reminderMomentsFor(task) {
  const out = new Map();
  const schedule = (task.reminder_schedule || []).filter((r) => r && r.send_at);
  for (const r of schedule) {
    const t = new Date(r.send_at).getTime();
    if (isNaN(t) || out.has(t)) continue;
    out.set(t, { at: t, heading: r.notification_title || '', body: r.notification_body || '' });
  }
  if (schedule.length === 0 && task.next_reminder && !task.day_only_task && task.deadline_style !== 'by') {
    const t = new Date(task.next_reminder).getTime();
    if (!isNaN(t) && !out.has(t)) {
      let copy = { title: '', body: '' };
      try { copy = getReminderCopy(task, new Date(t)) || copy; } catch (e) { /* plain title below */ }
      out.set(t, { at: t, heading: copy.title || '', body: copy.body || '' });
    }
  }
  return Array.from(out.values());
}

// Which of a task's reminders ring OUT LOUD, and which stay regular pushes.
// An alarm is for not missing the moment, not for being told about it early:
//  - the day the task is about (its event time, due day or reminder time)
//    always rings;
//  - an appointment's night-before and a birthday's week-before / day-before
//    are heads-ups, so they stay pushes;
//  - a task with NO date at all has no "day it's about": every reminder for
//    it is a do-it-now, so all of them ring (the priority decides how often
//    it is reminded, not how loud);
//  - for a dated task beyond its day, PRIORITY decides: a high-priority or
//    urgent one rings unless it is pinned to one later day ("on Friday at 3"
//    — nothing to do about it until then, so its earlier heads-ups stay
//    pushes), so a deadline's ("by Friday") run-up rings when it's pressing;
//    a medium/low dated task only rings on its day;
//  - a task with a working window (start date → due date) rings on every day
//    of that window, because every one of those days is a day to work on it.
function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sameLocalDay(a, b) {
  return startOfLocalDay(a) === startOfLocalDay(b);
}

function ringsOutLoud(task, momentMs) {
  const rawAnchor = task.event_time || task.due_date || task.next_reminder;
  const anchor = rawAnchor ? new Date(rawAnchor).getTime() : NaN;
  if (isNaN(anchor)) return true; // nothing to compare against: the booked moment stands
  if (sameLocalDay(momentMs, anchor)) return true;
  const isEvent = task.classification === 'event' || task.classification === 'birthday' || !!task.birthday_person;
  if (isEvent) return false;
  const start = task.start_date ? new Date(task.start_date).getTime() : NaN;
  if (!isNaN(start) && momentMs >= startOfLocalDay(start) && momentMs <= anchor) return true;
  if (!task.due_date && !task.event_time) return true; // no date: every reminder is a do-it-now
  const pressing = task.urgency === 'high' || task.urgency === 'urgent';
  if (!pressing) return false;
  // "By Friday" is a deadline; "on Friday at 3" is a moment. A due date on a
  // task that is NOT pinned to a clock time is a deadline too.
  const isDeadline = task.deadline_style === 'by' || (!!task.due_date && !task.event_time && task.reminder_interval !== 'once');
  // Pinned to one later day: heads-ups before it stay pushes.
  const pinnedLater = (!!task.event_time || !!task.due_date) && !isDeadline && momentMs < startOfLocalDay(anchor);
  return !pinnedLater;
}

// Quiet hours apply to alarms exactly as they do to pushes (default ON,
// 22:00–07:00, the user's own window from Settings). A reminder that falls
// inside them is never booked as a full-screen alarm — that moment keeps its
// regular push, which the scheduler has already placed by the same rules —
// so nothing rings out loud at 3 AM.
// Alarms that land close together ring ONCE. Until Oct 8 2026 two alarms at
// the same minute were spaced two minutes apart so each got its own ring —
// which meant three things due at the same time rang three times in a row,
// three "dismiss" taps for one moment (Anna: "We can't have things showing
// up in a row"). Now the first alarm of a cluster is the one that rings, and
// its body names the others ("Also now: …" — read out loud with the rest);
// the others don't ring on their own. Nothing is lost: every one of those
// moments also has its regular push, which still arrives quietly. Done and
// Snooze on the alarm act on its own task only, as they always have.
const ALARM_FOLD_MS = 10 * 60 * 1000;
// The time each alarm was last handed to the phone, by alarm id.
const ALARM_BOOKED_KEY = 'alarm_booked_at';
function foldClusters(entries) {
  entries.sort((a, b) => a.alarm.at - b.alarm.at);
  const out = [];
  let lead = null;
  let others = [];
  const flush = () => {
    if (lead) {
      if (others.length > 0) {
        const also = `Also now: ${others.join(', ')}.`;
        lead.alarm.body = lead.alarm.body ? `${lead.alarm.body} ${also}` : also;
      }
      out.push(lead.alarm);
    }
    lead = null;
    others = [];
  };
  for (const e of entries) {
    if (lead && e.alarm.at - lead.alarm.at < ALARM_FOLD_MS) {
      // A second moment of the same task inside the window just doesn't ring.
      if (e.alarm.taskId !== lead.alarm.taskId && !others.includes(e.alarm.title)) others.push(e.alarm.title);
      continue;
    }
    flush();
    lead = e;
  }
  flush();
  return out;
}

export function alarmSetFor(tasks, userDefault = alarmMode) {
  const cutoff = Date.now() - ALARM_KEEP_PAST_MS;
  const out = [];
  for (const t of tasks || []) {
    if (t.status !== 'active' || t.silenced) continue;
    // A step never reminds on its own — its parent task does (RULES.md §5).
    if (t.parent_task_id) continue;
    if (alertStyleFor(t, userDefault) !== 'alarm') continue;
    // A break they asked for (Later on the alarm): no alarm inside it.
    const breakMs = t.later_until ? new Date(t.later_until).getTime() : NaN;
    for (const m of reminderMomentsFor(t)) {
      if (m.at <= cutoff) continue;
      if (!isNaN(breakMs) && m.at < breakMs) continue;
      // A task the user asked to run through the night keeps its night alarms.
      if (!t.quiet_hours_exempt && isInQuietHours(new Date(m.at))) continue;
      // Heads-ups stay regular pushes; see ringsOutLoud.
      if (!ringsOutLoud(t, m.at)) continue;
      const alarm = { id: `${t.id}:${m.at}`, taskId: t.id, title: t.title || 'Task', at: m.at, heading: m.heading, body: m.body };
      // Someone else's birthday: the alarm's big button says what to do next.
      // It opens the task's page either way, which has the Send / Draft text
      // button. Builds before 1.3.9 ignore this and keep "Got it".
      if (t.birthday_person && !t.is_own_birthday) {
        alarm.openLabel = t.birthday_text_message ? 'Send a text' : 'Write a text';
      }
      out.push({ alarm, quietExempt: !!t.quiet_hours_exempt });
    }
  }
  return foldClusters(out).slice(0, ALARM_MAX);
}

// A smart nudge that rings out loud is a push that asks to ring when it lands
// (cronSmartTaskNudge → PushFilter). The PHONE makes that alarm itself, under
// an id of its own ("push:<push id>"), and both the full alarm sync below and
// the server's "this task is gone" message leave the phone's own alarms alone
// — on purpose, so a snooze the person asked for isn't wiped by the next sync.
// The cost: a nudge snoozed from its alarm screen still rang an hour after the
// task had been moved to the Parking Lot (Mom's neurology appointment, Oct 5
// 2026 — the task was long deleted, the snoozed nudge alarm rang anyway).
// The app's send ledger has every nudge pushed in the last day and which task
// it was about, so on every alarm sync, any nudge about a task that is no
// longer active (finished, deleted, cancelled, parked as an idea, or on the
// Back Burner) is taken off the phone here. A nudge for a task still on the
// list keeps its snooze. A build without cancelOwn (before the timer alarms)
// can't be told: nothing to do there.
const PUSH_ALARM_KEEP_MS = 24 * 60 * 60 * 1000;
const droppedPushAlarms = new Set();
async function dropStalePushAlarms(tasks) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.cancelOwn) return;
  let rows = [];
  try {
    const since = new Date(Date.now() - PUSH_ALARM_KEEP_MS).toISOString();
    rows = (await base44.entities.NotificationLedger.filter(
      { kind: 'smart_nudge', created_date: { $gte: since } }, '-created_date', 100
    )) || [];
  } catch (err) {
    return; // the next sync tries again
  }
  const live = new Set((tasks || []).filter((t) => t.status === 'active' && !t.silenced).map((t) => t.id));
  for (const r of rows) {
    const id = r?.notification_id ? `push:${r.notification_id}` : '';
    if (!id || !r.task_id || live.has(r.task_id) || droppedPushAlarms.has(id)) continue;
    try {
      await AlarmBridge.cancelOwn({ id });
      droppedPushAlarms.add(id);
    } catch (err) {
      // Not booked on this phone (it never rang here, or was answered): nothing to take off.
      droppedPushAlarms.add(id);
    }
  }
}

// "Later" on an alarm is a break the person asked for, and until Oct 6 2026
// it changed nothing: the ring stopped, a count went up, and the next nudge
// or rhythm ping came an hour later as if nothing had been said (Anna, the
// towels for Tom: Later twice, reminded again 39 minutes on). Now a Later
// gives the task a break: the first one in a day, three hours; a second the
// same day, until tomorrow morning. The break is kept on the task
// (later_until) and honoured everywhere: the nudge planner, the reminder
// refill, the server's alarm list and the phone's (alarmSetFor above). The
// pushes already booked inside the break are cancelled here, found through
// the app's send ledger (every booked push is in it with its time), and a
// rhythm picks up again when the break ends.
const LATER_BREAK_MS = 3 * 60 * 60 * 1000;
const LATER_MORNING_HOUR = 8;
function laterBreakUntil(t, now = new Date()) {
  const prev = t.later_until ? new Date(t.later_until) : null;
  const prevMs = prev && !isNaN(prev.getTime()) ? prev.getTime() : NaN;
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  // A break already given today (it ends today or later): this second Later
  // runs until tomorrow morning.
  const secondToday = !isNaN(prevMs) && prevMs >= startOfToday.getTime();
  let until;
  if (secondToday) {
    until = new Date(now); until.setDate(until.getDate() + 1); until.setHours(LATER_MORNING_HOUR, 0, 0, 0);
  } else {
    until = new Date(now.getTime() + LATER_BREAK_MS);
  }
  // Never shorten a break that is already longer.
  if (!isNaN(prevMs) && prevMs > until.getTime()) until = new Date(prevMs);
  return until;
}

// Takes the task's booked pushes inside the break off, and moves a rhythm's
// next ping to the break's end. Returns the extra fields to save on the task.
async function applyLaterBreak(t, until) {
  const now = Date.now();
  const untilMs = until.getTime();
  const isRhythm = !!t.reminder_interval && t.reminder_interval !== 'once';
  let rows = [];
  try {
    rows = (await base44.entities.NotificationLedger.filter({ task_id: t.id }, '-send_at', 200)) || [];
  } catch (e) {
    rows = [];
  }
  const live = rows.filter((r) => {
    const at = new Date(r.send_at || 0).getTime();
    return r.notification_id && at > now && (isRhythm || at < untilMs);
  });
  const dropIds = new Set(live.map((r) => r.notification_id));
  // Planned reminders whose push the ledger doesn't know (older bookings):
  // their time is on the plan entry itself.
  for (const e of (t.reminder_schedule || [])) {
    const at = new Date(e?.send_at || 0).getTime();
    if (e?.notification_id && !String(e.notification_id).startsWith('planned_') && at > now && at < untilMs) dropIds.add(e.notification_id);
  }
  if (dropIds.size) await cancelScheduledReminder(Array.from(dropIds)).catch(() => {});
  const fields = {};
  const ids = (t.onesignal_notification_ids || []).filter((id) => !dropIds.has(id));
  if (ids.length !== (t.onesignal_notification_ids || []).length) fields.onesignal_notification_ids = ids;
  const schedule = (t.reminder_schedule || []).filter((e) => !(e?.notification_id && dropIds.has(e.notification_id)));
  if (schedule.length !== (t.reminder_schedule || []).length) fields.reminder_schedule = schedule;
  if (isRhythm) {
    // Every live ping of the run is cancelled above; the refill books a fresh
    // run from the break's end (it starts at next_reminder when that is ahead).
    fields.onesignal_notification_ids = [];
    fields.last_scheduled_until = null;
    fields.next_reminder = until.toISOString();
  } else if (t.next_reminder) {
    const nr = new Date(t.next_reminder).getTime();
    if (nr > now && nr < untilMs) fields.next_reminder = until.toISOString();
  }
  return fields;
}

// The nudge planner reads the task again only when told the plan is out of
// date (onTaskUpdate does this for edits; a break set here has to say so too).
async function markNudgePlanStale() {
  const nowIso = new Date().toISOString();
  try {
    await base44.auth.updateMe({ smart_nudge_schedule_dirty: true, smart_nudge_dirty_at: nowIso });
  } catch (e) { /* the next hourly run still sees later_until on the task */ }
}

// What happened to alarms since we last asked — snoozes, dismissals, rings
// nobody answered, "Later" taps — added to the task's counters. A Later also
// starts the task's break (see laterBreakUntil); nothing else is rescheduled
// because of any of it.
async function drainAlarmActivity(tasks) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.drainActivity) return;
  let rows = [];
  try {
    rows = (await AlarmBridge.drainActivity())?.activity || [];
  } catch (err) {
    return;
  }
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  for (const row of rows) {
    const t = byId.get(row.taskId);
    if (!t) continue;
    const patch = {};
    if (row.snoozes > 0) {
      patch.snooze_count = (t.snooze_count || 0) + row.snoozes;
      patch.consecutive_snoozes = (t.consecutive_snoozes || 0) + row.snoozes;
    }
    if (row.dismissed) patch.dismissed_count = (t.dismissed_count || 0) + 1;
    if (row.ignored > 0) patch.ignored_count = (t.ignored_count || 0) + row.ignored;
    // "Later" (builds from 1.3.13 on): a break for the task, see laterBreakUntil.
    let laterUntil = null;
    if (row.later > 0) {
      patch.later_count = (t.later_count || 0) + row.later;
      laterUntil = laterBreakUntil(t);
      patch.later_until = laterUntil.toISOString();
      try {
        Object.assign(patch, await applyLaterBreak(t, laterUntil));
      } catch (err) {
        console.error('Later break: pushes not cancelled:', err);
      }
    }
    if (Object.keys(patch).length === 0) continue;
    Object.assign(t, patch);
    try {
      await base44.entities.Task.update(t.id, patch);
      if (laterUntil) markNudgePlanStale();
    } catch (err) {
      console.error('Alarm activity not recorded:', err);
    }
  }
}

export async function pushAlarms(tasks) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge) return;
  // The upcoming events go over with every alarm sync, whatever the alarm
  // mode: "Silent alarms during events" covers timers too.
  pushEventWindows(tasks);
  if (alarmMode === null) return;

  await drainAlarmActivity(tasks);
  // Before the unchanged-set check below: a task that only ever had nudges has
  // no alarms of its own, so deleting it leaves the set exactly as it was.
  dropStalePushAlarms(tasks).catch(() => {});

  const alarms = alarmSetFor(tasks);
  // An alarm handed to the phone for a later time than it has now (the old
  // two-minute spacing, before Oct 8 2026) must KEEP that later time until it
  // passes: moving it back to a minute already gone means the phone never
  // rings it (Kirito's medicine, Oct 3 2026). So a booked time still to come wins.
  const now = Date.now();
  let booked = {};
  try { booked = JSON.parse(localStorage.getItem(ALARM_BOOKED_KEY) || '{}'); } catch (e) { booked = {}; }
  for (const a of alarms) {
    const prev = booked[a.id];
    if (prev && prev > a.at && prev > now) a.at = prev;
  }
  try {
    localStorage.setItem(ALARM_BOOKED_KEY, JSON.stringify(Object.fromEntries(alarms.map((a) => [a.id, a.at]))));
  } catch (e) { /* no storage */ }
  // Every active task's id goes along (phone code from 1.3.14 on): a nudge
  // alarm the phone made and snoozed for a task no longer on this list is
  // dropped there. Older builds ignore the field.
  const activeTaskIds = (tasks || []).filter((t) => t.status === 'active' && !t.silenced).map((t) => t.id);
  const json = JSON.stringify({ alarms, activeTaskIds });
  if (json === lastAlarmsJson) return;
  lastAlarmsJson = json;

  try {
    await AlarmBridge.sync({ alarms, activeTaskIds });
  } catch (err) {
    // Try again on the next change rather than believing the phone has this set.
    lastAlarmsJson = '';
    console.error('Alarm sync failed:', err);
  }
}

// EVERY active task, a page at a time (the same paging the Calendar uses).
// The alarm set used to be built from the 500 most recently edited tasks,
// finished ones included — and native cancels every alarm missing from the
// set, so once finished tasks filled those 500, older active tasks silently
// lost their alarms.
export async function listActiveTasks() {
  const PAGE = 200;
  const all = [];
  const seen = new Set();
  for (let skip = 0; skip < 5000; skip += PAGE) {
    const page = (await base44.entities.Task.filter({ status: 'active' }, '-updated_date', PAGE, skip)) || [];
    let added = 0;
    for (const t of page) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); added++; }
    }
    if (page.length < PAGE || added === 0) break;
  }
  return all;
}

// Re-reads the task list and pushes the alarm set. For screens that change a
// task's alert style or the user's default and aren't Home.
export async function refreshAlarms() {
  if (!window.Capacitor?.Plugins?.AlarmBridge || alarmMode === null) return;
  try {
    const tasks = await listActiveTasks();
    await pushAlarms(tasks);
  } catch (err) {
    console.error('Alarm refresh failed:', err);
  }
}

// What rang on this phone (the phone's RingLog, builds from 38 / 1.3.15 on):
// every full-screen alarm and every reminder that showed with sound, newest
// first, each with how it ended (snoozed and for how long, Later, dismissed,
// done, rang out, or merged into another ring for the same task). Shown under
// Settings → Notifications as "What rang". null on the web or on an older
// build, which can't say. Read-only.
export async function readRingLog(days = 2) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (typeof AlarmBridge?.ringLog !== 'function') return null;
  try {
    const res = await AlarmBridge.ringLog({ days });
    return Array.isArray(res?.rows) ? res.rows : [];
  } catch (e) {
    console.warn('Ring log unavailable:', e?.message || e);
    return null;
  }
}

// What Android still withholds for alarms on this phone (each key true =
// allowed), or null when the plugin is absent.
export async function alarmPermissionStatus() {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.getStatus) return null;
  try {
    return await AlarmBridge.getStatus();
  } catch (err) {
    return null;
  }
}

// Something still missing? Then the guided "let your phone ring" dialog
// (mounted once in Layout) opens, and this resolves true. Called the moment
// someone first turns an alarm on — a task's switch, the first-task question,
// or the Settings default — never out of nowhere.
// Once per account: the first time alarms are turned on, the walk-through
// opens even when Android already allows everything, because it is also where
// the alarm sound gets picked. After that it only opens when something is off.
const ALARM_SETUP_STEP = 'onboarding_alarm_setup_done';
// Once per account as well: the first focus timer, sprint or launchpad. Those
// always ring like an alarm, so Android's switches are asked for then, with
// an explanation — and only when something is actually off.
const TIMER_SETUP_STEP = 'onboarding_timer_alarm_setup_done';

export async function requestAlarmPermissions({ setup = false, feature = '' } = {}) {
  const st = await alarmPermissionStatus();
  if (!st) return false;
  if (setup && !isStepDone(ALARM_SETUP_STEP)) {
    markStepDone(ALARM_SETUP_STEP);
    window.dispatchEvent(new CustomEvent('alarm-permissions-needed', { detail: { ...st, setup: true } }));
    return true;
  }
  // overlay ("Display over other apps") is only reported by newer builds; an
  // older build that doesn't know it must not be nagged about it.
  const missing = !st.notifications || !st.exactAlarms || !st.fullScreen || !st.ignoringBatteryOptimizations || st.overlay === false;
  if (feature === 'timers') {
    if (isStepDone(TIMER_SETUP_STEP)) return false;
    markStepDone(TIMER_SETUP_STEP);
    if (!missing) return false;
    window.dispatchEvent(new CustomEvent('alarm-permissions-needed', { detail: { ...st, feature: 'timers' } }));
    return true;
  }
  if (!missing) return false;
  window.dispatchEvent(new CustomEvent('alarm-permissions-needed', { detail: st }));
  return true;
}

// "Only vibrate when my phone is on silent, vibrate or Do Not Disturb" — the
// yes/no asked the first time alarms are set up (User.alarm_vibrate_when_quiet).
// Native reads it the moment an alarm goes off, so it covers every ring: task
// alarms and timers alike. Only builds from 1.3.9 on have it; on older ones
// the question is never shown.
export function alarmQuietChoiceSupported() {
  return typeof window.Capacitor?.Plugins?.AlarmBridge?.setQuietVibrate === 'function';
}

// "Silent alarms during events?" — the yes/no asked (and required) the first
// time alarms are set up, next to the vibrate-only question
// (User.alarm_quiet_during_events). While an event on the calendar is
// happening, every ring vibrates and shows with no sound. Builds from 1.3.9 on.
export function eventQuietSupported() {
  return typeof window.Capacitor?.Plugins?.AlarmBridge?.setEventQuiet === 'function';
}

export async function pushEventQuiet(on) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (typeof AlarmBridge?.setEventQuiet !== 'function') return false;
  try {
    await AlarmBridge.setEventQuiet({ on: !!on });
    return true;
  } catch (err) {
    console.warn('[alarm] setEventQuiet failed:', err?.message || err);
    return false;
  }
}

// The events the choice above applies to, as { start, end } times: every
// active event with a clock time (all-day ones don't count), from now to two
// weeks out, including one already underway. An event with no end time counts
// as one hour.
function eventWindowsFor(tasks) {
  const HOUR = 60 * 60 * 1000;
  const now = Date.now();
  const horizon = now + 14 * 24 * HOUR;
  const out = [];
  for (const t of tasks || []) {
    if (!t || t.status !== 'active' || t.classification !== 'event' || t.day_only_task) continue;
    const start = Date.parse(t.event_time || '');
    if (!Number.isFinite(start)) continue;
    let end = Date.parse(t.end_time || '');
    if (!Number.isFinite(end) || end <= start) end = start + HOUR;
    if (end <= now || start > horizon) continue;
    out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 200);
}

let lastEventWindowsJson = '';
export async function pushEventWindows(tasks) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (typeof AlarmBridge?.setEventWindows !== 'function') return;
  const windows = eventWindowsFor(tasks);
  const json = JSON.stringify(windows);
  if (json === lastEventWindowsJson) return;
  lastEventWindowsJson = json;
  try {
    await AlarmBridge.setEventWindows({ windows });
  } catch (err) {
    lastEventWindowsJson = '';
    console.warn('[alarm] setEventWindows failed:', err?.message || err);
  }
}

// Which quiet the vibrate-only choice covers (User.alarm_quiet_when): 'silent'
// (ringer on silent or vibrate), 'dnd' (Do Not Disturb), 'both', or 'off'
// (always ring out loud). Builds from 1.3.12 can tell silent and Do Not
// Disturb apart (AlarmBridge.setQuietWhen); older ones only take on/off, and
// there every "on" means both.
export const QUIET_WHEN_CHOICES = ['silent', 'dnd', 'both'];

export function alarmQuietWhenSupported() {
  return typeof window.Capacitor?.Plugins?.AlarmBridge?.setQuietWhen === 'function';
}

// The phone's setting from the account: 'off' unless vibrate-only is on.
export function quietWhenFor(user) {
  if (!user?.alarm_vibrate_when_quiet) return 'off';
  return QUIET_WHEN_CHOICES.includes(user.alarm_quiet_when) ? user.alarm_quiet_when : 'both';
}

export async function pushAlarmQuietWhen(when) {
  const w = QUIET_WHEN_CHOICES.includes(when) ? when : 'off';
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (typeof AlarmBridge?.setQuietWhen === 'function') {
    try {
      await AlarmBridge.setQuietWhen({ when: w });
      return true;
    } catch (err) {
      console.warn('[alarm] setQuietWhen failed:', err?.message || err);
      return false;
    }
  }
  return pushAlarmQuietVibrate(w !== 'off');
}

export async function pushAlarmQuietVibrate(on) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (typeof AlarmBridge?.setQuietVibrate !== 'function') return false;
  try {
    await AlarmBridge.setQuietVibrate({ on: !!on });
    return true;
  } catch (err) {
    console.warn('[alarm] setQuietVibrate failed:', err?.message || err);
    return false;
  }
}

// The alarm-sound presets used to point at the Focus Room's chimes on the
// sound bucket — gentle notification sounds mastered 7–9 dB below a real alarm
// tone, which is why alarms got quiet once people picked one (the bundled
// tone they replaced was loud). On Oct 1, 2026 each was re-mastered to alarm
// loudness and stored under a new address (phones keep a copy by address, so
// the old one must change). An account still on an old address is moved to
// the loud copy on open (WidgetTaskSync) — same sound, just at alarm level.
export const LOUD_ALARM_SOUND_FOR = new Map([
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/Joyful%20Melody.wav', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/6cf12ae4d_alarm-joyful-melody-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/Piano%20Melody.mp3', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/669ebca15_alarm-piano-melody-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/Short%20Piano%20Notification.mp3', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/25a474e03_alarm-short-piano-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/Short%20Notification.wav', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/72a4ce0cc_alarm-short-notification-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/Applause.wav', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/d76ebf735_alarm-applause-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification%203.mp3', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/2a20b0ce0_alarm-jr-station-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/JR%20Osaka%20Loop%204.mp3', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/cd9302e06_alarm-jr-osaka-loop-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/JR%20Morning%20Tranquility.mp3', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/5828ed87c_alarm-jr-morning-tranquility-loud.wav'],
  ['https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/JR%20Flower%20Shop.mp3', 'https://base44.app/api/apps/68dd79726fce6eca73056b9b/files/mp/public/68dd79726fce6eca73056b9b/7bae5a00b_alarm-jr-flower-shop-loud.wav'],
]);

// Hands native the ring sound the user chose ('' = the phone's default alarm
// tone). Native downloads it once and rings from the copy. Resolves the
// plugin's { result, ready }, or null when there is nothing to do.
export async function pushAlarmSound(user) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.setSound) return null;
  try {
    return await AlarmBridge.setSound({ url: user?.alarm_sound_url || '', name: user?.alarm_sound_name || '' });
  } catch (err) {
    console.error('Alarm sound sync failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// The full-screen alarm wears the app's current look.
//
// Nothing here knows theme names. The page's real background (a theme's
// gradient, a seasonal colour, dark mode's near-black) is read from the DOM
// after it has been painted, reduced to a few hex colours plus the app's
// accent, and handed to native (AlarmBridge.setTheme), which draws the alarm
// screen with them. Re-sent whenever the theme or seasonal mode changes.

function cssColorToHex(str) {
  const t = (str || '').trim();
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (h) return h[1].length === 3 ? '#' + [...h[1]].map((c) => c + c).join('') : '#' + h[1];
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(t);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // transparent
  const hex = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function hslTripleToHex(triple) {
  // Tailwind/shadcn CSS variable form: "271 91% 65%"
  const m = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(triple || '');
  if (!m) return null;
  const hh = Number(m[1]) / 360, ss = Number(m[2]) / 100, ll = Number(m[3]) / 100;
  const f = (n) => {
    const k = (n + hh * 12) % 12;
    const a = ss * Math.min(ll, 1 - ll);
    return ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function luminance(hex) {
  const c = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
}

const GRADIENT_DIRECTIONS = {
  'to top': 0, 'to top right': 45, 'to right top': 45, 'to right': 90,
  'to bottom right': 135, 'to right bottom': 135, 'to bottom': 180,
  'to bottom left': 225, 'to left bottom': 225, 'to left': 270,
  'to top left': 315, 'to left top': 315,
};

function parseGradient(backgroundImage) {
  const m = /linear-gradient\((.*)\)/i.exec(backgroundImage || '');
  if (!m) return null;
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of m[1]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  let angle = 180;
  const first = (parts[0] || '').toLowerCase();
  if (first in GRADIENT_DIRECTIONS) { angle = GRADIENT_DIRECTIONS[first]; parts.shift(); }
  else if (/deg$/.test(first)) { angle = parseFloat(first); parts.shift(); }
  const colors = parts
    .map((p) => cssColorToHex(p.replace(/\s+[\d.]+%\s*$/, '')))
    .filter(Boolean);
  return colors.length ? { colors: colors.slice(0, 8), angle } : null;
}

// A seasonal theme paints the page with artwork (Layout.jsx's seasonal
// backgrounds). That picture goes to the alarm too: native downloads it once
// and shows it behind a dark scrim, so the colours below only matter until
// the download has finished.
function parseImageUrl(backgroundImage) {
  const m = /url\((["']?)(https?:\/\/[^"')]+)\1\)/i.exec(backgroundImage || '');
  return m ? m[2] : '';
}

// The look the alarm should have right now, or null when it can't be read.
export function currentAlarmTheme() {
  if (typeof document === 'undefined') return null;
  const candidates = [document.getElementById('adhdone-app-bg'), document.body, document.documentElement].filter(Boolean);
  let colors = null;
  let angle = 135;
  let image = '';
  for (const el of candidates) {
    const cs = getComputedStyle(el);
    if (!image) image = parseImageUrl(cs.backgroundImage);
    const g = parseGradient(cs.backgroundImage);
    if (g) { colors = g.colors; angle = g.angle; break; }
    const c = cssColorToHex(cs.backgroundColor);
    if (c) { colors = [c]; break; }
  }
  // Spicy Brains paints no background on the app shell (each page brings its
  // own gradient), so the shell reads as plain pale pink. Its signature is the
  // header's pink → purple → blue gradient, so the alarm wears that instead.
  let appTheme = '';
  try { appTheme = localStorage.getItem('adhd_theme') || ''; } catch (e) { /* no storage */ }
  if (!image && appTheme === 'spicybrains') {
    colors = ['#ff6b9d', '#c06bff', '#6bc5ff'];
    angle = 135;
  }
  if (!colors && !image) return null;
  // With artwork the alarm is dark-on-purpose (scrim over the picture), so
  // the stand-in colour while it downloads is dark as well.
  if (image) colors = ['#1f1b2e'];
  const dark = luminance(colors[0]) < 0.4;
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary');
  return {
    colors,
    angle: Math.round(angle),
    image,
    text: dark ? '#ffffff' : '#111827',
    muted: dark ? '#c9c3dc' : '#4b5563',
    accent: hslTripleToHex(primary) || '#8b5cf6',
    onAccent: '#ffffff',
  };
}

let lastThemeJson = '';

export async function pushAlarmTheme() {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge?.setTheme) return null;
  const theme = currentAlarmTheme();
  if (!theme) return null;
  const json = JSON.stringify(theme);
  if (json === lastThemeJson) return theme;
  lastThemeJson = json;
  try {
    await AlarmBridge.setTheme(theme);
  } catch (err) {
    lastThemeJson = '';
    console.error('Alarm theme sync failed:', err);
  }
  return theme;
}