// "Add to phone calendar" on a task or event's card (Anna, Nov 2 2026: "it
// would be nice to click add to phone calendar on a task or event").
//
// The phone's own calendar app opens on a new event filled in with the
// task's title, notes, place and time; the person picks which calendar and
// saves it there (CalendarBridge.addEvent, Android's standard insert intent,
// no calendar permission needed). Nothing is written from here, and the app
// keeps no link to the event they save.
//
// Offered only where the phone app has it (Android build 46 on; the iPhone
// app from its next build after Nov 2 2026, where it opens Apple's New Event
// sheet; the website never), and only for something with a date that
// didn't come from a calendar in the first place (google_event_id: imported
// from Google or the phone's calendars, so it's already there).

const plugin = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.CalendarBridge) || null;

export function canAddToPhoneCalendar() {
  return typeof plugin()?.addEvent === 'function';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const validMs = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

// When it happens, as the calendar app wants it, or null when there's
// nothing to put on a calendar. A day-only task (no clock time) is an
// all-day event on its day (its due_date is saved at 11:59 PM local that
// day), through the last day of a multi-day span. A timed one runs to its
// end time, else to the end of a multi-day span, else an hour for an event
// and half an hour for a task (the person can change it before saving).
export function phoneCalendarWhen(task) {
  if (!task || task.parent_task_id || task.google_event_id) return null;
  if (task.status && task.status !== 'active') return null;
  if (task.classification === 'birthday') return null;
  const startMs = validMs(task.event_time) ?? validMs(task.due_date);
  if (startMs == null) return null;
  const start = new Date(startMs);

  if (task.day_only_task === true) {
    const begin = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const lastMs = validMs(task.end_date);
    const last = lastMs != null && lastMs > startMs ? new Date(lastMs) : start;
    const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime();
    return { beginMs: begin, endMs: Math.max(end, begin + DAY_MS), allDay: true };
  }

  const endTime = validMs(task.end_time);
  const endDate = validMs(task.end_date);
  const fallback = startMs + (task.classification === 'event' ? 60 : 30) * 60 * 1000;
  const endMs = endTime != null && endTime > startMs ? endTime
    : endDate != null && endDate > startMs ? endDate
      : fallback;
  return { beginMs: startMs, endMs, allDay: false };
}

// Resolves { ok, reason? }.
export async function addToPhoneCalendar(task) {
  const when = phoneCalendarWhen(task);
  const p = plugin();
  if (!when || typeof p?.addEvent !== 'function') return { ok: false, reason: 'unavailable' };
  try {
    const r = await p.addEvent({
      title: String(task.title || '').trim() || 'Untitled',
      notes: String(task.notes || '').trim(),
      location: String(task.location || '').trim(),
      ...when,
    });
    return r && typeof r.ok === 'boolean' ? r : { ok: true };
  } catch (e) {
    console.error('[addToPhoneCalendar] failed:', e);
    return { ok: false, reason: 'failed' };
  }
}
