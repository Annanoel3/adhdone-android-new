// Timezone-aware conversion of local wall-clock reminder times to UTC instants.
// Shared by syncGoogleCalendar and resyncEventReminders so ABSOLUTE reminders
// (e.g. "morning of" at 9 AM) fire at 9 AM in the user's timezone, not 9 AM UTC.
import { DEFAULT_TIME_ZONE } from './quietHours.ts';

export function localParts(utcDate: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(utcDate)) p[part.type] = part.value;
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
  return { year: parseInt(p.year, 10), month: parseInt(p.month, 10), day: parseInt(p.day, 10), hour, minute: parseInt(p.minute, 10) };
}

export function offsetMinutesAt(utcDate: Date, timeZone: string): number {
  const lp = localParts(utcDate, timeZone);
  const localAsUtc = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute);
  return Math.round((localAsUtc - utcDate.getTime()) / 60000);
}

// Returns the UTC instant for a given local wall-clock date+time in `timeZone`.
// Backend functions run with a UTC server clock, so `new Date(y, m-1, d, 9, 0)`
// there produces 9 AM UTC — 4 AM US-Central — which is how all-day calendar
// imports ended up anchored in the middle of the night.
export function wallClockToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string | null): Date {
  if (!timeZone) return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const target = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const off = offsetMinutesAt(target, timeZone);
  return new Date(target.getTime() - off * 60000);
}

// Returns the UTC instant for a reminder at local `hour:minute` on the day that
// is `daysBefore` days before the event's local day, in the user's timezone.
export function localReminderUtc(eventUtc: Date, daysBefore: number, hour: number, minute: number, timeZone: string | null): Date {
  if (!timeZone) {
    const d = new Date(eventUtc);
    d.setDate(d.getDate() - daysBefore);
    d.setHours(hour, minute, 0, 0);
    return d;
  }
  const lp = localParts(eventUtc, timeZone);
  const target = new Date(Date.UTC(lp.year, lp.month - 1, lp.day - daysBefore, hour, minute, 0, 0));
  const off = offsetMinutesAt(target, timeZone);
  return new Date(target.getTime() - off * 60000);
}

// The first occurrence of a repeating calendar series after `afterMs`, found by
// stepping whole calendar days, weeks or months in the user's own timezone and
// keeping the series' local clock time. Fixed 24-hour steps on the server's UTC
// clock turned a weekly 9 AM meeting into an 8 AM one once daylight saving
// ended, and "monthly" was +30 days, which lands on the wrong date nearly every
// month. A monthly series on a day some months don't have (the 31st) has no
// occurrence in those months, the same as in the calendar itself.
const DAY_MS = 24 * 60 * 60 * 1000;

export function nextLocalOccurrence(
  startUtc: Date,
  unit: 'day' | 'week' | 'month',
  afterMs: number,
  timeZone: string | null
): Date {
  if (startUtc.getTime() > afterMs) return startUtc;
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const lp = localParts(startUtc, tz);
  // Jump to just before `afterMs` (a long-running daily series would otherwise
  // walk thousands of steps), then walk forward. The jump always undershoots:
  // a month is counted as 31 days, and two steps are taken back for daylight
  // saving days.
  const roughStepMs = unit === 'day' ? DAY_MS : unit === 'week' ? 7 * DAY_MS : 31 * DAY_MS;
  let k = Math.max(1, Math.floor((afterMs - startUtc.getTime()) / roughStepMs) - 2);
  for (let guard = 0; guard < 1000; guard++, k++) {
    let year: number, month: number, day: number;
    if (unit === 'month') {
      const monthIndex = lp.month - 1 + k;
      year = lp.year + Math.floor(monthIndex / 12);
      month = (monthIndex % 12) + 1;
      day = lp.day;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day > daysInMonth) continue;
    } else {
      const d = new Date(Date.UTC(lp.year, lp.month - 1, lp.day + k * (unit === 'week' ? 7 : 1)));
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1;
      day = d.getUTCDate();
    }
    const at = wallClockToUtc(year, month, day, lp.hour, lp.minute, tz);
    if (at.getTime() > afterMs) return at;
  }
  return startUtc;
}