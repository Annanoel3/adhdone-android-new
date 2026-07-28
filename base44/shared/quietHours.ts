// Timezone-aware quiet-hours helpers shared by the reminder refill cron and the
// applyQuietHours on-demand function. Quiet hours are stored on the user profile
// as local "HH:MM" wall-clock strings, so every comparison is done in the user's
// own timezone (via Intl) rather than the backend's UTC runtime.

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