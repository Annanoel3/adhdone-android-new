// Shared scheduling helpers used by the task creation pipeline.

export const INTERVAL_MS = {
  '10min': 10 * 60 * 1000,
  '20min': 20 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '2hours': 2 * 60 * 60 * 1000,
  '4hours': 4 * 60 * 60 * 1000,
  'daily': 24 * 60 * 60 * 1000,
  'every_other_day': 48 * 60 * 60 * 1000,
};

const RECURRING = Object.keys(INTERVAL_MS);

// A recurring interval is ONLY valid when the user actually used recurring
// language. Anything else is the model guessing — and a wrong guess means the
// user gets pinged every hour forever.
export function stripGuessedRecurrence(parsed, inputText) {
  if (!parsed) return parsed;
  const lower = (inputText || '').toLowerCase();
  if (
    RECURRING.includes(parsed.reminder_interval) &&
    !/\bevery\b|\bhourly\b|\bdaily\b|\beveryday\b|\beach (day|morning|night|hour)\b/.test(lower)
  ) {
    parsed.reminder_interval = null;
  }

  // A date with no time is an all-day thing, full stop — never let a clock time
  // get invented for it later. It becomes a day-only task: one morning
  // heads-up, due at the end of that day.
  if (parsed.target_date && !parsed.target_time) {
    parsed.day_only_task = true;
    // ...and never stop to ask the user for a time. The day IS the answer.
    parsed.needs_date_pick = false;
  }

  return parsed;
}

const localISO = (dateStr, h, min) => {
  const [y, m, d] = String(dateStr).split('-').map((n) => parseInt(n, 10));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
};

// Turns a parsed task into its concrete schedule fields.
export function deriveSchedule(parsed, now = new Date()) {
  const out = { interval: parsed?.reminder_interval || null, nextReminder: null, dueDateISO: null, endDateISO: null, eventTimeISO: null };
  if (!parsed) return out;

  const hasDate = !!parsed.target_date;
  const hasTime = !!parsed.target_time;

  if (hasDate && hasTime) out.interval = 'once';

  if (out.interval === 'once' && parsed.end_date && parsed.end_date !== parsed.target_date) {
    out.endDateISO = localISO(parsed.end_date, 9, 0);
  }

  if (out.interval === 'once' && parsed.classification === 'event' && hasDate && hasTime) {
    const [hh, mm] = parsed.target_time.split(':').map((n) => parseInt(n, 10));
    if (!isNaN(hh) && !isNaN(mm)) out.eventTimeISO = localISO(parsed.target_date, hh, mm);
  }

  if (parsed.day_only_task && hasDate) {
    out.interval = 'once';
    const iso = localISO(parsed.target_date, 9, 0);
    const at = iso ? new Date(iso) : null;
    out.nextReminder = at && at > new Date(now.getTime() + 2 * 60 * 1000) ? at : null;
    out.dueDateISO = localISO(parsed.target_date, 23, 59);
  } else if (hasDate && hasTime) {
    const [hh, mm] = parsed.target_time.split(':').map((n) => parseInt(n, 10));
    const iso = isNaN(hh) || isNaN(mm) ? null : localISO(parsed.target_date, hh, mm);
    const at = iso ? new Date(iso) : null;
    out.nextReminder = at && at > new Date(now.getTime() + 2 * 60 * 1000) ? at : null;
  } else if (INTERVAL_MS[out.interval]) {
    out.nextReminder = new Date(now.getTime() + INTERVAL_MS[out.interval]);
  }

  if (!out.dueDateISO && parsed.due_date && out.interval !== 'once') {
    out.dueDateISO = localISO(parsed.due_date, 23, 59);
  }

  return out;
}