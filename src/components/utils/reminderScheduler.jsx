/**
 * Client-side helper for scheduling and canceling push reminders
 * Uses Base44 server functions that forward to OneSignal
 */

import { base44 } from "@/api/base44Client";

/**
 * Checks if a given time is within quiet hours. Exported so the full-screen
 * alarm set (widgetBridge) follows the same window as pushes do.
 */
export function isInQuietHours(dateTime) {
  // RULES.md hard rule 4: quiet hours default to ON. Only an explicit 'false'
  // (the user turned them off) disables them — a missing value must never read
  // as "off". The defaults match the server and the Layout (22:00–08:00).
  if (localStorage.getItem('quiet_hours_enabled') === 'false') return false;
  const quietStart = localStorage.getItem('quiet_hours_start') || '22:00';
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
  let guard = 0;

  while (isInQuietHours(adjustedTime) && guard++ < 3) {
    const quietEnd = localStorage.getItem('quiet_hours_end') || '08:00';
    const [endHour, endMin] = quietEnd.split(':').map(Number);
    const slot = new Date(adjustedTime);

    // Jump to the end of THIS quiet stretch: the first quiet-end after the
    // slot. Setting the end time on the slot's own day moved a late-evening
    // slot on a later day (11 PM Friday) to 8 AM that same Friday — earlier
    // than the time it was asked for.
    adjustedTime.setHours(endHour, endMin, 0, 0);
    if (adjustedTime <= slot) {
      adjustedTime.setDate(adjustedTime.getDate() + 1);
    }

    // If adjusted time is now in the past, move to tomorrow
    if (adjustedTime < new Date()) {
      adjustedTime.setDate(adjustedTime.getDate() + 1);
    }
  }

  return adjustedTime;
}

/**
 * Returns the time a reminder will ACTUALLY be sent at, after quiet-hour
 * adjustment. Exact reminders (the user's chosen clock time) are never moved.
 * Exported so callers can persist/display the real time, not the requested one.
 */
export function resolveSendTime(sendAtISO, exact) {
  const t = new Date(sendAtISO);
  if (!exact && isInQuietHours(t)) return adjustForQuietHours(t).toISOString();
  return t.toISOString();
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
  buttons,
  exact
}) {
  console.log('[scheduleReminder] Called with:', { email, title, body, sendAtISO, minutesFromNow, taskId, exact });
  
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
    // Adjust for quiet hours — EXCEPT for exact reminders. When the user asked
    // for a specific clock time, that reminder fires at that time, period.
    if (!exact && isInQuietHours(scheduleTime)) {
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
  
  const baseData = {
    screen: "/Tasks",
    ...(taskId && { taskId }),
    ...(data || {})
  };

  // One at a time, not all at once. The send ledger (NotificationLedger) can
  // only turn away a duplicate it has already seen recorded; ten bookings
  // racing in parallel all got past it together.
  const validIds = [];
  const bookedMinutes = new Set();
  let lastBookedAt = null;
  for (let i = 0; i < count; i++) {
    let sendAt = new Date(new Date(startTime).getTime() + (intervalMs * i));

    // Adjust for quiet hours
    if (isInQuietHours(sendAt)) {
      sendAt = adjustForQuietHours(sendAt);
    }

    // Every overnight slot of an hourly reminder moves to the same morning
    // minute — that was nine identical pushes at 8 AM. Only the first one
    // for any minute is booked.
    const minute = Math.floor(sendAt.getTime() / 60000);
    if (bookedMinutes.has(minute)) continue;
    bookedMinutes.add(minute);

    try {
      const notificationId = await scheduleReminder({
        email,
        title,
        body,
        sendAtISO: sendAt.toISOString(),
        taskId,
        data: baseData,
        android_channel_id,
        buttons
      });
      if (notificationId) {
        console.log(`[scheduleRecurringReminders] Scheduled #${i + 1} for ${sendAt.toISOString()}: ${notificationId}`);
        validIds.push(notificationId);
        lastBookedAt = sendAt;
      }
    } catch (error) {
      console.error(`[scheduleRecurringReminders] Failed to schedule #${i + 1}:`, error);
    }
  }

  console.log(`[scheduleRecurringReminders] Scheduled ${validIds.length}/${count} notifications`);

  // Return both the IDs and the last scheduled time so callers can persist
  // last_scheduled_until — the time the last one really goes out (slots moved
  // or skipped for quiet hours no longer line up with start + n × interval),
  // the same thing the refill cron records.
  const lastScheduledUntil = lastBookedAt ? lastBookedAt.toISOString() : null;

  return { notificationIds: validIds, lastScheduledUntil };
}