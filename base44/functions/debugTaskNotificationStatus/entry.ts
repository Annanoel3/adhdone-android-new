import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Diagnostic: fetches the real OneSignal status for every notification ID stored
// on a task, so we can tell whether the DB's onesignal_notification_ids are still
// live or have been silently canceled in OneSignal.

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { taskId } = body;

    if (!taskId) {
      return Response.json({ success: false, error: 'taskId required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const task = await base44.asServiceRole.entities.Task.get(taskId);

    if (!task) {
      return Response.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !restKey) {
      return Response.json({ success: false, error: 'OneSignal credentials missing' }, { status: 500 });
    }

    const ids = Array.isArray(task.onesignal_notification_ids) ? task.onesignal_notification_ids : [];
    const statuses = [];

    for (const id of ids) {
      try {
        const res = await fetch(`https://onesignal.com/api/v1/notifications/${id}?app_id=${appId}`, {
          headers: { Authorization: `Basic ${restKey}` }
        });
        const json = await res.json().catch(() => ({}));
        statuses.push({
          id,
          http_status: res.status,
          canceled: json.canceled,
          errored: json.errored,
          remaining: json.remaining,
          successful: json.successful,
          failed: json.failed,
          queued: json.queued,
          send_after: json.send_after,
          errors: json.errors
        });
      } catch (e) {
        statuses.push({ id, error: String(e) });
      }
    }

    return Response.json({
      success: true,
      task_id: task.id,
      title: task.title,
      reminder_interval: task.reminder_interval,
      next_reminder: task.next_reminder,
      last_scheduled_until: task.last_scheduled_until,
      notification_ids_count: ids.length,
      statuses
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});