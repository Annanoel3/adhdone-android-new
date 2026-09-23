import { base44 } from '@/api/base44Client';

// Advance a date by one cycle of the pattern. 'weekdays' steps forward a day
// and then skips Saturday/Sunday, so a business-days habit never lands on the
// weekend.
function advance(date, pattern) {
  const d = new Date(date);
  if (pattern === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (pattern === 'weekdays') {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  } else if (pattern === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (pattern === 'every_other_week') {
    d.setDate(d.getDate() + 14);
  } else if (pattern === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else if (pattern === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}

function getNextRecurrenceDate(task) {
  const baseDate = task.next_reminder ? new Date(task.next_reminder) : new Date();
  const now = new Date();
  let nextDate = advance(baseDate, task.recurrence_pattern);

  // If computed date is still in the past, calculate from now
  if (nextDate <= now) {
    nextDate = advance(now, task.recurrence_pattern);
  }

  return nextDate;
}

// The clock time the user named for the task ("pills at 10"), applied to the
// next occurrence. Without it, a task whose next_reminder had been bumped
// along by hourly reminders carried the bumped time into tomorrow.
function applyAnchorTime(date, task) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task?.anchor_time || ''));
  if (!m) return date;
  const out = new Date(date);
  out.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return out;
}

export async function createNextRecurrence(task) {
  if (!task.recurrence_pattern || task.recurrence_pattern === 'none') return null;

  const nextDate = applyAnchorTime(getNextRecurrenceDate(task), task);

  const newTask = await base44.entities.Task.create({
    title: task.title,
    description: task.description || '',
    urgency: task.urgency || 'medium',
    energy_required: task.energy_required || 'medium',
    reminder_interval: task.reminder_interval || 'once',
    // What makes this task itself, carried to every occurrence: where it
    // happens, what the user originally wrote, how they asked to be reminded,
    // the time they named, and the chore's follow-up step.
    original_input: task.original_input || null,
    location: task.location || null,
    classification: task.classification || 'task',
    life_area: task.life_area || 'personal',
    reminder_wish: task.reminder_wish || null,
    anchor_time: task.anchor_time || null,
    follow_up_title: task.follow_up_title || null,
    follow_up_minutes: task.follow_up_minutes || null,
    status: 'active',
    next_reminder: nextDate.toISOString(),
    recurrence_pattern: task.recurrence_pattern,
    notification_recipient_email: task.notification_recipient_email || null,
    birthday_person: task.birthday_person || null,
    birthday_remind_week_before: task.birthday_remind_week_before,
    birthday_remind_day_before: task.birthday_remind_day_before,
    birthday_remind_day_of: task.birthday_remind_day_of,
    onesignal_notification_ids: [],
    reminder_count: 0
  });

  // For yearly birthday reminders, schedule the 🎂 reminders (1 week before,
  // 1 day before, day of) on the new occurrence so they keep firing every year.
  if (task.birthday_person) {
    try {
      const { scheduleBirthdayReminders } = await import('./birthdayScheduler');
      await scheduleBirthdayReminders(newTask);
    } catch (e) {
      console.error('Failed to schedule birthday reminders for recurrence', e);
    }
  }

  return { task: newTask, nextDate };
}

export function getRecurrenceLabel(pattern) {
  const labels = {
    none: '',
    daily: '🔁 Daily',
    weekdays: '🔁 Weekdays (Mon–Fri)',
    weekly: '🔁 Weekly',
    every_other_week: '🔁 Every other week',
    monthly: '🔁 Monthly',
    yearly: '🎂 Yearly'
  };
  return labels[pattern] || '';
}