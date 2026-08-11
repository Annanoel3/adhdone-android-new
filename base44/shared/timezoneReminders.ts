// Timezone-aware conversion of local wall-clock reminder times to UTC instants.
// Shared by syncGoogleCalendar and resyncEventReminders so ABSOLUTE reminders
// (e.g. "morning of" at 9 AM) fire at 9 AM in the user's timezone, not 9 AM UTC.

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