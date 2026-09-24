// Shared reminder title/body logic for recurring task notifications.
// Used by onTaskUpdate and cronRefillReminders so the wording stays consistent
// with the client-side reminderCopy helper: warm, deadline-aware, never a flat
// "Task Reminder — tap to mark as complete!".
//
// "Today", "tomorrow" and the weekday are worked out on the OWNER'S calendar
// (their timezone), the way the app shows them. They used to be compared as UTC
// dates, and a task captured as "due Friday" is saved as Friday 11:59 PM local,
// which is already Saturday in UTC — so a Friday-evening reminder said "due
// tomorrow" and named the wrong weekday for US users.
import { DEFAULT_TIME_ZONE, localDateKey } from './quietHours.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Days since 1970 of the local calendar date — so two dates can be subtracted.
function localDay(iso: string, timeZone: string): number {
  const [y, m, d] = localDateKey(new Date(iso), timeZone).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function dayLabel(dueDay: number, daysAway: number): string {
  // dueDay counts days since 1970 on the owner's calendar, so reading it back
  // as a UTC date gives exactly that local date.
  const due = new Date(dueDay * DAY_MS);
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
  sendAtISO: string,
  timeZone: string = DEFAULT_TIME_ZONE
): { title: string; body: string } {
  const title = (taskTitle || '').trim() || 'your task';
  const quoted = `"${title}"`;
  if (!dueDateISO) {
    // Only tasks with a rhythm the person asked for land here ("remind me at
    // 10 and keep reminding me until I do it"), so no "no pressure" — they
    // asked to be reminded.
    return { title: `📌 ${title}`, body: `Reminder: ${sentence(title)}` };
  }
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const dueDay = localDay(dueDateISO, tz);
  const days = dueDay - localDay(sendAtISO, tz);
  const label = dayLabel(dueDay, days);
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
