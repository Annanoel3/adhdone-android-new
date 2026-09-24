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