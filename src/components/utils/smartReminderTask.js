// A task is on SMART REMINDERS when the AI nudge system owns its timing.
// This mirrors cronSmartTaskNudge's own eligibility rule exactly: a day-only
// task ("remind me to do X tomorrow") has no clock time, so it is stored with
// reminder_interval 'once' + day_only_task true and IS smart-nudged. The UI
// used to require a null interval, so those tasks showed no Smart Reminders
// badge and looked like plain dated tasks.
export function isSmartReminderTask(task) {
  if (!task || task.parent_task_id) return false;
  if (task.classification === 'event' || task.classification === 'birthday' || task.birthday_person) return false;
  if (!task.reminder_interval) return true;
  return task.reminder_interval === 'once' && !!task.day_only_task;
}