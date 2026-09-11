// Shared reminder title/body logic for recurring task notifications.
// Used by onTaskUpdate and cronRefillReminders so the wording stays consistent
// with the client-side reminderCopy helper: warm, deadline-aware, never a flat
// "Task Reminder — tap to mark as complete!".
//
// Day comparison uses UTC date strings (YYYY-MM-DD) of the scheduled send time
// and the due_date — both anchored to the same timezone consistently.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function utcDay(iso: string): number {
  const d = new Date(iso);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

function dayLabel(due: Date, daysAway: number): string {
  if (Math.abs(daysAway) < 7) return WEEKDAYS[due.getUTCDay()];
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function getReminderContent(
  taskTitle: string | null | undefined,
  dueDateISO: string | null | undefined,
  sendAtISO: string
): { title: string; body: string } {
  const title = taskTitle || 'your task';
  if (!dueDateISO) {
    return { title: `📌 ${title}`, body: "Whenever you've got a minute — no pressure, just a friendly nudge." };
  }
  const due = new Date(dueDateISO);
  const days = utcDay(dueDateISO) - utcDay(sendAtISO);
  const label = dayLabel(due, days);
  if (days < 0) {
    return { title: `⚠️ ${title}`, body: `This one slipped past ${label}. No shame — just pick it back up when you can.` };
  }
  if (days === 0) {
    return { title: `📅 ${title}`, body: "Due today — you've got this. Tap when it's done." };
  }
  if (days === 1) {
    return { title: `Heads up: ${title}`, body: "Tomorrow's the day — plenty of time to plan for it." };
  }
  return { title: `Don't forget: ${title}`, body: `Plenty of time before ${label} to get it done.` };
}