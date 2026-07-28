import { base44 } from '@/api/base44Client';

function getNextRecurrenceDate(task) {
  const baseDate = task.next_reminder ? new Date(task.next_reminder) : new Date();
  const now = new Date();
  let nextDate = new Date(baseDate);

  if (task.recurrence_pattern === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (task.recurrence_pattern === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (task.recurrence_pattern === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  }

  // If computed date is still in the past, calculate from now
  if (nextDate <= now) {
    nextDate = new Date(now);
    if (task.recurrence_pattern === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (task.recurrence_pattern === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (task.recurrence_pattern === 'yearly') {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }
  }

  return nextDate;
}

export async function createNextRecurrence(task) {
  if (!task.recurrence_pattern || task.recurrence_pattern === 'none') return null;

  const nextDate = getNextRecurrenceDate(task);

  const newTask = await base44.entities.Task.create({
    title: task.title,
    description: task.description || '',
    urgency: task.urgency || 'medium',
    energy_required: task.energy_required || 'medium',
    reminder_interval: task.reminder_interval || 'once',
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
    weekly: '🔁 Weekly',
    monthly: '🔁 Monthly',
    yearly: '🎂 Yearly'
  };
  return labels[pattern] || '';
}