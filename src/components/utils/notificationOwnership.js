import { base44 } from '@/api/base44Client';

// Single owner for a task's onesignal_notification_ids.
//
// The client books reminders fire-and-forget after Task.create, and the refill
// cron may book its own batch for the same task in the meantime. Whoever wrote
// last used to silently overwrite the other's ids — leaving live pushes that
// nothing tracked and that completing/deleting the task could never cancel.
// Every client-side write of notification ids now goes through here: it reads
// what's currently on the task, cancels any booking it's about to drop, then
// writes. The result is that the ids on the task are ALWAYS the complete set of
// live pushes for it.
export async function commitNotificationIds(taskId, ids, extra = {}) {
  const next = Array.isArray(ids) ? ids.filter(Boolean) : [];

  let current = null;
  try {
    current = await base44.entities.Task.get(taskId);
  } catch (e) {
    current = null;
  }
  const existing = Array.isArray(current?.onesignal_notification_ids) ? current.onesignal_notification_ids : [];
  const orphans = existing.filter((id) => id && !next.includes(id));
  if (orphans.length) {
    await Promise.allSettled(
      orphans.map((notificationId) => base44.functions.invoke('cancelScheduled', { notificationId }))
    );
  }

  return base44.entities.Task.update(taskId, {
    onesignal_notification_ids: next,
    reminder_scheduling_since: null,
    ...extra,
  });
}