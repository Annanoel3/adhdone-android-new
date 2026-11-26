// A DAILY CEILING AFTER THREE DAYS AWAY (Anna, Nov 25 2026: "Fix", her answer
// to "I can add a daily ceiling for people who haven't opened the app in a few
// days. That would cut reminders, so it waits for your yes"). That day one
// person who had not opened the app since Nov 19, and had finished and
// answered nothing since, got 11 Smart Reminders and 5 other notifications.
//
// Someone with no sign of them for 3 days gets at most AWAY_DAILY_CEILING
// Smart Reminders in their day (which turns over in the middle of their quiet
// hours), until there is a sign of them again. A sign is what the week-away
// pause counts (cronSmartTaskNudge, PAUSED AFTER A WEEK AWAY): opening the
// app, finishing a task (a notification's or an alarm's Done, the widget),
// answering an alarm or reminder (snooze, Later, closing it; not one that
// just rang out), or adding something from outside the app. That pause is
// unchanged: its heads-up still goes out on day 6, and from day 7 nothing
// from Smart Reminders goes out at all.
//
// Only Smart Reminders' own count and are held back (a roundup is one).
// Reminders at times they set, rhythms they chose, events, birthdays and the
// app's other notifications are not counted and not touched, and nothing
// about how a reminder rings changes.
//
// cronSmartTaskNudge enforces it (before planning and again right before a
// send) and tells the planner how many are left today (AWAY N DAYS).
// cronRefillReminders' owner checks read it too, so a task held back by it is
// not reported as Smart Reminders failing.
//
// ONE A DAY FOR SOMEONE NOT BACK SINCE THEIR FIRST DAY (Anna, Nov 25 2026:
// "uh well fix that", to "People who leave on day one keep getting
// reminders. One got 16 after a 2-hour first visit. The cap only starts after
// 3 days away."). That person was in the app for 2 hours the evening they
// joined and never again: one Smart Reminder a day for 3 days, then 2 or 3 a
// day until the week-away pause. Someone with no sign of them since the day
// they joined (their day, as above) gets at most FIRST_DAY_ONLY_CEILING Smart
// Reminder a day from their second day on, which is what Anna's EARLY DAYS
// rule already asks the planner for (Nov 2 2026: one well-timed mention a day
// to bring them back). Their first day is untouched, and any sign of them
// ends it. The planner is told (NOT BACK SINCE THEIR FIRST DAY).

export const AWAY_CEILING_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const AWAY_DAILY_CEILING = 6;
export const FIRST_DAY_ONLY_CEILING = 1;

const msOf = (v: any): number => {
  if (!v) return NaN;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
};

export type AwayCeiling = { cap: number; why: 'first_day_only' | 'away' };

// The day's ceiling for someone whose last sign was at `awayFromMs`, or null
// when none applies (a sign within the last 3 days, or none known). With
// `joinedMs` and their day key (`dayOf`), someone not seen since the day they
// joined gets FIRST_DAY_ONLY_CEILING from their second day on.
export function awayCeiling(awayFromMs: number, nowMs: number, joinedMs = NaN, dayOf?: (ms: number) => string): AwayCeiling | null {
  if (!Number.isFinite(awayFromMs) || !Number.isFinite(nowMs)) return null;
  if (dayOf && Number.isFinite(joinedMs)) {
    const joinedDay = dayOf(joinedMs);
    if (dayOf(nowMs) > joinedDay && dayOf(awayFromMs) <= joinedDay) return { cap: FIRST_DAY_ONLY_CEILING, why: 'first_day_only' };
  }
  return nowMs - awayFromMs >= AWAY_CEILING_AFTER_MS ? { cap: AWAY_DAILY_CEILING, why: 'away' } : null;
}

export function awayCeilingFor(awayFromMs: number, nowMs: number, joinedMs = NaN, dayOf?: (ms: number) => string): number | null {
  const c = awayCeiling(awayFromMs, nowMs, joinedMs, dayOf);
  return c ? c.cap : null;
}

// Whole days since the last sign (for the planner's AWAY N DAYS line).
export function awayDays(awayFromMs: number, nowMs: number): number {
  return Number.isFinite(awayFromMs) ? Math.floor((nowMs - awayFromMs) / (24 * 60 * 60 * 1000)) : 0;
}

// Smart Reminders that went out on `day` (their day key), read from
// User.smart_nudge_sent_log. Skipped entries don't count; an entry another run
// already sent (no skip) does.
export function smartSentOn(log: any[] | null | undefined, dayOf: (ms: number) => string, day: string): number {
  let n = 0;
  for (const l of Array.isArray(log) ? log : []) {
    if (!l || l.skip) continue;
    const at = msOf(l.at);
    if (Number.isFinite(at) && dayOf(at) === day) n++;
  }
  return n;
}
