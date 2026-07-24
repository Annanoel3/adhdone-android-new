// Shared reminder title/body logic for recurring task notifications.
// Used by onTaskUpdate and cronRefillReminders so the wording stays consistent.
//
// Day comparison uses UTC date strings (YYYY-MM-DD) of the scheduled send time
// and the due_date — both anchored to the same timezone consistently.
//  - send day == due day  → "📅 Due Today"
//  - send day >  due day  → "⚠️ Overdue Task"
//  - otherwise            → "Task Reminder 📋"

export function getReminderContent(
  taskTitle: string | null | undefined,
  dueDateISO: string | null | undefined,
  sendAtISO: string
): { title: string; body: string } {
  const title = taskTitle || 'You have a task due';
  const baseBody = `${title}\n\nTap to mark as complete!`;
  if (!dueDateISO) {
    return { title: 'Task Reminder 📋', body: baseBody };
  }
  const sendDay = new Date(sendAtISO).toISOString().split('T')[0];
  const dueDay = new Date(dueDateISO).toISOString().split('T')[0];
  if (sendDay === dueDay) {
    return { title: '📅 Due Today', body: `${title} is due today!\n\nTap to mark as complete!` };
  }
  if (sendDay > dueDay) {
    return { title: '⚠️ Overdue Task', body: `${title} is overdue!\n\nTap to mark as complete!` };
  }
  return { title: 'Task Reminder 📋', body: baseBody };
}