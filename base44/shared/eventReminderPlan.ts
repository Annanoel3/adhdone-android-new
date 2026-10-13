// The ONE place a dated one-time task or event gets its reminder plan.
//
// Used by the Google Calendar import (at create time) and by cronRefillReminders
// (for a task dated more than ~30 days out, which the app cannot book). The
// import used to do this inline and save nothing when no push could be booked,
// which is how a dated item ended up with no reminders and no plan — invisible
// to the hourly job forever.
//
// Every entry comes back PLANNED, not booked: its notification_id is a
// `planned_…` placeholder (the same convention the birthday planner uses), never
// a real OneSignal id. The placeholder is unique per entry so the reminder
// editor can still remove one entry without touching the others. OneSignal
// refuses to schedule more than ~30 days ahead, so far-out entries stay planned
// and cronRefillReminders' event pass books them once they come inside the
// window. Nothing is ever booked early.

import { localReminderUtc } from './timezoneReminders.ts';
import { DEFAULT_TIME_ZONE, placeAppReminder } from './quietHours.ts';

// Three since Oct 13 2026: an afternoon or evening event's heads-ups are the
// night before, the morning of and "in about an hour" / "leave now" (Anna: a
// 5 PM Bike Night with nothing between the night before and 4 PM was missed).
export const MAX_REMINDERS_PER_EVENT = 3;

// OneSignal's limit is 30 days; stay a day inside it.
export const BOOKABLE_WINDOW_MS = 29 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
// How long after an all-day event's 9 AM anchor its reminders may still go:
// the rest of that day (quiet hours that end at 4 PM move the morning-of there).
const ALL_DAY_GRACE_MS = 14 * 60 * 60 * 1000;

export type PlanEntry = {
  notification_id: string; // `planned_…` until a real OneSignal id replaces it
  send_at: string;
  label: string;
  notification_title: string;
  notification_body: string;
};

// True when an entry's id is a real OneSignal id (not empty, not a placeholder).
export function isBookedId(id: unknown): boolean {
  return !!id && !String(id).startsWith('planned_');
}

export function isBookableNow(sendAtISO: string, nowMs: number = Date.now()): boolean {
  const at = new Date(sendAtISO).getTime();
  return at > nowMs + 2 * 60 * 1000 && at - nowMs <= BOOKABLE_WINDOW_MS;
}

/**
 * Turns generateReminderSchedule's raw specs into at most
 * MAX_REMINDERS_PER_EVENT concrete, unbooked plan entries.
 *
 * rawReminders entries are either ABSOLUTE (days_before + local hour/minute) or
 * RELATIVE (relative_minutes_before the start).
 *
 * `quiet` (the owner's quiet hours, resolveQuietHours): a reminder the app
 * picked that lands inside them moves to when they end, or is dropped when
 * that's too late (RULES.md §9 Q4). Only the start itself, when
 * `startIsTheirs` (a time they set: isTimeTheySet), stays inside them — a
 * 5 AM flight's reminder at 5 AM. This runs BEFORE the two-reminder cap, so
 * that one is no longer crowded out by an hour-before heads-up at 4 AM.
 */
export function buildEventReminderPlan(opts: {
  taskId: string;
  rawReminders: any[];
  eventStartISO: string;
  title: string;
  isAllDay: boolean;
  isEvent: boolean;
  timeZone: string | null;
  nowMs?: number;
  quiet?: { enabled: boolean; startMin: number; endMin: number };
  startIsTheirs?: boolean;
}): PlanEntry[] {
  const { taskId, rawReminders, eventStartISO, title, isAllDay, isEvent, timeZone } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const start = new Date(eventStartISO);
  const startMs = start.getTime();
  const earliest = nowMs + 2 * 60 * 1000;
  // Where a moment goes under quiet hours (null = dropped). See above.
  const place = (atMs: number): number | null => {
    if (!opts.quiet) return atMs;
    if (opts.startIsTheirs && Math.abs(atMs - startMs) < 60 * 1000) return atMs;
    return placeAppReminder(atMs, isAllDay ? null : startMs, opts.quiet, timeZone || DEFAULT_TIME_ZONE);
  };

  let entries = (rawReminders || [])
    .map((r: any) => {
      const isRelative = r.relative_minutes_before != null;
      const at = isRelative
        ? new Date(startMs - r.relative_minutes_before * 60 * 1000)
        // A local wall-clock time ("night before at 8 PM") in the USER's zone.
        : localReminderUtc(start, r.days_before || 0, r.hour || 0, r.minute || 0, timeZone);
      return {
        atMs: place(at.getTime()),
        isRelative,
        label: r.label,
        notification_title: r.notification_title || '📅 Upcoming',
        notification_body: r.notification_body || title,
      };
    })
    // All-day items have no real clock time — only a 9 AM anchor — so a
    // "1 hour before" nudge is meaningless and just fires before dawn.
    .filter((r) => !(isAllDay && r.isRelative))
    .filter((r): r is typeof r & { atMs: number } => r.atMs != null)
    .filter((r) => r.atMs > earliest)
    // Events: nothing after the start, and nothing more than a day ahead. An
    // all-day event's start is only its 9 AM anchor: its morning-of reminder
    // may land later that day (moved to when quiet hours end).
    .filter((r) => !isEvent || (r.atMs <= startMs + (isAllDay ? ALL_DAY_GRACE_MS : 0) && startMs - r.atMs <= DAY_MS))
    .sort((a, b) => a.atMs - b.atMs)
    // Two reminders that resolve to (nearly) the same minute are one reminder.
    .filter((r, i, arr) => i === 0 || r.atMs - arr[i - 1].atMs > 5 * 60 * 1000);
  // The cap is on the heads-ups. The reminder AT the start is the one that
  // matters most (for an alarm user it is the only one that rings), and the
  // cap of two used to drop it for every calendar event, since it sorts last:
  // Anna's Functional Medicine appointment (Oct 13 2026) had the night before
  // and "in about an hour", and nothing at 11:15.
  const atStart = entries.filter((r) => Math.abs(r.atMs - startMs) < 60 * 1000);
  const headsUps = entries.filter((r) => !atStart.includes(r)).slice(0, MAX_REMINDERS_PER_EVENT);
  entries = [...headsUps, ...atStart].sort((a, b) => a.atMs - b.atMs);

  // Never leave a dated item with no plan at all: fall back to one reminder at
  // the start itself.
  const fallbackMs = place(startMs);
  if (entries.length === 0 && fallbackMs != null && fallbackMs > earliest) {
    entries.push({
      atMs: fallbackMs,
      isRelative: true,
      label: isAllDay ? 'morning of' : 'at the time',
      notification_title: `📅 ${title}`,
      // No clock time: never "coming up" at a 9 AM that isn't its time.
      notification_body: isAllDay ? `Just a reminder: "${title}" is today.` : `You've got this! ${title} is coming up.`,
    });
  }

  return entries.map((r) => ({
    notification_id: `planned_${taskId}_event_${r.atMs}`,
    send_at: new Date(r.atMs).toISOString(),
    label: r.label,
    notification_title: r.notification_title,
    notification_body: r.notification_body,
  }));
}