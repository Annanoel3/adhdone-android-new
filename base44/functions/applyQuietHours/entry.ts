import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

function isInQuietHours(dateTime, quietStart, quietEnd) {
  const date = new Date(dateTime);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const current = hours * 60 + minutes;

  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  // Spans midnight
  if (start > end) {
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

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
    if (!quietStart || !quietEnd) {
      return Response.json({ error: 'quietStart and quietEnd required' }, { status: 400 });
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
        (task.next_reminder && isInQuietHours(task.next_reminder, quietStart, quietEnd)) ||
        isInQuietHours(task.last_scheduled_until, quietStart, quietEnd);

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