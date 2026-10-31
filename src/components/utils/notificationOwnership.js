import { base44 } from '@/api/base44Client';

// When the person changed a task's date or time by hand, per task, in this
// app session. A new task's first booking can still be on its way when they
// do (it waits for the phone to be linked for pushes, up to about 45 s on a
// fresh install). Without this, that late booking landed after the edit, kept
// the OLD time and cancelled the new one as an orphan, so the time they picked
// never rang. Tricia, Oct 28 2026: changed her first task from 9 AM to 7 AM a
// minute after adding it and got both. The late booking now checks this and
// cancels itself instead.
const timeChangedAt = new Map();

export function noteTaskTimeChanged(taskId) {
  if (taskId) timeChangedAt.set(taskId, Date.now());
}

export function taskTimeChangedSince(taskId, sinceMs) {
  const at = timeChangedAt.get(taskId);
  return !!at && at >= sinceMs;
}

// A booking made for a task that has since moved, been finished or deleted:
// cancel what it booked and leave the task's own ids alone. Returns true when
// it did. bookedFor is the next_reminder the task had when the booking began.
export async function dropBookingIfMoved(taskId, ids, bookedFor, startedAt) {
  const booked = Array.isArray(ids) ? ids.filter(Boolean) : [];
  let moved = taskTimeChangedSince(taskId, startedAt);
  if (!moved) {
    try {
      const t = await base44.entities.Task.get(taskId);
      if (!t || (t.status && t.status !== 'active')) moved = true;
      else if (bookedFor && t.next_reminder && Date.parse(t.next_reminder) !== Date.parse(bookedFor)) moved = true;
    } catch (e) {
      // Can't tell: keep the booking, the same as before.
    }
  }
  if (!moved) return false;
  if (booked.length) {
    await Promise.allSettled(
      booked.map((notificationId) => base44.functions.invoke('cancelScheduled', { notificationId }))
    );
  }
  // Let the refill job look at the task again; the edit owns its ids.
  base44.entities.Task.update(taskId, { reminder_scheduling_since: null }).catch(() => {});
  return true;
}

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