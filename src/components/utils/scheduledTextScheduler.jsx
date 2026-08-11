import { base44 } from "@/api/base44Client";
import { scheduleReminder, cancelScheduledReminder } from "./reminderScheduler";

const REMINDER_HOUR = 9;

// The morning-of reminder fires at 9 AM local on the send_at date.
function morningOf(dateIso) {
  const d = new Date(dateIso);
  d.setHours(REMINDER_HOUR, 0, 0, 0);
  return d;
}

/**
 * Schedules the morning-of push reminder for a ScheduledText.
 * Returns the OneSignal notification id (or null if in the past / failed).
 */
export async function scheduleScheduledTextReminder(scheduledText) {
  const email = scheduledText.notification_recipient_email;
  if (!email) return null;
  const sendAt = morningOf(scheduledText.send_at);
  if (sendAt.getTime() <= Date.now()) return null;

  try {
    const id = await scheduleReminder({
      email,
      title: `📞 Time to text ${scheduledText.recipient_name}`,
      body: scheduledText.message,
      sendAtISO: sendAt.toISOString(),
      data: {
        screen: "/Home",
        type: "scheduled_text",
        scheduledTextId: scheduledText.id,
      },
      buttons: [
        { id: "snooze_60", text: "Snooze 1 hour" },
        { id: "send", text: "✉️ Send" },
      ],
    });
    return id;
  } catch (e) {
    console.error("[scheduledTextScheduler] schedule failed", e);
    return null;
  }
}

/**
 * Cancels any existing reminder and schedules a fresh one (used on create/edit).
 * Persists the new notification id on the record.
 */
export async function rescheduleScheduledTextReminder(scheduledText) {
  if (scheduledText.onesignal_notification_ids?.length) {
    await cancelScheduledReminder(scheduledText.onesignal_notification_ids).catch(() => {});
  }
  const id = await scheduleScheduledTextReminder(scheduledText);
  try {
    await base44.entities.ScheduledText.update(scheduledText.id, {
      onesignal_notification_ids: id ? [id] : [],
    });
  } catch (e) {
    console.error("[scheduledTextScheduler] persist id failed", e);
  }
  return id;
}

export async function cancelScheduledTextReminders(scheduledText) {
  if (scheduledText.onesignal_notification_ids?.length) {
    await cancelScheduledReminder(scheduledText.onesignal_notification_ids).catch(() => {});
  }
}