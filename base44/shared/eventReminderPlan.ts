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

export const MAX_REMINDERS_PER_EVENT = 2;

// OneSignal's limit is 30 days; stay a day inside it.
export const BOOKABLE_WINDOW_MS = 29 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

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
}): PlanEntry[] {
  const { taskId, rawReminders, eventStartISO, title, isAllDay, isEvent, timeZone } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const start = new Date(eventStartISO);
  const startMs = start.getTime();
  const earliest = nowMs + 2 * 60 * 1000;

  const entries = (rawReminders || [])
    .map((r: any) => {
      const isRelative = r.relative_minutes_before != null;
      const at = isRelative
        ? new Date(startMs - r.relative_minutes_before * 60 * 1000)
        // A local wall-clock time ("night before at 8 PM") in the USER's zone.
        : localReminderUtc(start, r.days_before || 0, r.hour || 0, r.minute || 0, timeZone);
      return {
        atMs: at.getTime(),
        isRelative,
        label: r.label,
        notification_title: r.notification_title || '📅 Upcoming',
        notification_body: r.notification_body || title,
      };
    })
    // All-day items have no real clock time — only a 9 AM anchor — so a
    // "1 hour before" nudge is meaningless and just fires before dawn.
    .filter((r) => !(isAllDay && r.isRelative))
    .filter((r) => r.atMs > earliest)
    // Events: nothing after the start, and nothing more than a day ahead.
    .filter((r) => !isEvent || (r.atMs <= startMs && startMs - r.atMs <= DAY_MS))
    .sort((a, b) => a.atMs - b.atMs)
    // Two reminders that resolve to (nearly) the same minute are one reminder.
    .filter((r, i, arr) => i === 0 || r.atMs - arr[i - 1].atMs > 5 * 60 * 1000)
    .slice(0, MAX_REMINDERS_PER_EVENT);

  // Never leave a dated item with no plan at all: fall back to one reminder at
  // the start itself.
  if (entries.length === 0 && startMs > earliest) {
    entries.push({
      atMs: startMs,
      isRelative: true,
      label: 'at the time',
      notification_title: `📅 ${title}`,
      notification_body: `You've got this! ${title} is coming up.`,
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