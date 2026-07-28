import { base44 } from "@/api/base44Client";
import { scheduleReminder } from "./reminderScheduler";

const REMINDER_HOUR = 9;
const REMINDER_MINUTE = 0;

/**
 * Given a month (1-12) and day, returns the next upcoming occurrence of that
 * birthday at 9:00 local time. If this year's date already passed, rolls to next year.
 */
export function computeNextBirthdayDate(month, day) {
  const now = new Date();
  let candidate = new Date(now.getFullYear(), month - 1, day, REMINDER_HOUR, REMINDER_MINUTE, 0, 0);
  if (candidate <= now) {
    candidate = new Date(now.getFullYear() + 1, month - 1, day, REMINDER_HOUR, REMINDER_MINUTE, 0, 0);
  }
  return candidate;
}

function formatBirthdayDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function reminderContent(person, kind, birthdayIso) {
  const dateStr = formatBirthdayDate(birthdayIso);
  switch (kind) {
    case "week_before":
      return {
        title: `🎂 ${person}'s birthday is in 1 week`,
        body: `Don't lose it — ${person}'s birthday is coming up on ${dateStr}. Time to sort a gift or message.`,
        offsetDays: -7,
      };
    case "day_before":
      return {
        title: `🎂 ${person}'s birthday is tomorrow`,
        body: `Heads up — ${person}'s birthday is tomorrow (${dateStr}).`,
        offsetDays: -1,
      };
    case "day_of":
      return {
        title: `🎂 It's ${person}'s birthday today!`,
        body: `Today is ${person}'s birthday 🎉 Don't forget to reach out.`,
        offsetDays: 0,
      };
    default:
      return null;
  }
}

/**
 * Schedules the enabled birthday reminders (1 week before, 1 day before, day of)
 * for a birthday task and persists the resulting OneSignal IDs on the task.
 * Returns the array of scheduled notification IDs.
 */
export async function scheduleBirthdayReminders(task) {
  const person = task.birthday_person || "Someone";
  const birthdayIso = task.next_reminder;
  if (!birthdayIso) return [];

  const email = task.notification_recipient_email;
  if (!email) return [];

  // Treat unset toggles as enabled (default true) — covers Google-synced birthdays.
  const toggles = {
    week_before: task.birthday_remind_week_before !== false,
    day_before: task.birthday_remind_day_before !== false,
    day_of: task.birthday_remind_day_of !== false,
  };

  const birthdayDate = new Date(birthdayIso);
  const now = new Date();
  const scheduledIds = [];

  const kinds = [
    { key: "week_before", kind: "week_before" },
    { key: "day_before", kind: "day_before" },
    { key: "day_of", kind: "day_of" },
  ];

  for (const { key, kind } of kinds) {
    if (!toggles[key]) continue;
    const content = reminderContent(person, kind, birthdayIso);
    const sendAt = new Date(birthdayDate);
    sendAt.setDate(sendAt.getDate() + content.offsetDays);
    if (sendAt <= now) continue; // skip reminders that would fire in the past

    try {
      const id = await scheduleReminder({
        email,
        title: content.title,
        body: content.body,
        sendAtISO: sendAt.toISOString(),
        taskId: task.id,
        data: { screen: "/TaskNotification", taskId: task.id, type: "birthday_reminder" },
      });
      if (id) scheduledIds.push(id);
    } catch (e) {
      console.error("[birthdayScheduler] Failed to schedule", kind, e);
    }
  }

  if (scheduledIds.length > 0) {
    try {
      await base44.entities.Task.update(task.id, {
        onesignal_notification_ids: scheduledIds,
      });
    } catch (e) {
      console.error("[birthdayScheduler] Failed to persist notification ids", e);
    }
  }

  return scheduledIds;
}

/**
 * For a list of birthday tasks, schedule reminders for any active birthday
 * task that doesn't yet have notification IDs. Idempotent — safe to call on
 * every load. Covers both manually-added and Google-synced birthdays.
 */
export async function ensureBirthdayReminders(birthdayTasks) {
  const unscheduled = (birthdayTasks || []).filter(
    (t) =>
      t.birthday_person &&
      t.status === "active" &&
      t.next_reminder &&
      (!t.onesignal_notification_ids || t.onesignal_notification_ids.length === 0)
  );
  for (const task of unscheduled) {
    try {
      await scheduleBirthdayReminders(task);
    } catch (e) {
      console.error("[birthdayScheduler] ensure failed for", task.id, e);
    }
  }
}