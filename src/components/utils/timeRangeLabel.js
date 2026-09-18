// A task or event can occupy a BLOCK of time, not just a moment — "10:00 AM –
// 6:00 PM" tells you whether the rest of your day is free in a way a single
// start time never does. Shared so the Home card and the Tasks card can never
// disagree about how a block is written.
const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// The moment the block starts, by the same precedence the cards use elsewhere.
export function blockStart(task) {
  if (task.event_time) return task.event_time;
  if (task.reminder_interval === 'once' && task.next_reminder) return task.next_reminder;
  return task.due_date || task.next_reminder || null;
}

// "10:00 AM – 6:00 PM", or null when this isn't a timed block. All-day items and
// items with no end time deliberately return null so the caller keeps its own
// single-time label instead of showing half a range.
export function formatTimeRange(task) {
  if (!task?.end_time || task.day_only_task) return null;
  const start = blockStart(task);
  if (!start) return null;
  return `${clock(start)} – ${clock(task.end_time)}`;
}