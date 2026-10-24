import { base44 } from "@/api/base44Client";

// Double bookings and duplicates: the app's side of ONE checker.
//
// Sep 14 2026: this file checked, on the phone, whether an event added in the
// app started within an hour of another, and EventConflictWarning showed the
// popup. Oct 23 2026 (Anna): the same thing for events from anywhere — added
// here, moved to a new time here, or imported from a calendar (which runs on
// the server, often with the app closed) — and for likely duplicates too, with
// a popup to combine them. So the check moved to the server
// (base44/shared/eventConflicts.ts, through checkEventConflicts): it flags
// what it finds on the person's account, books one normal notification 15
// minutes out in case the popup isn't seen, and hands the new flags back so
// the popup can show now. This file only asks and announces.
//
// Overlap = two timed events starting within an hour (events have a start but
// no length; an hour is the honest "you can't be in both places"). Duplicate =
// two items on the same day, close in time, that the model judges to be the
// same thing.

export const CONFLICT_EVENT = 'event-conflict-detected';

/** Show these flags (from a check or a sync) in the popup. */
export function announceConflictFlags(flags, items) {
  if (!Array.isArray(flags) || !flags.length) return;
  window.dispatchEvent(new CustomEvent(CONFLICT_EVENT, { detail: { flags, items: items || {} } }));
}

/**
 * Fire-and-forget after a task is added or its time changes: ask the server
 * to check it. Never throws, never blocks — overlaps are often intentional.
 */
export function announceEventConflict(task) {
  if (!task?.id) return;
  // Only something with a date can collide with or duplicate something.
  if (!(task.event_time || task.next_reminder || task.due_date)) return;
  if (task.parent_task_id || task.classification === 'birthday' || task.birthday_person) return;
  base44.functions.invoke('checkEventConflicts', { taskIds: [task.id] })
    .then((res) => {
      const data = res?.data || res || {};
      announceConflictFlags(data.flags, data.items);
    })
    .catch(() => {});
}

/** On app open: anything flagged while the app was closed (a calendar sync). */
export function showPendingConflicts() {
  base44.functions.invoke('checkEventConflicts', { pending: true })
    .then((res) => {
      const data = res?.data || res || {};
      announceConflictFlags(data.flags, data.items);
    })
    .catch(() => {});
}

/** The person answered (or saw) a flag. */
export async function resolveConflict(flagId, action, extra = {}) {
  const res = await base44.functions.invoke('checkEventConflicts', { resolve: { flagId, action, ...extra } });
  return res?.data || res || {};
}
