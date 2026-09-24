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

// Every body names the task. The body is the line people read in the
// notification (and the only line the dashboard lists), and it is what the
// spoken alarm reads out loud, so "no pressure, just a friendly nudge" on its
// own tells nobody what the reminder is for.
function sentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

export function getReminderContent(
  taskTitle: string | null | undefined,
  dueDateISO: string | null | undefined,
  sendAtISO: string
): { title: string; body: string } {
  const title = (taskTitle || '').trim() || 'your task';
  const quoted = `"${title}"`;
  if (!dueDateISO) {
    // Only tasks with a rhythm the person asked for land here ("remind me at
    // 10 and keep reminding me until I do it"), so no "no pressure" — they
    // asked to be reminded.
    return { title: `📌 ${title}`, body: `Reminder: ${sentence(title)}` };
  }
  const due = new Date(dueDateISO);
  const days = utcDay(dueDateISO) - utcDay(sendAtISO);
  const label = dayLabel(due, days);
  if (days < 0) {
    return { title: `⚠️ ${title}`, body: `${quoted} slipped past ${label}. No shame — just pick it back up when you can.` };
  }
  if (days === 0) {
    return { title: `📅 ${title}`, body: `${quoted} is due today — you've got this. Tap when it's done.` };
  }
  if (days === 1) {
    return { title: `Heads up: ${title}`, body: `${quoted} is due tomorrow — plenty of time to plan for it.` };
  }
  return { title: `Don't forget: ${title}`, body: `${quoted} is due ${label} — plenty of time to get it done.` };
}