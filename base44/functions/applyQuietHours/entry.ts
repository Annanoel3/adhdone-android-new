import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { isInQuietHours, resolveQuietHours, userTimeZone } from '../../shared/quietHours.ts';
import { isRecurringInterval } from '../../shared/reminderIntervalDecision.ts';
import { isBookedId } from '../../shared/eventReminderPlan.ts';
import { ledgerCancel } from '../../shared/sendLedger.ts';
import { filterAll } from '../../shared/listAll.ts';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

async function cancelOneSignalNotification(id) {
  try {
    await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${ONESIGNAL_APP_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${ONESIGNAL_REST_API_KEY}` }
    });
  } catch (e) {
    console.error(`[applyQuietHours] Failed to cancel ${id}:`, e);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { quietStart, quietEnd } = await req.json();

    // Prefer the user's profile (source of truth) for the enabled flag + timezone;
    // fall back to the values sent from the Settings page for start/end.
    // No timezone saved: the shared fallback, as everywhere else.
    const timeZone = userTimeZone(user);
    // Quiet hours default to ON — only an explicit false counts as disabled.
    const resolved = resolveQuietHours({
      ...user,
      quiet_hours_start: user.quiet_hours_start || quietStart,
      quiet_hours_end: user.quiet_hours_end || quietEnd,
    });
    const quietEnabled = resolved.enabled;
    const startMin = resolved.startMin;
    const endMin = resolved.endMin;

    if (!quietEnabled) {
      return Response.json({ success: true, skipped: 'quiet hours disabled' });
    }

    // Fetch all active tasks for this user with queued notifications (every
    // one of them — a plain filter() stops at 50).
    const tasks = await filterAll(base44.entities.Task, {
      status: 'active',
      notification_recipient_email: user.email
    });

    // Only a repeating rhythm ("every hour", "daily") is re-booked by the
    // refill job, so only those can be cancelled here and come back with the
    // new quiet hours. A one-time reminder or an event's reminders were
    // cancelled too, and their time wiped — nothing ever booked them again, so
    // saving quiet hours in Settings silently deleted them.
    const tasksWithNotifs = tasks.filter(t =>
      isRecurringInterval(t.reminder_interval) &&
      Array.isArray(t.onesignal_notification_ids) && t.onesignal_notification_ids.length > 0 &&
      t.last_scheduled_until
    );

    console.log(`[applyQuietHours] Checking ${tasksWithNotifs.length} tasks for quiet hour conflicts`);

    let cancelledTotal = 0;
    const tasksToReschedule = [];

    for (const task of tasksWithNotifs) {
      const ids = task.onesignal_notification_ids;

      // Estimate scheduled times: we know last_scheduled_until and count
      // Cancel ALL queued notifications for tasks that have any overlap —
      // the cron refill will reschedule them with the new quiet hours applied
      const lastScheduled = new Date(task.last_scheduled_until);
      if (lastScheduled < new Date()) continue; // already past, nothing to cancel

      // Check if last_scheduled_until falls in quiet hours — a simple proxy for overlap
      // Also check next_reminder for any immediate conflict
      const hasConflict =
        (task.next_reminder && isInQuietHours(new Date(task.next_reminder), startMin, endMin, timeZone)) ||
        isInQuietHours(new Date(task.last_scheduled_until), startMin, endMin, timeZone);

      if (hasConflict) {
        // Anything booked through the task's reminder plan is cancelled too, and
        // its entry loses the dead id — otherwise the plan would still point at
        // a cancelled push and look "booked" forever.
        const schedule = Array.isArray(task.reminder_schedule) ? task.reminder_schedule : [];
        const scheduleIds = schedule.map((e) => e?.notification_id).filter(isBookedId);
        const toCancel = Array.from(new Set([...ids, ...scheduleIds]));
        console.log(`[applyQuietHours] Task "${task.title}" has quiet-hour conflict, cancelling ${toCancel.length} notifications`);
        await Promise.allSettled(toCancel.map(id => cancelOneSignalNotification(id)));
        await ledgerCancel(base44, toCancel);
        // Clear the booking fields so the refill job re-books it with the new
        // quiet hours on its next run. next_reminder stays: it is the rhythm's
        // own time of day ("pills at 10"), and the refill job starts from it.
        await base44.entities.Task.update(task.id, {
          onesignal_notification_ids: [],
          last_scheduled_until: null,
          ...(scheduleIds.length
            ? { reminder_schedule: schedule.map((e) => (toCancel.includes(e?.notification_id) ? { ...e, notification_id: null } : e)) }
            : {}),
        });
        cancelledTotal += toCancel.length;
        tasksToReschedule.push(task.id);
      }
    }

    console.log(`[applyQuietHours] Done — cancelled ${cancelledTotal} notifications across ${tasksToReschedule.length} tasks`);
    return Response.json({ success: true, cancelledNotifications: cancelledTotal, tasksAffected: tasksToReschedule.length });
  } catch (err) {
    console.error('[applyQuietHours] Error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});