/**
 * Client-side helper for scheduling and canceling push reminders
 * Uses Base44 server functions that forward to OneSignal
 */

import { base44 } from "@/api/base44Client";

/**
 * Checks if a given time is within quiet hours
 */
function isInQuietHours(dateTime) {
  const quietStart = localStorage.getItem('quiet_hours_start') || '20:00';
  const quietEnd = localStorage.getItem('quiet_hours_end') || '08:00';
  
  const date = new Date(dateTime);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTime = hours * 100 + minutes; // Convert to HHMM format for easy comparison
  
  const [startHour, startMin] = quietStart.split(':').map(Number);
  const [endHour, endMin] = quietEnd.split(':').map(Number);
  const startTime = startHour * 100 + startMin;
  const endTime = endHour * 100 + endMin;
  
  // Handle case where quiet hours span midnight (e.g., 8 PM to 8 AM)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  } else {
    return currentTime >= startTime && currentTime < endTime;
  }
}

/**
 * Adjusts send time to avoid quiet hours
 */
function adjustForQuietHours(dateTime) {
  let adjustedTime = new Date(dateTime);
  
  while (isInQuietHours(adjustedTime)) {
    const quietEnd = localStorage.getItem('quiet_hours_end') || '08:00';
    const [endHour, endMin] = quietEnd.split(':').map(Number);
    
    // Jump to the end of quiet hours
    adjustedTime.setHours(endHour, endMin, 0, 0);
    
    // If adjusted time is now in the past, move to tomorrow
    if (adjustedTime < new Date()) {
      adjustedTime.setDate(adjustedTime.getDate() + 1);
    }
  }
  
  return adjustedTime;
}

/**
 * Schedules push notifications and returns OneSignal notification ID
 */
export async function scheduleReminder({
  email,
  title,
  body,
  minutesFromNow,
  sendAtISO,
  taskId,
  data,
  android_channel_id,
  buttons
}) {
  console.log('[scheduleReminder] Called with:', { email, title, body, sendAtISO, minutesFromNow, taskId });
  
  if (!email) throw new Error("email required");
  if (!title) throw new Error("title required");
  if (!body) throw new Error("body required");

  const payload = {
    toUserExternalId: email,
    title,
    body,
  };

  if (sendAtISO) {
    let scheduleTime = new Date(sendAtISO);
    // Adjust for quiet hours
    if (isInQuietHours(scheduleTime)) {
      scheduleTime = adjustForQuietHours(scheduleTime);
      console.log('[scheduleReminder] Adjusted time to avoid quiet hours:', scheduleTime.toISOString());
    }
    payload.sendAtISO = scheduleTime.toISOString();
    console.log('[scheduleReminder] Using absolute time:', payload.sendAtISO);
  } else if (typeof minutesFromNow === "number") {
    payload.minutesFromNow = minutesFromNow;
    console.log('[scheduleReminder] Using relative time:', minutesFromNow, 'minutes');
  }

  if (data || taskId) {
    payload.data = {
      screen: "/Tasks",
      ...(taskId && { taskId }),
      ...(data || {})
    };
  }

  if (android_channel_id) {
    payload.android_channel_id = android_channel_id;
  }

  if (buttons && buttons.length > 0) {
    payload.buttons = buttons;
  }

  console.log('[scheduleReminder] Full payload to schedulePush:', JSON.stringify(payload, null, 2));

  try {
    console.log('[scheduleReminder] Invoking base44.functions.invoke("schedulePush", ...)');
    const response = await base44.functions.invoke('schedulePush', payload);
    console.log('[scheduleReminder] Raw response:', response);
    
    const result = response.data || response;
    console.log('[scheduleReminder] Result:', result);
    
    if (result.success === false) {
      console.error('[scheduleReminder] Function returned success: false', result);
      throw new Error(result.error || 'Failed to schedule notification');
    }
    
    console.log('[scheduleReminder] SUCCESS - Notification ID:', result.notificationId);
    return result.notificationId; // Return the OneSignal notification ID
  } catch (error) {
    console.error('[scheduleReminder] FAILED - Error:', error);
    console.error('[scheduleReminder] Error details:', error.message, error.stack);
    throw error;
  }
}

/**
 * Cancels scheduled push notification(s) by OneSignal notification ID(s)
 * Accepts either a single ID string or an array of IDs
 */
export async function cancelScheduledReminder(notificationIds) {
  if (!notificationIds) {
    console.log('[cancelScheduledReminder] No notification ID provided, skipping');
    return;
  }

  // Convert single ID to array for uniform processing
  const idsArray = Array.isArray(notificationIds) ? notificationIds : [notificationIds];

  try {
    console.log('[cancelScheduledReminder] Canceling notifications:', idsArray);
    
    // Cancel all notifications in parallel
    const cancelPromises = idsArray.map(id => 
      base44.functions.invoke('cancelScheduled', { notificationId: id })
        .catch(error => {
          console.error(`[cancelScheduledReminder] Failed to cancel ${id}:`, error);
          return null; // Don't fail the whole operation
        })
    );
    
    const results = await Promise.all(cancelPromises);
    console.log('[cancelScheduledReminder] Canceled all:', results);
    return results;
  } catch (error) {
    console.error('[cancelScheduledReminder] Failed:', error);
    // Don't throw - deletion should succeed even if notification cancel fails
  }
}

/**
 * Schedules multiple recurring reminders and returns array of notification IDs
 */
export async function scheduleRecurringReminders({
  email,
  title,
  body,
  startTime,
  intervalMs,
  count = 10, // Schedule next 10 occurrences
  taskId,
  data,
  android_channel_id,
  buttons
}) {
  console.log('[scheduleRecurringReminders] Scheduling', count, 'notifications starting at', startTime);
  
  const notificationIds = [];
  const baseData = {
    screen: "/Tasks",
    ...(taskId && { taskId }),
    ...(data || {})
  };

  // Schedule all reminders in parallel
  const schedulePromises = [];
  for (let i = 0; i < count; i++) {
    let sendAt = new Date(new Date(startTime).getTime() + (intervalMs * i));
    
    // Adjust for quiet hours
    if (isInQuietHours(sendAt)) {
      sendAt = adjustForQuietHours(sendAt);
    }
    
    schedulePromises.push(
      scheduleReminder({
        email,
        title,
        body,
        sendAtISO: sendAt.toISOString(),
        taskId,
        data: baseData,
        android_channel_id,
        buttons
      }).then(notificationId => {
        if (notificationId) {
          console.log(`[scheduleRecurringReminders] Scheduled #${i + 1} for ${sendAt.toISOString()}: ${notificationId}`);
        }
        return notificationId;
      }).catch(error => {
        console.error(`[scheduleRecurringReminders] Failed to schedule #${i + 1}:`, error);
        return null;
      })
    );
  }

  const results = await Promise.all(schedulePromises);
  const validIds = results.filter(id => id !== null);

  console.log(`[scheduleRecurringReminders] Scheduled ${validIds.length}/${count} notifications`);

  // Return both the IDs and the last scheduled time so callers can persist last_scheduled_until
  const lastScheduledUntil = validIds.length > 0
    ? new Date(new Date(startTime).getTime() + intervalMs * (validIds.length - 1)).toISOString()
    : null;

  return { notificationIds: validIds, lastScheduledUntil };
}