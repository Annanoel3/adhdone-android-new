import { base44 } from "@/api/base44Client";
import { scheduleReminder } from "./reminderScheduler";
import { getReminderCopy, smartSnoozeTime } from "./reminderCopy";

// The ONE way to snooze a task from a button.
//
// A snooze adds ONE extra reminder at the chosen time and counts the snooze.
// That is all it does. It never cancels or moves anything else: the task's
// remaining reminders — the rest of the smart schedule, tomorrow's, the day
// after's — carry on exactly as booked, so a task that isn't finished today
// still reminds as normal tomorrow. (It used to cancel every booked push and
// replace them with the snoozed one, which quietly wiped the rest.)
//
// The task stays ACTIVE and keeps its own date and time; only the extra
// reminder is new. The extra push joins onesignal_notification_ids so that
// completing the task still cancels it.
//
// Returns the time the extra reminder will fire.
export async function snoozeTaskUntil(task, when) {
  const user = await base44.auth.me();
  const snoozeUntil = new Date(when);

  let notificationId = null;
  try {
    notificationId = await scheduleReminder({
      email: user.email,
      ...getReminderCopy(task, snoozeUntil),
      sendAtISO: snoozeUntil.toISOString(),
      taskId: task.id,
      data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency, type: "task_reminder", snoozed: true },
    });
  } catch (e) {
    // Too soon, or refused as a duplicate of a push already booked for that
    // minute — either way the schedule already covers it. The snooze still counts.
    console.warn("[snoozeTask] extra reminder not booked:", e?.message || e);
  }

  const ids = Array.from(new Set([
    ...(task.onesignal_notification_ids || []),
    ...(notificationId ? [notificationId] : []),
  ]));

  await base44.entities.Task.update(task.id, {
    snooze_count: (task.snooze_count || 0) + 1,
    consecutive_snoozes: (task.consecutive_snoozes || 0) + 1,
    onesignal_notification_ids: ids,
  });

  return snoozeUntil;
}

export async function snoozeTask(task, minutes) {
  const when = smartSnoozeTime(task, new Date(Date.now() + minutes * 60 * 1000));
  return snoozeTaskUntil(task, when);
}

// Closed, swiped away, opened and left, or rang out with nobody answering:
// nothing happens to the task's reminders. This only keeps count.
export function recordReminderDismissed(task) {
  if (!task?.id) return Promise.resolve();
  return base44.entities.Task.update(task.id, {
    dismissed_count: (task.dismissed_count || 0) + 1,
  }).catch(() => {});
}
