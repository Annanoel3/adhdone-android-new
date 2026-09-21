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
// Alarms — real, out-loud alarms for high and urgent tasks, through the
// AlarmBridge Capacitor plugin. Android only. The plugin is absent on web and
// on app builds older than the one that added it, and every call here is then
// a no-op.
//
// Same one-way mirror as the widget: the app decides which tasks deserve an
// alarm and when it should ring, and hands native the WHOLE set every time
// tasks change. Native books them with AlarmManager, keeps them across reboots
// and rings them with or without a network. Anything missing from the latest
// set is cancelled on the phone.
//
// Alarms are OFF for everyone by default. They ring only for a user whose
// alarm_mode is 'alarm' (Settings). Push reminders are unchanged either way —
// for now an alarm rings alongside them, not instead of them.
//
// Which tasks ring, and when:
//   - active, top-level (no parent), not on the Back Burner, not a birthday,
//     urgency high or urgent, classification task or payment (events later)
//   - a day-only task rings at 9:00 AM local on its day
//   - a task with a clock time rings ONE HOUR before that time
//   - a task with no date at all gets no alarm (later: one combined 9 AM)

const ALARM_LEAD_MS = 60 * 60 * 1000;
const ALARM_DAY_HOUR = 9;
// Native keeps snooze/dismiss state for an alarm whose time hasn't changed, so
// a recently-past alarm must still be listed — otherwise a snoozed ring would
// be cancelled the moment the app opened. Anything older than this is dropped.
const ALARM_KEEP_PAST_MS = 24 * 60 * 60 * 1000;

// null = the signed-in user's setting isn't known yet. Native is never touched
// on a guess: an empty set would cancel every alarm on the phone.
let alarmMode = null;
let lastAlarmsJson = '';

export function supportsAlarms() {
  return !!window.Capacitor?.Plugins?.AlarmBridge;
}

export function setAlarmMode(mode) {
  alarmMode = mode === 'alarm' ? 'alarm' : 'notification';
}

function atNineLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), ALARM_DAY_HOUR, 0, 0, 0).getTime();
}

// When one task's alarm should ring, in epoch milliseconds, or null for none.
export function alarmTimeFor(task) {
  if (task.day_only_task) {
    const day = task.due_date || task.next_reminder;
    return day ? atNineLocal(day) : null;
  }
  if (task.reminder_interval === 'once' && task.next_reminder) {
    const t = new Date(task.next_reminder).getTime();
    return isNaN(t) ? null : t - ALARM_LEAD_MS;
  }
  if (task.due_date) {
    const d = new Date(task.due_date);
    if (isNaN(d)) return null;
    // The parser stores a deadline day with no clock time as 23:59 local.
    // That is a DAY, not a time — ring at 9 AM, not at 10:59 PM.
    if (d.getHours() === 23 && d.getMinutes() === 59) return atNineLocal(task.due_date);
    return d.getTime() - ALARM_LEAD_MS;
  }
  return null;
}

export function alarmSetFor(tasks) {
  const cutoff = Date.now() - ALARM_KEEP_PAST_MS;
  return (tasks || [])
    .filter((t) =>
      t.status === 'active' &&
      !t.parent_task_id &&
      !t.silenced &&
      !t.birthday_person &&
      (t.urgency === 'high' || t.urgency === 'urgent') &&
      (!t.classification || t.classification === 'task' || t.classification === 'payment')
    )
    .map((t) => ({ id: t.id, taskId: t.id, title: t.title || 'Task', at: alarmTimeFor(t) }))
    .filter((a) => a.at && a.at > cutoff)
    .sort((a, b) => a.at - b.at);
}

export async function pushAlarms(tasks) {
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  if (!AlarmBridge || alarmMode === null) return;

  const alarms = alarmMode === 'alarm' ? alarmSetFor(tasks) : [];
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
