import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const { taskId } = await req.json();

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
    const task = await base44.asServiceRole.entities.Task.get(taskId);

    if (!task) {
      return Response.json({ 
        success: false, 
        error: 'Task not found' 
      }, { status: 404 });
    }

    let canceledCount = 0;

    // Cancel all pending OneSignal notifications
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

    // Clear the notification IDs and last_scheduled_until from the task
    await base44.asServiceRole.entities.Task.update(taskId, {
      onesignal_notification_ids: [],
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