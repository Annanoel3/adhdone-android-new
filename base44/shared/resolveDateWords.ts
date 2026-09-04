// Safety net for date fields coming back from the parser.
//
// The prompt hands the model a full calendar and tells it to answer with
// YYYY-MM-DD. Most of the time it does. But on messy input (a pasted text
// thread especially) it sometimes echoes the user's own wording instead —
// "Saturday", "tomorrow", "next Friday".
//
// That used to be silent data loss: the scheduling code splits a date on "-",
// so "Saturday" parsed to nothing and the task was saved with NO date and NO
// reminders. It looked fine in the list and simply never fired. Losing a day
// the user actually stated is the worst failure this parser can have, so any
// day-word we can understand gets resolved here rather than dropped.

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Resolves one date-ish string to YYYY-MM-DD, or null if it isn't a date at all.
export function resolveDateWord(value: unknown, now = new Date()): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  // Already a proper date — leave it exactly as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value.trim();

  if (raw === 'today' || raw === 'tonight') return fmt(now);
  if (raw === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return fmt(d);
  }

  // "saturday", "on saturday", "this saturday", "next friday"
  const match = raw.match(/^(?:on\s+)?(this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (match) {
    const [, modifier, dayName] = match;
    const target = WEEKDAYS[dayName];
    const d = new Date(now);
    // A bare or "this" day name means the next one coming up — same rule the
    // prompt's weekday table uses, so code and prompt can't disagree.
    let diff = target - now.getDay();
    if (diff <= 0) diff += 7;
    if (modifier === 'next') diff += 7;
    d.setDate(now.getDate() + diff);
    return fmt(d);
  }

  return null;
}

// Normalizes every date field on a parsed task in place.
export function resolveParsedDates(parsed: any, now = new Date()) {
  if (!parsed) return parsed;
  for (const field of ['target_date', 'due_date', 'end_date']) {
    if (parsed[field] == null) continue;
    const resolved = resolveDateWord(parsed[field], now);
    if (resolved) {
      if (resolved !== parsed[field]) {
        console.log(`[resolveParsedDates] ${field}: "${parsed[field]}" → ${resolved}`);
      }
      parsed[field] = resolved;
    } else {
      // Unparseable and not a date — clear it so downstream code isn't handed
      // a string it will silently turn into an invalid date.
      console.warn(`[resolveParsedDates] Could not resolve ${field}: "${parsed[field]}" — clearing`);
      parsed[field] = null;
    }
  }
  return parsed;
}