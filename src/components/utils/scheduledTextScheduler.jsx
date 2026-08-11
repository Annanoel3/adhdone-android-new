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
 * Schedules the initial push reminder(s) for a ScheduledText.
 *  - Day-only (no send_time): one reminder at 9 AM local on the send date.
 *  - Time-specific (send_time set): two reminders — at the exact send_at time,
 *    then a 10-minute follow-up.
 * Returns { ids, lastRemindedAt } — lastRemindedAt seeds the cron dedup so the
 * hourly cron pass doesn't fire before the first hourly interval elapses.
 */
export async function scheduleScheduledTextReminder(scheduledText) {
  const email = scheduledText.notification_recipient_email;
  if (!email) return { ids: [], lastRemindedAt: null };

  const hasTime = !!scheduledText.send_time;
  const baseDue = hasTime
    ? new Date(scheduledText.send_at)
    : morningOf(scheduledText.send_at);

  if (baseDue.getTime() <= Date.now()) return { ids: [], lastRemindedAt: null };

  const slots = hasTime
    ? [baseDue, new Date(baseDue.getTime() + 10 * 60 * 1000)]
    : [baseDue];

  const data = {
    screen: "/Home",
    type: "scheduled_text",
    scheduledTextId: scheduledText.id,
  };
  const buttons = [
    { id: "snooze_60", text: "Snooze 1 hour" },
    { id: "send", text: "✉️ Send" },
  ];

  const ids = [];
  for (const slot of slots) {
    if (slot.getTime() <= Date.now()) continue;
    try {
      const id = await scheduleReminder({
        email,
        title: `📞 Time to text ${scheduledText.recipient_name}`,
        body: scheduledText.message,
        sendAtISO: slot.toISOString(),
        data,
        buttons,
      });
      if (id) ids.push(id);
    } catch (e) {
      console.error("[scheduledTextScheduler] schedule failed", e);
    }
  }

  // Seed dedup to the last pre-scheduled slot so the hourly cron waits one
  // full interval after the initial reminder(s) before firing.
  const lastRemindedAt = slots.length ? slots[slots.length - 1].toISOString() : null;
  return { ids, lastRemindedAt };
}

/**
 * Cancels any existing reminder and schedules fresh ones (used on create/edit).
 * Persists the new notification ids + dedup seed on the record.
 */
export async function rescheduleScheduledTextReminder(scheduledText) {
  if (scheduledText.onesignal_notification_ids?.length) {
    await cancelScheduledReminder(scheduledText.onesignal_notification_ids).catch(() => {});
  }
  const { ids, lastRemindedAt } = await scheduleScheduledTextReminder(scheduledText);
  try {
    await base44.entities.ScheduledText.update(scheduledText.id, {
      onesignal_notification_ids: ids,
      ...(lastRemindedAt ? { last_reminded_at: lastRemindedAt } : {}),
      snoozed_until: null,
    });
  } catch (e) {
    console.error("[scheduledTextScheduler] persist failed", e);
  }
  return ids;
}

export async function cancelScheduledTextReminders(scheduledText) {
  if (scheduledText.onesignal_notification_ids?.length) {
    await cancelScheduledReminder(scheduledText.onesignal_notification_ids).catch(() => {});
  }
}