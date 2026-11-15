// Where someone is leaving FROM for an event at a place. Usually home (the
// center of their home circle), but not when they are somewhere else already.
// Anna, Nov 4 2026: "if someone has two events in a row, they are probably
// going from the first event's address to the second one... telling them when
// to leave home when they are not home is not helpful. Same with work: if
// there is an event during work hours or right after, they are probably
// leaving from their work address."
//
//   1. THE EVENT BEFORE IT. An active timed event of theirs at a place, starting
//      before this one, that ends no more than CHAIN_GAP_MS before this one
//      starts (when it ends: eventEndMs below; one that overlaps counts too).
//      The latest such event wins. The same address as this one means no
//      drive at all (samePlace).
//   2. WORK. A work address (not a remote worker) and a shift that day, when this
//      event starts during the shift or within CHAIN_GAP_MS after it ends.
//   3. HOME. The home circle's center, as always.
//
// The origin is a free-form address or a "lat,lng" pair: Google's Distance
// Matrix (shared/mapsDistance.ts, getProximity) takes either, so getTravelLead
// is handed it unchanged. Every place that books or re-checks an event's
// "leave now" asks here (generateReminderSchedule, onTaskUpdate,
// cronCommuteWatch), so they all agree on where the drive starts.

import { getHomeOrigin } from './homeOrigin.ts';
import { localParts, wallClockToUtc } from './timezoneReminders.ts';
import { localDateKey } from './commuteSchedule.ts';

// How long after the event before it ends (or after a shift ends) they are
// still taken to be THERE. One hour since Nov 14 2026 (Anna: "Idk if 2 hours
// is too long. Seems like too long. Are we sure I said that", then "Ok sounds
// good" to one hour). It was 2 hours from Nov 4 2026, a number picked when
// this was built; her words that day were "two events in a row" and "during
// work hours or right after", with no number. With two hours between things
// many people go home first, and the drive was then timed from the wrong
// place. An event with no end time is still taken to last an hour
// (ASSUMED_EVENT_MS), so two such events up to 2 hours apart, start to start,
// are chained (it was 3).
export const CHAIN_GAP_MS = 60 * 60 * 1000;
export const ASSUMED_EVENT_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LeaveOrigin {
  origin: string;                     // '' when nothing is known (no home circle either)
  from: 'home' | 'event' | 'work';
  fromTitle?: string;                 // the event they come from
  fromTaskId?: string;
  samePlace?: boolean;                // the event before is at this very address: no drive
}

const ms = (v: any): number => {
  if (!v) return NaN;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
};

export function eventStartMs(task: any): number {
  return ms(task?.event_time || task?.next_reminder);
}

// When an event is over, for this rule only (Anna, Nov 14 2026: "Wish we could
// tell which events lasted an hour vs which ones last like 5 hours"). The
// first of these that is known:
//   1. its own end time (Task.end_time: typed or said with it, or set on the card);
//   2. how long their phone calendar says it runs (`calendarMs`, read by
//      calendarLengths below from the import's own record; under a day);
//   3. Task.event_guess_minutes: the calendar's length saved at import, or the
//      parser's estimate of how long that kind of event usually runs (a
//      dentist visit about an hour, a wedding about five). Never shown;
//   4. one hour (ASSUMED_EVENT_MS).
export function eventEndMs(e: any, calendarMs?: number): number {
  const s = eventStartMs(e);
  if (!Number.isFinite(s)) return NaN;
  const own = ms(e?.end_time);
  if (Number.isFinite(own) && own > s) return own;
  const cal = Number(calendarMs);
  if (Number.isFinite(cal) && cal > 0 && cal < DAY_MS) return s + cal;
  const guess = Number(e?.event_guess_minutes);
  if (Number.isFinite(guess) && guess >= 5 && guess < 24 * 60) return s + guess * 60000;
  return s + ASSUMED_EVENT_MS;
}

// How long each of these events runs in the person's phone calendar, by task
// id, in milliseconds. Only for events that came from a calendar (the import
// keeps the calendar's start and end on CalendarSyncedEvent and never copies
// the end onto the task, so its card stays as it is). An all-day entry, one
// with no end, or one that runs a day or more has no length here. Read-only;
// never throws.
export async function calendarLengths(base44: any, events: any[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const ids = [...new Set((events || []).filter((e: any) => e?.id).map((e: any) => String(e.id)))].slice(0, 50);
    if (!ids.length) return out;
    const rows = await base44.asServiceRole.entities.CalendarSyncedEvent.filter({ adhd_task_id: { $in: ids } }, '-last_synced_at', 100);
    const clocked = (v: any) => /T\d\d:\d\d/.test(String(v || ''));
    for (const r of Array.isArray(rows) ? rows : []) {
      const id = String(r?.adhd_task_id || '');
      if (!id || out[id] !== undefined || r?.is_all_day || !clocked(r?.start_time) || !clocked(r?.end_time)) continue;
      const len = Date.parse(String(r.end_time)) - Date.parse(String(r.start_time));
      if (Number.isFinite(len) && len > 0 && len < DAY_MS) out[id] = len;
    }
  } catch (e) {
    console.log('[leaveOrigin] could not read the calendar lengths:', (e as any)?.message || e);
  }
  return out;
}

const samePlace = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The shift on the local calendar day of `day`, as UTC instants. An overnight
// shift (ends before it starts) runs into the next morning.
export function workShiftOn(user: any, shifts: any[], day: Date, timeZone: string): { startMs: number; endMs: number } | null {
  let startStr = '';
  let endStr = '';
  if ((user?.work_schedule_mode || 'fixed') === 'varies') {
    const key = localDateKey(day, timeZone);
    const shift = (shifts || []).find((s: any) => s?.shift_date === key);
    startStr = shift?.arrive_by || '';
    endStr = shift?.ends_at || '';
  } else {
    const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(day);
    const dow = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[label] ?? 0;
    const d = (user?.work_fixed_days || []).find((x: any) => Number(x?.day) === dow);
    startStr = d?.arrive_by || '';
    endStr = d?.ends_at || '';
  }
  const ok = (s: string) => /^\d{1,2}:\d{2}$/.test(s || '');
  if (!ok(startStr) || !ok(endStr)) return null;
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const lp = localParts(day, timeZone);
  const startMs = wallClockToUtc(lp.year, lp.month, lp.day, sh, sm, timeZone).getTime();
  let endMs = wallClockToUtc(lp.year, lp.month, lp.day, eh, em, timeZone).getTime();
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

// Pure: decides from what it is handed. `events` are the person's other active
// events (any; the unfit ones are sorted out here). `calendarMs`: how long
// each runs in their phone calendar, by task id (calendarLengths).
export function pickLeaveOrigin(opts: {
  user: any;
  shifts?: any[];
  task: { id?: string; location?: string; start: number };
  events: any[];
  calendarMs?: Record<string, number>;
}): LeaveOrigin {
  const { user, task } = opts;
  const here = String(task.location || '').trim();
  const start = task.start;
  const home: LeaveOrigin = { origin: getHomeOrigin(user), from: 'home' };
  if (!Number.isFinite(start)) return home;

  // 1. The event before it.
  let best: any = null;
  let bestStart = -Infinity;
  for (const e of opts.events || []) {
    if (!e || (task.id && e.id === task.id)) continue;
    if (e.status !== 'active' || e.classification !== 'event' || e.silenced || e.parent_task_id || e.day_only_task) continue;
    const place = String(e.location || '').trim();
    if (!place) continue;
    const s = eventStartMs(e);
    if (!Number.isFinite(s) || s >= start) continue;
    const end = eventEndMs(e, opts.calendarMs?.[String(e.id)]);
    if (start - end > CHAIN_GAP_MS) continue;
    if (s > bestStart) { best = e; bestStart = s; }
  }
  if (best) {
    const place = String(best.location || '').trim();
    return {
      origin: place, from: 'event', fromTitle: String(best.title || '').trim() || 'your earlier event', fromTaskId: best.id,
      samePlace: !!here && samePlace(place, here),
    };
  }

  // 2. Work.
  const work = String(user?.work_address || '').trim();
  if (work && !user?.work_remote) {
    const timeZone = user?.timezone || 'America/Chicago';
    const day = new Date(start);
    const shifts = opts.shifts || [];
    // Today's shift, and yesterday's when it runs overnight into today.
    const candidates = [workShiftOn(user, shifts, day, timeZone), workShiftOn(user, shifts, new Date(start - 24 * 60 * 60 * 1000), timeZone)];
    for (const sh of candidates) {
      if (!sh) continue;
      if (start >= sh.startMs && start <= sh.endMs + CHAIN_GAP_MS) {
        return { origin: work, from: 'work', samePlace: !!here && samePlace(work, here) };
      }
    }
  }

  return home;
}

// Reads what pickLeaveOrigin needs (the person's events around that time, and
// their shifts when their schedule varies) and decides. Never throws: on any
// trouble it answers home.
export async function leaveOriginFor(base44: any, user: any, task: { id?: string; location?: string; event_time?: any; next_reminder?: any; created_by?: string; notification_recipient_email?: string }): Promise<LeaveOrigin> {
  const home: LeaveOrigin = { origin: getHomeOrigin(user), from: 'home' };
  try {
    const start = eventStartMs(task);
    if (!Number.isFinite(start)) return home;
    const email = String(user?.email || task.notification_recipient_email || task.created_by || '').trim();
    if (!email) return home;
    const since = new Date(start - 24 * 60 * 60 * 1000).toISOString();
    const until = new Date(start).toISOString();
    let events: any[] = [];
    try {
      events = await base44.asServiceRole.entities.Task.filter({
        created_by: email, status: 'active', classification: 'event',
        event_time: { $gte: since, $lt: until },
      }, '-event_time', 50);
    } catch (e) {
      console.log('[leaveOrigin] could not read the events before it:', (e as any)?.message || e);
      events = [];
    }
    let shifts: any[] = [];
    if (user?.work_schedule_mode === 'varies' && String(user?.work_address || '').trim() && !user?.work_remote) {
      try {
        const dayKey = localDateKey(new Date(start), user?.timezone || 'America/Chicago');
        const prevKey = localDateKey(new Date(start - 24 * 60 * 60 * 1000), user?.timezone || 'America/Chicago');
        const [a, b] = await Promise.all([
          base44.asServiceRole.entities.WorkShift.filter({ created_by: email, shift_date: dayKey }),
          base44.asServiceRole.entities.WorkShift.filter({ created_by: email, shift_date: prevKey }),
        ]);
        shifts = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
      } catch (e) {
        console.log('[leaveOrigin] could not read the shifts:', (e as any)?.message || e);
        shifts = [];
      }
    }
    const list = Array.isArray(events) ? events : [];
    // The calendar's own length, for the ones that could be the event before
    // it (at a place, timed, with no end time of their own).
    const needLength = list.filter((e: any) => e && e.id !== task.id && String(e.location || '').trim()
      && !e.day_only_task && !(ms(e.end_time) > eventStartMs(e)));
    const calendarMs = needLength.length ? await calendarLengths(base44, needLength) : {};
    return pickLeaveOrigin({ user, shifts, task: { id: task.id, location: task.location, start }, events: list, calendarMs });
  } catch (e) {
    console.log('[leaveOrigin] fell back to home:', (e as any)?.message || e);
    return home;
  }
}

// One line for a push: where the drive starts, in the person's words.
export function fromWords(o: LeaveOrigin | null | undefined): string {
  if (!o) return '';
  if (o.from === 'event') return `from "${(o.fromTitle || 'your earlier event').length > 30 ? `${(o.fromTitle || '').slice(0, 27)}...` : (o.fromTitle || 'your earlier event')}"`;
  if (o.from === 'work') return 'from work';
  return '';
}
