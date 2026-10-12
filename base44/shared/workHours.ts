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

// The shift on the calendar day of `day` (in their zone), as minutes after
// midnight, or null when that day has none.
function shiftOn(user: any, shifts: any[], day: Date, timeZone: string): { start: number; end: number } | null {
  let startStr = '';
  let endStr = '';
  if ((user?.work_schedule_mode || 'fixed') === 'varies') {
    const shift = (shifts || []).find((s: any) => s.shift_date === localDateKey(day, timeZone));
    startStr = shift?.arrive_by || '';
    endStr = shift?.ends_at || '';
  } else {
    const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(day);
    const dow = WEEKDAY_INDEX[label] ?? 0;
    const d = (user?.work_fixed_days || []).find((x: any) => Number(x.day) === dow);
    startStr = d?.arrive_by || '';
    endStr = d?.ends_at || '';
  }
  const start = toMinutes(startStr);
  const end = toMinutes(endStr);
  return start == null || end == null ? null : { start, end };
}

// An overnight shift (ends before it starts, 22:00-06:00) belongs to the day
// it STARTS on and runs into the next morning. It used to be looked up only on
// the current calendar day (Oct 12 2026): 3 AM Tuesday, mid-way through
// Monday night's shift, read as "not at work" when Tuesday was a day off (so
// chore nudges got through mid-shift), and midnight to 6 AM Monday read as
// "at work" before the first shift of the week had even started.
export function isWithinWorkHours(user: any, shifts: any[], at: Date): boolean {
  if (!user?.work_quiet_enabled) return false;
  const timeZone = user?.timezone || 'America/Chicago';
  const lp = localParts(at, timeZone);
  const nowMin = lp.hour * 60 + lp.minute;

  const today = shiftOn(user, shifts, at, timeZone);
  if (today) {
    if (today.end < today.start) {
      if (nowMin >= today.start) return true; // tonight's part
    } else if (nowMin >= today.start && nowMin < today.end) {
      return true;
    }
  }
  // The rest of last night's shift, after midnight.
  const yesterdayAt = new Date(at.getTime() - (nowMin + 60) * 60000);
  const last = shiftOn(user, shifts, yesterdayAt, timeZone);
  return !!last && last.end < last.start && nowMin < last.end;
}
