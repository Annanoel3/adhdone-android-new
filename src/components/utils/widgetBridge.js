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
//    is never an alarm — its real pushes are in the schedule.
function reminderMomentsFor(task) {
  const out = new Map();
  const schedule = (task.reminder_schedule || []).filter((r) => r && r.send_at);
  for (const r of schedule) {
    const t = new Date(r.send_at).getTime();
    if (isNaN(t) || out.has(t)) continue;
    out.set(t, { at: t, heading: r.notification_title || '', body: r.notification_body || '' });
  }
  if (schedule.length === 0 && task.next_reminder && !task.day_only_task) {
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
//  - beyond that, PRIORITY decides, not whether the task has a date: a
//    high-priority or urgent task rings unless it is pinned to one later day
//    ("on Friday at 3" — nothing to do about it until then, so its earlier
//    heads-ups stay pushes). A deadline ("by Friday") and a task with no date
//    at all are both things to act on now, so their reminders ring by
//    priority; a medium/low one only rings on its day;
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
export function alarmSetFor(tasks, userDefault = alarmMode) {
  const cutoff = Date.now() - ALARM_KEEP_PAST_MS;
  const out = [];
  for (const t of tasks || []) {
    if (t.status !== 'active' || t.silenced) continue;
    if (alertStyleFor(t, userDefault) !== 'alarm') continue;
    for (const m of reminderMomentsFor(t)) {
      if (m.at <= cutoff) continue;
      if (isInQuietHours(new Date(m.at))) continue;
      // Heads-ups stay regular pushes; see ringsOutLoud.
      if (!ringsOutLoud(t, m.at)) continue;
      out.push({ id: `${t.id}:${m.at}`, taskId: t.id, title: t.title || 'Task', at: m.at, heading: m.heading, body: m.body });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, ALARM_MAX);
}

// What happened to alarms since we last asked — snoozes, dismissals, rings
// nobody answered — added to the task's counters. Data only: no reminder is
// changed, cancelled or moved because of any of it.
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
    if (Object.keys(patch).length === 0) continue;
    Object.assign(t, patch);
    try {
      await base44.entities.Task.update(t.id, patch);
    } catch (err) {
      console.error('Alarm activity not recorded:', err);
    }
  }
}

export async function pushAlarms(tasks) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge || alarmMode === null) return;

  await drainAlarmActivity(tasks);

  const alarms = alarmSetFor(tasks);
  const json = JSON.stringify(alarms);
  if (json === lastAlarmsJson) return;
  lastAlarmsJson = json;

  try {
    await AlarmBridge.sync({ alarms });
  } catch (err) {
    // Try again on the next change rather than believing the phone has this set.
    lastAlarmsJson = '';
    console.error('Alarm sync failed:', err);
  }
}

// Re-reads the task list and pushes the alarm set. For screens that change a
// task's alert style or the user's default and aren't Home.
export async function refreshAlarms() {
  if (!window.Capacitor?.Plugins?.AlarmBridge || alarmMode === null) return;
  try {
    const tasks = await base44.entities.Task.list('-updated_date', 500);
    await pushAlarms(tasks);
  } catch (err) {
    console.error('Alarm refresh failed:', err);
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
