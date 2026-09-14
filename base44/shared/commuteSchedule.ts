// Resolving "when does this person need to be at work today", in their own
// timezone. Two schedule shapes are supported and neither is an edge case:
//   fixed  → the same weekdays and times every week (stored on the profile)
//   varies → dated WorkShift records, entered a week at a time (retail/service)

import { localParts, wallClockToUtc } from './timezoneReminders.ts';

export interface TodaysCommute {
  arriveBy: string;   // local HH:MM the user must BE there
  arriveUtc: Date;    // that same moment as a UTC instant
  place: string;      // the address to drive to
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

/**
 * Returns today's commute, or null when the user doesn't commute today (day
 * off, no schedule saved, no work address). Callers must treat null as "say
 * nothing" — a commute alert on a day off is worse than no alert at all.
 *
 * `shifts` is the user's WorkShift records; only the one dated today is used.
 */
export function getTodaysCommute(user: any, shifts: any[], now: Date): TodaysCommute | null {
  const place = (user?.work_address || '').trim();
  if (!place) return null;
  const timeZone = user?.timezone || 'America/Chicago';

  let arriveBy = '';
  if ((user?.work_schedule_mode || 'fixed') === 'varies') {
    const today = localDateKey(now, timeZone);
    const shift = (shifts || []).find((s: any) => s.shift_date === today);
    arriveBy = shift?.arrive_by || '';
  } else {
    const dow = localWeekday(now, timeZone);
    const day = (user?.work_fixed_days || []).find((d: any) => Number(d.day) === dow);
    arriveBy = day?.arrive_by || '';
  }
  if (!/^\d{1,2}:\d{2}$/.test(arriveBy)) return null;

  const [h, m] = arriveBy.split(':').map(Number);
  const lp = localParts(now, timeZone);
  const arriveUtc = wallClockToUtc(lp.year, lp.month, lp.day, h, m, timeZone);
  return { arriveBy, arriveUtc, place };
}