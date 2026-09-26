import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { ledgerCancel } from '../../shared/sendLedger.ts';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { taskId } = body || {};

    if (!taskId) {
      return Response.json({ 
        success: false, 
        error: 'taskId required' 
      }, { status: 400 });
    }

    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return Response.json({ 
        success: false, 
        error: 'OneSignal credentials missing' 
      }, { status: 500 });
    }

    const base44 = createClientFromRequest(req);

    // Who's asking. Only the task's owner (or its reminder recipient), an app
    // admin, or the app's own backend (the internal key) may cancel a task's
    // reminders. Anyone holding a task id used to be able to silence it.
    const internalKey = Deno.env.get('CRON_SECRET')?.trim();
    const presentedKey = typeof body?.internalKey === 'string' ? body.internalKey.trim() : '';
    const isInternal = !!internalKey && presentedKey === internalKey;
    let me: any = null;
    if (!isInternal) {
      try {
        me = await base44.auth.me();
      } catch {
        me = null;
      }
      if (!me?.email) {
        return Response.json({ success: false, error: 'Sign in required' }, { status: 401 });
      }
    }

    const task = await base44.asServiceRole.entities.Task.get(taskId);

    if (!task) {
      return Response.json({ 
        success: false, 
        error: 'Task not found' 
      }, { status: 404 });
    }

    if (!isInternal) {
      const email = String(me.email).toLowerCase();
      const allowed = email === String(task.created_by || '').toLowerCase() ||
        email === String(task.notification_recipient_email || '').toLowerCase() ||
        me.role === 'admin';
      if (!allowed) {
        console.warn('[cancelTaskNotifications] refused: caller does not own this task');
        return Response.json({ success: false, error: 'Not allowed' }, { status: 403 });
      }
    }

    let canceledCount = 0;

    // Cancel all pending OneSignal notifications from onesignal_notification_ids
    if (task.onesignal_notification_ids && Array.isArray(task.onesignal_notification_ids) && task.onesignal_notification_ids.length > 0) {
      console.log(`[cancelTaskNotifications] Canceling ${task.onesignal_notification_ids.length} notifications for task ${taskId}`);

      for (const notificationId of task.onesignal_notification_ids) {
        try {
          const url = `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${ONESIGNAL_APP_ID}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
          });

          if (response.ok) {
            canceledCount++;
            console.log(`[cancelTaskNotifications] Successfully canceled notification ${notificationId}`);
          } else {
            console.warn(`[cancelTaskNotifications] Failed to cancel notification ${notificationId}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[cancelTaskNotifications] Error canceling notification ${notificationId}:`, error);
        }
      }
    }

    // Also cancel one-time/event reminders stored in reminder_schedule —
    // these are separate OneSignal notification IDs not tracked in
    // onesignal_notification_ids and would otherwise keep firing.
    if (task.reminder_schedule && Array.isArray(task.reminder_schedule) && task.reminder_schedule.length > 0) {
      console.log(`[cancelTaskNotifications] Canceling ${task.reminder_schedule.length} reminder_schedule entries for task ${taskId}`);

      for (const entry of task.reminder_schedule) {
        if (!entry?.notification_id) continue;
        try {
          const url = `https://onesignal.com/api/v1/notifications/${entry.notification_id}?app_id=${ONESIGNAL_APP_ID}`;
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
          });

          if (response.ok) {
            canceledCount++;
            console.log(`[cancelTaskNotifications] Successfully canceled reminder_schedule notification ${entry.notification_id}`);
          } else {
            console.warn(`[cancelTaskNotifications] Failed to cancel reminder_schedule notification ${entry.notification_id}: ${response.status}`);
          }
        } catch (error) {
          console.error(`[cancelTaskNotifications] Error canceling reminder_schedule notification ${entry.notification_id}:`, error);
        }
      }
    }

    await ledgerCancel(base44, [
      ...(task.onesignal_notification_ids || []),
      ...((task.reminder_schedule || []).map((e: any) => e?.notification_id)),
    ]);

    // Clear the notification IDs, reminder_schedule, and last_scheduled_until from the task
    await base44.asServiceRole.entities.Task.update(taskId, {
      onesignal_notification_ids: [],
      reminder_schedule: [],
      last_scheduled_until: null
    });

    console.log(`[cancelTaskNotifications] Cleared notification IDs for task ${taskId}`);

    return Response.json({ 
      success: true, 
      canceledCount: canceledCount,
      taskId: taskId
    });
  } catch (error) {
    console.error('[cancelTaskNotifications] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});