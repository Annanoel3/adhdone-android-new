import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { isInQuietHours, parseHHMM } from '../../shared/quietHours.ts';

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
    const timeZone = user.timezone || null;
    const quietEnabled = user.quiet_hours_enabled !== false;
    const startStr = user.quiet_hours_start || quietStart || '22:00';
    const endStr = user.quiet_hours_end || quietEnd || '08:00';
    const startMin = parseHHMM(startStr);
    const endMin = parseHHMM(endStr);

    if (!quietEnabled || !timeZone) {
      return Response.json({ success: true, skipped: 'quiet hours disabled or no timezone on profile' });
    }

    // Fetch all active tasks for this user with queued notifications
    const tasks = await base44.entities.Task.filter({
      status: 'active',
      notification_recipient_email: user.email
    });

    const tasksWithNotifs = tasks.filter(t =>
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
        console.log(`[applyQuietHours] Task "${task.title}" has quiet-hour conflict, cancelling ${ids.length} notifications`);
        await Promise.allSettled(ids.map(id => cancelOneSignalNotification(id)));
        // Wipe scheduling fields so cron refill picks it up immediately
        await base44.entities.Task.update(task.id, {
          onesignal_notification_ids: [],
          last_scheduled_until: null,
          next_reminder: null
        });
        cancelledTotal += ids.length;
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