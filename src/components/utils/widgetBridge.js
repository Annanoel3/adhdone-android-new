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

// Every moment this task is already set to remind at.
function reminderTimesFor(task) {
  const times = new Set();
  for (const r of task.reminder_schedule || []) {
    const t = r?.send_at ? new Date(r.send_at).getTime() : NaN;
    if (!isNaN(t)) times.add(t);
  }
  if (task.next_reminder) {
    const t = new Date(task.next_reminder).getTime();
    if (!isNaN(t)) times.add(t);
  }
  return Array.from(times);
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
    for (const at of reminderTimesFor(t)) {
      if (at <= cutoff) continue;
      if (isInQuietHours(new Date(at))) continue;
      out.push({ id: `${t.id}:${at}`, taskId: t.id, title: t.title || 'Task', at });
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
export async function requestAlarmPermissions() {
  const st = await alarmPermissionStatus();
  if (!st) return false;
  const missing = !st.notifications || !st.exactAlarms || !st.fullScreen || !st.ignoringBatteryOptimizations;
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
