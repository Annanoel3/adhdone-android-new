import { base44 } from "@/api/base44Client";

// Double-booking check for EVENTS only.
//
// Tasks are deliberately excluded: two tasks in the same hour isn't a conflict,
// it's a Tuesday. Only things with a real start time — appointments, meetings,
// pickups — can actually collide.
//
// Events carry a start time but no duration, so "overlap" is defined as two
// events starting within an hour of each other. Guessing a length would invent
// conflicts (or miss them), and an hour is the honest version of "you can't be
// in both of these places".
const WINDOW_MS = 60 * 60 * 1000;

function startOf(task) {
  const raw = task?.event_time || task?.next_reminder;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// A day-only event has no clock time (it's stored at 9 AM as a placeholder), so
// it can't conflict with anything — nothing is actually booked at a time.
function isTimedEvent(task) {
  return (
    task?.classification === 'event' &&
    !task?.day_only_task &&
    !task?.parent_task_id &&
    !!startOf(task)
  );
}

/** Other active timed events starting within an hour of this one. */
export async function findEventConflicts(task) {
  if (!isTimedEvent(task)) return [];
  const start = startOf(task).getTime();

  const events = await base44.entities.Task.filter({
    classification: 'event',
    status: 'active',
  }, '-next_reminder', 200);

  return events.filter((other) => {
    if (other.id === task.id) return false;
    if (other.silenced) return false;
    if (!isTimedEvent(other)) return false;
    return Math.abs(startOf(other).getTime() - start) < WINDOW_MS;
  });
}

/**
 * Fire-and-forget: if the newly created event collides with something, ask the
 * app to show the warning. Never throws — a failed check must not break task
 * creation, and never blocks it either, since overlaps are often intentional.
 */
export function announceEventConflict(task) {
  findEventConflicts(task)
    .then((conflicts) => {
      if (!conflicts.length) return;
      window.dispatchEvent(new CustomEvent('event-conflict-detected', {
        detail: { task, conflicts },
      }));
    })
    .catch(() => {});
}