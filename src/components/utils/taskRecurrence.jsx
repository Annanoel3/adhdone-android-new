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
    onesignal_notification_ids: [],
    reminder_count: 0
  });

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