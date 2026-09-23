// Shared scheduling helpers used by the in-app task creation pipeline.
//
// The once-vs-interval-vs-null rule below is the SAME rule the server paths use
// via base44/shared/reminderIntervalDecision.ts (native capture + Google
// Calendar sync). It lives twice only because this file runs in the browser and
// that one runs in Deno — if you change the rule here, change it there too.

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
const SUB_DAILY = ['10min', '20min', '30min', '1hour', '2hours', '4hours'];

// A rhythm shorter than a day. A task pinned to a date AND time that the user
// explicitly asked to be nagged about at such a rhythm ("at 10, keep reminding
// me until I finish") keeps the rhythm: the time is where the pings START.
// Server twin: isSubDailyInterval / decideReminderInterval in
// base44/shared/reminderIntervalDecision.ts.
export function wantsRhythmFromTime(parsed) {
  return !!(parsed && parsed.target_date && parsed.target_time && !parsed.day_only_task
    && SUB_DAILY.includes(parsed.reminder_interval));
}

// RULES.md hard rule 3: a reminder that repeats at the same time of day (daily,
// every other day) must not inherit the clock time it happened to be created
// at. "Every day", typed at 2:57 AM, used to mean 2:57 AM forever.
//
// If the first reminder would land inside the user's overnight window, move it
// to the first daytime slot after it: 9 AM (the same anchor day-only tasks use),
// or an hour after the window ends if that is later. The minutes are kept, so
// tasks made on the same night don't all land on 9:00. The window is the
// quiet-hours window even when quiet hours are switched off — "off" means
// "don't hold pushes back", not "3 AM is daytime". Shorter intervals are left
// alone: they have no fixed time of day, and "every 10 minutes" means now.
// The server twin is anchorToDaytime in base44/shared/quietHours.ts.
const DAYTIME_ANCHOR_MIN = 9 * 60;
const SAME_TIME_EVERY_DAY = ['daily', 'every_other_day'];

const hhmmToMin = (value, fallback) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
};

export function anchorToDaytime(date, interval) {
  const at = new Date(date);
  if (!SAME_TIME_EVERY_DAY.includes(interval)) return at;

  let startMin = 22 * 60;
  let endMin = 7 * 60;
  try {
    startMin = hhmmToMin(localStorage.getItem('quiet_hours_start'), startMin);
    endMin = hhmmToMin(localStorage.getItem('quiet_hours_end'), endMin);
  } catch (e) { /* storage unavailable — defaults stand */ }
  if (startMin === endMin) return at;

  const m = at.getHours() * 60 + at.getMinutes();
  const overnight = startMin > endMin ? (m >= startMin || m < endMin) : (m >= startMin && m < endMin);
  if (!overnight) return at;

  const slotMin = Math.max(DAYTIME_ANCHOR_MIN, endMin + 60);
  const out = new Date(at);
  // Evening side of a window that spans midnight → tomorrow morning.
  if (startMin > endMin && m >= startMin) out.setDate(out.getDate() + 1);
  out.setHours(Math.floor(slotMin / 60), (slotMin % 60) + at.getMinutes(), 0, 0);
  return out;
}

// A recurring interval is ONLY valid when the user actually used recurring
// language. Anything else is the model guessing — and a wrong guess means the
// user gets pinged every hour forever.
export function stripGuessedRecurrence(parsed, inputText) {
  if (!parsed) return parsed;
  const lower = (inputText || '').toLowerCase();
  // "Keep reminding me until I finish" / "nag me until it's done" is recurring
  // language too — the parser turns it into an hourly rhythm on purpose.
  if (
    RECURRING.includes(parsed.reminder_interval) &&
    !/\bevery\b|\bhourly\b|\bdaily\b|\beveryday\b|\beach (day|morning|night|hour)\b|\bkeep (on )?(remind|nag|bug|pester|at)|\buntil (i|it|i'?ve|it'?s|i'?m) ?(finish|done|do|get|complete|take|taken)|\bnag me\b|\bover and over\b|\bagain and again\b|\bdon'?t let me forget\b/.test(lower)
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

  if (hasDate && hasTime) out.interval = wantsRhythmFromTime(parsed) ? parsed.reminder_interval : 'once';

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
    // The rhythm starts at the named time; if that time has already gone by
    // today, the first ping is one interval from now.
    if (!out.nextReminder && INTERVAL_MS[out.interval]) {
      out.nextReminder = new Date(now.getTime() + INTERVAL_MS[out.interval]);
    }
  } else if (INTERVAL_MS[out.interval]) {
    out.nextReminder = anchorToDaytime(new Date(now.getTime() + INTERVAL_MS[out.interval]), out.interval);
  }

  if (!out.dueDateISO && parsed.due_date && out.interval !== 'once') {
    out.dueDateISO = localISO(parsed.due_date, 23, 59);
  }

  return out;
}