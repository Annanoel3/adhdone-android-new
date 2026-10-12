// Resolving "when does this person need to be at work today", in their own
// timezone. Two schedule shapes are supported and neither is an edge case:
//   fixed  → the same weekdays and times every week (stored on the profile)
//   varies → dated WorkShift records, entered a week at a time (retail/service)

import { localParts, wallClockToUtc } from './timezoneReminders.ts';

export interface TodaysCommute {
  arriveBy: string;   // local HH:MM the user must BE there
  arriveUtc: Date;    // that same moment as a UTC instant
  place: string;      // the address to drive to
  dateKey: string;    // the local date of that arrival (YYYY-MM-DD): the shift's own day
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function localDateKey(now: Date, timeZone: string): string {
  const lp = localParts(now, timeZone);
  return `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`;
}

function localWeekday(now: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return WEEKDAY_INDEX[label] ?? 0;
}

// The arrival on the local calendar day of `dayAt`, or null when that day has no shift.
function arrivalOn(user: any, shifts: any[], dayAt: Date, timeZone: string): { arriveBy: string; arriveUtc: Date; dateKey: string } | null {
  let arriveBy = '';
  const dateKey = localDateKey(dayAt, timeZone);
  if ((user?.work_schedule_mode || 'fixed') === 'varies') {
    const shift = (shifts || []).find((s: any) => s.shift_date === dateKey);
    arriveBy = shift?.arrive_by || '';
  } else {
    const dow = localWeekday(dayAt, timeZone);
    const day = (user?.work_fixed_days || []).find((d: any) => Number(d.day) === dow);
    arriveBy = day?.arrive_by || '';
  }
  if (!/^\d{1,2}:\d{2}$/.test(arriveBy)) return null;
  const [h, m] = arriveBy.split(':').map(Number);
  const lp = localParts(dayAt, timeZone);
  return { arriveBy, arriveUtc: wallClockToUtc(lp.year, lp.month, lp.day, h, m, timeZone), dateKey };
}

/**
 * Returns the commute that's coming up (today's, or a shift starting just
 * after midnight), or null when the user doesn't commute (day off, no
 * schedule saved, no work address). Callers must treat null as "say nothing"
 * — a commute alert on a day off is worse than no alert at all. Claims made
 * for it ("already warned", "already left") are keyed by its dateKey.
 *
 * `shifts` is the user's WorkShift records; only today's and tomorrow's are used.
 */
export function getTodaysCommute(user: any, shifts: any[], now: Date): TodaysCommute | null {
  const place = (user?.work_address || '').trim();
  if (!place) return null;
  const timeZone = user?.timezone || 'America/Chicago';

  const today = arrivalOn(user, shifts, now, timeZone);
  if (today && today.arriveUtc.getTime() > now.getTime()) return { ...today, place };
  // A shift that starts just after midnight (12:30 AM) is tonight's drive: its
  // leave-now comes before the date changes (Oct 12 2026, night shifts).
  const lp = localParts(now, timeZone);
  const minsToMidnight = 24 * 60 - (lp.hour * 60 + lp.minute);
  const next = arrivalOn(user, shifts, new Date(now.getTime() + (minsToMidnight + 60) * 60000), timeZone);
  if (next && next.arriveUtc.getTime() - now.getTime() <= 6 * 60 * 60 * 1000) return { ...next, place };
  return today ? { ...today, place } : null;
}
