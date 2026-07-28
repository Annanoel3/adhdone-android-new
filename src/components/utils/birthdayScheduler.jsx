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

/**
 * Detects whether free-form task input is actually a birthday reminder and, if so,
 * creates a yearly birthday task (with the 3 cake reminders) and schedules them.
 * Returns { task, person, nextDate } when a birthday was created, or null otherwise.
 */
export async function createBirthdayFromInput(inputText, email) {
  if (!email) return null;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const prompt = `Analyze this input from a user: "${inputText}"

TODAY IS: ${today}

Determine if the user is asking to be reminded of someone's BIRTHDAY — a yearly recurring celebration of a specific person. Strong signals: the word "birthday", "bday", "b-day", "cake", or naming a person together with a date that is clearly their birthday (e.g. "Mom's birthday is July 4", "remind me that Alex's birthday is this wednesday", "don't forget grandma's bday on the 12th").

If it IS a birthday:
- "person": the name of the person whose birthday it is (just the name, e.g. "Mom", "Alex", "Grandma"). If no name is given, use "Birthday".
- "date": resolve the birthday to a concrete YYYY-MM-DD. Use relative language relative to TODAY:
  - "this wednesday" → the Wednesday in the current week (today if today is Wednesday, otherwise the upcoming Wednesday this week; if that day already passed this week, use next week's Wednesday).
  - "next friday" → the next Friday strictly after today.
  - "tomorrow" → today + 1 day.
  - "july 4" / "July 4th" / "7/4" → that month/day in the current year.
  - "the 12th" / "on the 12th" → the 12th of the current month (or next month if already passed).
  The DATE must be the actual birthday (the "day of"), never a reminder offset.

Only return "is_birthday": true when you are confident this is a birthday reminder. If it is a regular task that merely mentions baking a cake or a party, return false.

Return JSON: { "is_birthday": boolean, "person": string|null, "date": "YYYY-MM-DD"|"null" }`;

  let detected;
  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          is_birthday: { type: "boolean" },
          person: { type: "string" },
          date: { type: "string" },
        },
      },
    });
    detected = res;
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