/**
 * Client-side helper for scheduling and canceling push reminders
 * Uses Base44 server functions that forward to OneSignal
 */

import { base44 } from "@/api/base44Client";

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
  android_channel_id
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
    payload.sendAtISO = new Date(sendAtISO).toISOString();
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
 * Cancels a scheduled push notification by OneSignal notification ID
 */
export async function cancelScheduledReminder(notificationId) {
  if (!notificationId) {
    console.log('[cancelScheduledReminder] No notification ID provided, skipping');
    return;
  }

  try {
    console.log('[cancelScheduledReminder] Canceling:', notificationId);
    const response = await base44.functions.invoke('cancelScheduled', { notificationId });
    console.log('[cancelScheduledReminder] Canceled:', response);
    return response;
  } catch (error) {
    console.error('[cancelScheduledReminder] Failed:', error);
    // Don't throw - deletion should succeed even if notification cancel fails
  }
}