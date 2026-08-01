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
  const scheduleEntries = [];

  const kinds = [
    { key: "week_before", kind: "week_before", label: "1 week before" },
    { key: "day_before", kind: "day_before", label: "1 day before" },
    { key: "day_of", kind: "day_of", label: "Day of" },
  ];

  for (const { key, kind, label } of kinds) {
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
      if (id) {
        scheduledIds.push(id);
        scheduleEntries.push({
          notification_id: id,
          send_at: sendAt.toISOString(),
          label,
          notification_title: content.title,
          notification_body: content.body,
        });
      }
    } catch (e) {
      console.error("[birthdayScheduler] Failed to schedule", kind, e);
    }
  }

  if (scheduledIds.length > 0) {
    try {
      await base44.entities.Task.update(task.id, {
        onesignal_notification_ids: scheduledIds,
        reminder_schedule: scheduleEntries,
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
 *
 * Also rolls over birthdays whose day-of has already passed: updates
 * next_reminder to next year's occurrence, clears stale notification IDs,
 * and schedules fresh reminders.
 */
export async function ensureBirthdayReminders(birthdayTasks) {
  const now = new Date();
  let didRollover = false;

  for (const task of birthdayTasks || []) {
    if (!task.birthday_person || task.status !== "active" || !task.next_reminder) continue;

    const birthdayDate = new Date(task.next_reminder);
    // Give a 1-day grace period so "day of" reminders still fire
    const dayAfter = new Date(birthdayDate.getTime() + 24 * 60 * 60 * 1000);
    if (dayAfter > now) continue;

    // Birthday has passed — roll to next year
    const month = birthdayDate.getMonth() + 1;
    const day = birthdayDate.getDate();
    const nextDate = computeNextBirthdayDate(month, day);

    // Cancel old notifications if any
    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
      try {
        const { cancelScheduledReminder } = await import("./reminderScheduler");
        await cancelScheduledReminder(task.onesignal_notification_ids);
      } catch (e) {
        console.error("[birthdayScheduler] Failed to cancel old reminders on rollover", e);
      }
    }

    try {
      await base44.entities.Task.update(task.id, {
        next_reminder: nextDate.toISOString(),
        onesignal_notification_ids: [],
      });
      // Update in-memory so scheduleBirthdayReminders works with fresh data
      task.next_reminder = nextDate.toISOString();
      task.onesignal_notification_ids = [];
      didRollover = true;
    } catch (e) {
      console.error("[birthdayScheduler] Failed to rollover birthday", task.id, e);
    }
  }

  // Schedule reminders for any unscheduled birthday (including just-rolled-over ones)
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

  return didRollover;
}

/**
 * Detects whether free-form task input is actually a birthday reminder and, if so,
 * creates a yearly birthday task (with the 3 cake reminders) and schedules them.
 * Returns { task, person, nextDate } when a birthday was created, or null otherwise.
 */
export async function createBirthdayFromInput(inputText, email) {
  if (!email) return null;

  let detected;
  try {
    const response = await base44.functions.invoke('detectBirthday', {
      inputText,
    });
    detected = response.data || response;
  } catch (e) {
    console.error("[birthdayScheduler] detectBirthday LLM call failed", e);
    return null;
  }

  if (!detected || !detected.is_birthday || !detected.date || detected.date === "null") {
    return null;
  }

  const parts = String(detected.date).split("-").map((n) => parseInt(n, 10));
  const m = parts[1];
  const d = parts[2];
  if (!m || !d) return null;

  const person = (detected.person || "Birthday").trim() || "Birthday";
  const nextDate = computeNextBirthdayDate(m, d);

  const task = await base44.entities.Task.create({
    title: `🎂 ${person}'s Birthday`,
    description: `Birthday reminder for ${person}.`,
    urgency: "medium",
    energy_required: "low",
    status: "active",
    reminder_interval: "once",
    recurrence_pattern: "yearly",
    birthday_person: person,
    birthday_remind_week_before: true,
    birthday_remind_day_before: true,
    birthday_remind_day_of: true,
    next_reminder: nextDate.toISOString(),
    notification_recipient_email: email,
    onesignal_notification_ids: [],
  });

  await scheduleBirthdayReminders(task);
  return { task, person, nextDate };
}