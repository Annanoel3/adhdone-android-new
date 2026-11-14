// "The second Tuesday of every month": a monthly repeat that lands on a
// WEEKDAY of the month instead of a date. Anna, Nov 14 2026: "we need a way to
// allow users to make recurring for second tuesday of every month, third
// thursday, first monday, first sunday etc".
//
// Saved on the task as recurrence_nth_weekday, next to recurrence_pattern
// 'monthly', in the calendar world's own short form: a number (1 to 4, or -1
// for "last") and a two-letter day: "2TU" second Tuesday, "1MO" first Monday,
// "3TH" third Thursday, "-1FR" last Friday. Empty means the same DATE each
// month, as before. It only means anything on a monthly repeat.
//
// The server's copy of the day math. The app's copy is
// src/components/utils/repeatTime.js. Keep the two in step.

const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export type Nth = { n: number; weekday: number };

export function parseNthWeekday(token: any): Nth | null {
  const m = /^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.exec(String(token ?? '').trim().toUpperCase());
  return m ? { n: Number(m[1]), weekday: CODES.indexOf(m[2]) } : null;
}

// The token in its one saved spelling, or null when it isn't one.
export function cleanNthWeekday(token: any): string | null {
  const p = parseNthWeekday(token);
  return p ? `${p.n}${CODES[p.weekday]}` : null;
}

// The task's weekday-of-the-month, only when it repeats monthly.
export function nthOfTask(task: any): Nth | null {
  return task?.recurrence_pattern === 'monthly' ? parseNthWeekday(task?.recurrence_nth_weekday) : null;
}

// The day of the month (1 to 31) that weekday falls on. monthIndex is 0 to 11
// and may run past either end (12 is January of the next year).
export function nthWeekdayDay(year: number, monthIndex: number, nth: Nth): number {
  if (nth.n === -1) {
    const last = new Date(Date.UTC(year, monthIndex + 1, 0));
    return last.getUTCDate() - ((last.getUTCDay() - nth.weekday + 7) % 7);
  }
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((nth.weekday - firstDow + 7) % 7) + (nth.n - 1) * 7;
}

const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const partsOf = (key: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  return m ? { y: Number(m[1]), mi: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
// That weekday's date, as 'YYYY-MM-DD', in the month `offset` months from the
// month `key` is in.
const inMonth = (key: string, offset: number, nth: Nth): string | null => {
  const p = partsOf(key);
  if (!p) return null;
  const first = new Date(Date.UTC(p.y, p.mi + offset, 1));
  const y = first.getUTCFullYear();
  const mi = first.getUTCMonth();
  return keyOf(Date.UTC(y, mi, nthWeekdayDay(y, mi, nth)));
};

// Whether a 'YYYY-MM-DD' day is that weekday of its month.
export function isNthWeekdayKey(key: string, nth: Nth): boolean {
  return !!partsOf(key) && inMonth(key, 0, nth) === String(key).slice(0, 10);
}

// The first such day on or after `key`.
export function firstNthWeekdayOnOrAfter(key: string, nth: Nth): string | null {
  const here = inMonth(key, 0, nth);
  if (!here) return null;
  return here >= String(key).slice(0, 10) ? here : inMonth(key, 1, nth);
}

// One round on: that weekday in the month AFTER the month `key` is in (this
// month's round done early or late still moves to next month's, never twice
// in one month).
export function nextMonthNthWeekdayKey(key: string, nth: Nth): string | null {
  return inMonth(key, 1, nth);
}

// A calendar's own rule for a monthly series on a weekday of the month:
// "FREQ=MONTHLY;BYDAY=2TU" (Google, phone calendars) or
// "FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2". Null for a rule the app has no repeat
// for (several days, a fifth weekday, every N months).
export function nthWeekdayOfRule(rule: any): string | null {
  const r = String(rule || '').toUpperCase();
  if (!/FREQ=MONTHLY/.test(r)) return null;
  const every = /(?:^|[;:])INTERVAL=(\d+)/.exec(r);
  if (every && Number(every[1]) !== 1) return null;
  const by = /(?:^|[;:])BYDAY=([^;]+)/.exec(r);
  if (!by || by[1].includes(',')) return null;
  const one = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(by[1].trim());
  if (!one) return null;
  let n = one[1] ? Number(one[1]) : NaN;
  if (!one[1]) {
    const pos = /(?:^|[;:])BYSETPOS=([+-]?\d+)/.exec(r);
    n = pos ? Number(pos[1]) : NaN;
  }
  return cleanNthWeekday(`${n}${one[2]}`);
}
