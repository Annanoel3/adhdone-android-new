// "Am I at work right now?" — used to keep soft nudges quiet during a shift.
//
// Same two schedule shapes as the commute math: a fixed weekly pattern on the
// profile, or dated WorkShift records. A day with no end time can't define a
// window, so it's treated as "not at work" rather than guessing an 8-hour shift
// and silencing someone's whole evening.

import { localParts } from './timezoneReminders.ts';
import { localDateKey } from './commuteSchedule.ts';

function toMinutes(hhmm: string): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function isWithinWorkHours(user: any, shifts: any[], at: Date): boolean {
  if (!user?.work_quiet_enabled) return false;
  const timeZone = user?.timezone || 'America/Chicago';

  let startStr = '';
  let endStr = '';
  if ((user?.work_schedule_mode || 'fixed') === 'varies') {
    const shift = (shifts || []).find((s: any) => s.shift_date === localDateKey(at, timeZone));
    startStr = shift?.arrive_by || '';
    endStr = shift?.ends_at || '';
  } else {
    const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
    const dow = WEEKDAY_INDEX[label] ?? 0;
    const day = (user?.work_fixed_days || []).find((d: any) => Number(d.day) === dow);
    startStr = day?.arrive_by || '';
    endStr = day?.ends_at || '';
  }

  const start = toMinutes(startStr);
  const end = toMinutes(endStr);
  if (start == null || end == null) return false;

  const lp = localParts(at, timeZone);
  const nowMin = lp.hour * 60 + lp.minute;
  // Overnight shift (ends before it starts) wraps past midnight.
  if (end < start) return nowMin >= start || nowMin < end;
  return nowMin >= start && nowMin < end;
}