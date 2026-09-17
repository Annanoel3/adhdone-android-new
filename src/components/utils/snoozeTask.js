import { base44 } from "@/api/base44Client";
import { scheduleReminder, cancelScheduledReminder } from "./reminderScheduler";
import { getReminderCopy, smartSnoozeTime } from "./reminderCopy";

// The ONE way to snooze a task from a button.
//
// The task stays ACTIVE. A snooze moves the next reminder; it does not park the
// task. The old handlers set status 'snoozed', which hid the task from Home
// (Home only lists active tasks), nothing ever switched it back, and
// onTaskUpdate treated 'snoozed' like 'completed' — cancelling the reminder the
// snooze had just booked and wiping the task's reminder fields.
//
// Returns the time the reminder will actually fire.
export async function snoozeTask(task, minutes) {
  const user = await base44.auth.me();
  const snoozeUntil = smartSnoozeTime(task, new Date(Date.now() + minutes * 60 * 1000));

  // Cancel what's booked so the user isn't reminded twice.
  if (task.onesignal_notification_ids?.length > 0) {
    await cancelScheduledReminder(task.onesignal_notification_ids).catch(() => {});
  }

  const notificationId = await scheduleReminder({
    email: user.email,
    ...getReminderCopy(task, snoozeUntil),
    sendAtISO: snoozeUntil.toISOString(),
    taskId: task.id,
    data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency, type: "task_reminder" },
  });

  await base44.entities.Task.update(task.id, {
    snooze_count: (task.snooze_count || 0) + 1,
    consecutive_snoozes: (task.consecutive_snoozes || 0) + 1,
    next_reminder: snoozeUntil.toISOString(),
    onesignal_notification_ids: notificationId ? [notificationId] : [],
  });

  return snoozeUntil;
}