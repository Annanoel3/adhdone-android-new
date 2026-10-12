// Timezone-aware quiet-hours helpers shared by the reminder refill cron and the
// applyQuietHours on-demand function. Quiet hours are stored on the user profile
// as local "HH:MM" wall-clock strings, so every comparison is done in the user's
// own timezone (via Intl) rather than the backend's UTC runtime.

// Quiet hours DEFAULT TO ON. A profile that has never touched the setting has
// `quiet_hours_enabled` undefined — treating that as "off" is what let daily
// interval reminders fire at 3 AM local for brand-new users. Only an explicit
// `false` (the user turned it off in Settings) disables the overnight window.
export const DEFAULT_QUIET_START = '22:00';
export const DEFAULT_QUIET_END = '08:00';

export function resolveQuietHours(user: any): { enabled: boolean; startMin: number; endMin: number } {
  return {
    enabled: user?.quiet_hours_enabled !== false,
    startMin: parseHHMM(user?.quiet_hours_start || DEFAULT_QUIET_START),
    endMin: parseHHMM(user?.quiet_hours_end || DEFAULT_QUIET_END),
  };
}

// The one timezone to use for a profile that has no timezone saved yet — the
// same one the morning digest, commute watch and work hours already used.
// Before this, "no timezone" meant "no quiet hours at all" in some jobs and
// "UTC" (a 3 AM quiet-hours end in the US) in others.
export const DEFAULT_TIME_ZONE = 'America/Chicago';

export function userTimeZone(user: any): string {
  return (user && user.timezone) || DEFAULT_TIME_ZONE;
}

function localParts(utcDate: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(utcDate)) p[part.type] = part.value;
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
  return {
    year: parseInt(p.year, 10),
    month: parseInt(p.month, 10),
    day: parseInt(p.day, 10),
    hour,
    minute: parseInt(p.minute, 10),
  };
}

// UTC offset (in minutes) of `timeZone` at the given UTC instant.
function offsetMinutesAt(utcDate: Date, timeZone: string): number {
  const lp = localParts(utcDate, timeZone);
  const localAsUtc = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute);
  return Math.round((localAsUtc - utcDate.getTime()) / 60000);
}

export function localMinutesOfDay(utcDate: Date, timeZone: string): number {
  const lp = localParts(utcDate, timeZone);
  return lp.hour * 60 + lp.minute;
}

// The user's own calendar day ("2026-09-24") at a UTC instant. "Is it today?"
// has to be asked on the user's calendar: 7 PM on a US evening is already
// tomorrow on the server's UTC clock.
export function localDateKey(utcDate: Date, timeZone: string): string {
  const lp = localParts(utcDate, timeZone);
  return `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`;
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function isInQuietHours(
  utcDate: Date,
  startMin: number,
  endMin: number,
  timeZone: string
): boolean {
  if (startMin === endMin) return false;
  const m = localMinutesOfDay(utcDate, timeZone);
  if (startMin > endMin) return m >= startMin || m < endMin; // spans midnight
  return m >= startMin && m < endMin;
}

// If `utcDate` falls inside the quiet window, return the next UTC instant at the
// quiet END time (local wall-clock). Otherwise return `utcDate` unchanged.
export function adjustForQuietHours(
  utcDate: Date,
  startMin: number,
  endMin: number,
  timeZone: string
): Date {
  if (!isInQuietHours(utcDate, startMin, endMin, timeZone)) return utcDate;
  const lp = localParts(utcDate, timeZone);
  const m = lp.hour * 60 + lp.minute;
  let year = lp.year;
  let month = lp.month;
  let day = lp.day;

  // Evening portion of a midnight-spanning window (m >= endMin): the next quiet
  // end is tomorrow. Morning portion (m < endMin): quiet end is today.
  if (m >= endMin) {
    const next = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
    const np = localParts(next, timeZone);
    year = np.year;
    month = np.month;
    day = np.day;
  }

  const guess = Date.UTC(year, month - 1, day, Math.floor(endMin / 60), endMin % 60, 0, 0);
  const off = offsetMinutesAt(new Date(guess), timeZone);
  let quietEndUtc = guess - off * 60000;

  // Safety net (DST edge): never return a time at or before the original.
  if (quietEndUtc <= utcDate.getTime()) {
    quietEndUtc += 24 * 60 * 60 * 1000;
  }
  return new Date(quietEndUtc);
}

// RULES.md hard rule 3: a reminder that repeats at the same time of day (daily,
// every other day) must not inherit the clock time it happened to be created
// at. "Every day", made at 2:57 AM, used to mean 2:57 AM forever — and with
// quiet hours on, that task never got a push of its own at all, only the digest.
//
// If `utcDate` falls inside the user's overnight window, move it to the first
// daytime slot after that window: 9 AM local (the same anchor the app uses for
// day-only tasks), or an hour after the window ends if that is later. The
// minutes are kept, so tasks made on the same night don't all land on 9:00.
// The window is the quiet-hours window even when quiet hours are switched off —
// "off" means "don't hold pushes back", not "3 AM is daytime".
const DAYTIME_ANCHOR_MIN = 9 * 60;

export function anchorToDaytime(
  utcDate: Date,
  startMin: number,
  endMin: number,
  timeZone: string
): Date {
  if (!isInQuietHours(utcDate, startMin, endMin, timeZone)) return utcDate;
  const windowEnd = adjustForQuietHours(utcDate, startMin, endMin, timeZone);
  const slotMin = Math.max(DAYTIME_ANCHOR_MIN, endMin + 60);
  const keepMinutes = localMinutesOfDay(utcDate, timeZone) % 60;
  return new Date(windowEnd.getTime() + (slotMin - endMin + keepMinutes) * 60000);
}

// A REPEATING task's "keep reminding me until I do it" runs from the time the
// person named, each day, and never before it. "Clean the litter box every day
// at 9 PM and keep reminding me until I mark it complete", left undone at
// night, used to start pinging again the minute quiet hours ended (hourly from
// 8 AM) for a chore they do at 9 PM; now it comes back at 9 PM. The named time
// in minutes after midnight, or null when this doesn't apply: not a repeating
// task, no named time, or a rhythm of a day or longer (those keep their slot).
export function rhythmNamedMin(task: any, intervalMs: number): number | null {
  if (!task || intervalMs >= 24 * 60 * 60 * 1000) return null;
  if (!task.recurrence_pattern || task.recurrence_pattern === 'none') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task.anchor_time || ''));
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= 0 && min < 24 * 60 ? min : null;
}

// That day's named time when the moment falls before it, else the moment.
export function notBeforeNamedTime(utcDate: Date, namedMin: number, timeZone: string): Date {
  const local = localMinutesOfDay(utcDate, timeZone);
  return local >= namedMin ? utcDate : new Date(utcDate.getTime() + (namedMin - local) * 60000);
}

// Where one slot of a repeating reminder goes when the owner's quiet hours
// are on. Returns null when the slot is dropped.
//
//  - Once a day or less often: a slot inside the overnight window moves to
//    the daytime anchor above and is never dropped. These used to be moved to
//    the exact minute quiet hours end and then dropped as "the morning digest
//    covers it" — and since a daily slot lands on that same minute every day,
//    a daily reminder that ever got moved there (un-checking a task at night,
//    bringing one back from the Back Burner) went silent for good.
//  - More often than that: a slot inside the window is dropped (the morning
//    digest stands in for the night's pings). A slot that simply falls on the
//    minute quiet hours end is kept — it was never moved, it is a real ping.
export function placeRepeatingSlot(
  slot: Date,
  intervalMs: number,
  startMin: number,
  endMin: number,
  timeZone: string
): Date | null {
  if (intervalMs >= 24 * 60 * 60 * 1000) return anchorToDaytime(slot, startMin, endMin, timeZone);
  return isInQuietHours(slot, startMin, endMin, timeZone) ? null : slot;
}
// RULES.md §9 Q4 — the one time quiet hours give way (Anna, Oct 12 2026: "If a
// user schedules a task or event outside of their quiet hours, that is the one
// time we will ignore their quiet hours. For example, if I had a flight at
// 5 a.m., id want that alarm. Just make sure the only way that would ever
// happen is if a user explicitly says a time outside of their hours.")
//
// True when `ms` is the clock time the person set for this task themselves:
// the task says they did (time_stated — they said or typed a clock time, "5 AM",
// "at 3", "in 20 minutes", or picked one in the app), and this moment IS that
// time: the event's start, or the task's named clock time on its day (on each
// of its days, for a repeating task). Never true for a time the app picked: a part of the day the
// parser turned into a clock time ("tonight", "before bed"), a heads-up before
// the time, a nudge, a snooze, a repeat ping.
export function isTimeTheySet(task: any, ms: number, timeZone: string): boolean {
  if (!task || task.time_stated !== true || !Number.isFinite(ms)) return false;
  const ev = platformMs(task.event_time);
  if (Number.isFinite(ev) && Math.abs(ev - ms) < 60 * 1000) return true;
  // Otherwise: the clock time they named (anchor_time)...
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task.anchor_time || ''));
  if (!m) return false;
  const at = new Date(ms);
  if (localMinutesOfDay(at, timeZone) !== Number(m[1]) * 60 + Number(m[2])) return false;
  const day = localDateKey(at, timeZone);
  // ...on the task's own day, for a one-time task (an app heads-up "a day
  // before" sits at the same clock time on the wrong day)...
  if (!task.recurrence_pattern || task.recurrence_pattern === 'none') {
    return [task.due_date, task.next_reminder, task.event_time]
      .map(platformMs).filter(Number.isFinite)
      .some((t) => localDateKey(new Date(t), timeZone) === day);
  }
  // ...or on one of its days, for a repeating one.
  if (Array.isArray(task.recurrence_days) && task.recurrence_days.length) {
    const [y, mo, d] = day.split('-').map(Number);
    return task.recurrence_days.includes(new Date(Date.UTC(y, mo - 1, d)).getUTCDay());
  }
  return true;
}

// Where a reminder the APP picked goes when it lands inside quiet hours (a
// heads-up an hour before a 5 AM flight, a "night before" after quiet hours
// start): to the end of quiet hours, or nowhere when that's not at least 5
// minutes before the thing itself (`beforeMs`; null for an item with no clock
// time). Returns the time unchanged outside quiet hours or with them off.
export function placeAppReminder(
  atMs: number,
  beforeMs: number | null,
  quiet: { enabled: boolean; startMin: number; endMin: number },
  timeZone: string,
): number | null {
  if (!quiet.enabled || !isInQuietHours(new Date(atMs), quiet.startMin, quiet.endMin, timeZone)) return atMs;
  const moved = adjustForQuietHours(new Date(atMs), quiet.startMin, quiet.endMin, timeZone).getTime();
  if (beforeMs != null && Number.isFinite(beforeMs) && moved > beforeMs - 5 * 60 * 1000) return null;
  return moved;
}

// A stored time ("2026-09-25T04:30:00.000000", UTC with no zone letter, or ISO).
function platformMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
}

// Their day, not the calendar's (Anna, Oct 12 2026: someone on a night shift
// is still on Monday at 2 AM, and their Monday task isn't late yet). It turns
// over in the middle of their quiet hours and is named for the date they wake
// up on: for 10 PM to 8 AM that's 3 AM, for 8 AM to 4 PM it's noon. No quiet
// hours (0/0): midnight. Same rule as the web's todayTasks.theirDayKey.
export function theirDayKey(d: Date, timeZone: string, quietStartMin: number, quietEndMin: number): string {
  if (quietStartMin === quietEndMin) return localDateKey(d, timeZone);
  const half = Math.round(((quietEndMin - quietStartMin + 24 * 60) % (24 * 60)) / 2);
  const shifted = new Date(d.getTime() + half * 60000);
  const key = localDateKey(shifted, timeZone);
  if (localMinutesOfDay(shifted, timeZone) >= quietEndMin) return key;
  const [y, m, dd] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10);
}

// Their day key as Smart Reminders and the morning summary use it: quiet
// hours off is a midnight day.
export function theirDayKeyFor(user: any, d: Date, timeZone: string): string {
  const q = resolveQuietHours(user);
  return q.enabled ? theirDayKey(d, timeZone, q.startMin, q.endMin) : localDateKey(d, timeZone);
}

// When they woke up today. The hour after it goes to the morning summary
// first (Anna, Oct 12 2026: "the summary can get first claim on the hour after
// I wake up"). It's when their quiet hours ended (8 AM with quiet hours off),
// or with "Notice when I wake up" on, when the phone was first unlocked (never
// before quiet hours end). Until the phone reports, null: they're most likely
// still asleep, for up to 4 hours after quiet hours end (as Smart Reminders
// waits), then that cap. Any other sign they're up today (they answered a
// reminder, opened the app) counts from then. Also null inside quiet hours.
export function wakeStartMs(user: any, now: Date, timeZone: string): number | null {
  const q = resolveQuietHours(user);
  if (q.enabled && isInQuietHours(now, q.startMin, q.endMin, timeZone)) return null;
  const endMin = q.enabled ? q.endMin : parseHHMM(DEFAULT_QUIET_END);
  const nowMs = now.getTime();
  const sinceEnd = (localMinutesOfDay(now, timeZone) - endMin + 24 * 60) % (24 * 60);
  const quietEnded = Math.floor(nowMs / 60000) * 60000 - sinceEnd * 60000;
  if (user?.wake_watch !== true) return quietEnded;
  const today = theirDayKeyFor(user, now, timeZone);
  const todays = (v: any) => {
    const ms = platformMs(v);
    return Number.isFinite(ms) && ms <= nowMs && theirDayKeyFor(user, new Date(ms), timeZone) === today ? ms : NaN;
  };
  for (const v of [user.woke_at, user.day_first_sign_at, user.last_active_at]) {
    const ms = todays(v);
    if (Number.isFinite(ms)) return Math.max(ms, quietEnded);
  }
  if (sinceEnd < 4 * 60) return null;
  return quietEnded + 4 * 60 * 60 * 1000;
}
