import { base44 } from '@/api/base44Client';
import { trackFire } from '@/lib/appTrack';

// The ONE place the app starts a Google Calendar sync from.
//
// Three surfaces used to call syncGoogleCalendar independently (the layout on
// every mount, the Calendar page on mount, the Sync-now button), each gated on
// a localStorage marker that was only written AFTER a sync finished. A first
// import takes minutes, and the layout remounts on every navigation, so each
// hop during that window launched another full sync. This module owns:
//   - a module-level in-flight promise: every caller shares the same run
//     (also absorbs React StrictMode's double-invoked effects);
//   - the gate marker, written OPTIMISTICALLY at start so remounts mid-sync see
//     "recently synced" and stand down; reverted if the run fails outright.
// The backend holds its own per-user lock, so even a second device can't start
// an overlapping run.

const GATE_KEY = 'calendar_last_synced_at';
const CONNECTED_KEY = 'calendar_connected';
const INTERVAL_KEY = 'calendar_auto_sync_interval';
const THRESHOLDS = {
  '6hours': 6 * 3600000,
  daily: 24 * 3600000,
  weekly: 7 * 24 * 3600000,
};

let inFlight = null;

// "Request aborted" is not a failure: the browser cancelled the call because
// the page went away — the hand-off to Google's consent screen, a navigation
// away from Calendar mid-sync, or the Android app being backgrounded. The
// server run is unaffected. These must never reach the user as an error.
export function isAbortedError(err) {
  const msg = String(err?.message || err || '');
  return err?.name === 'AbortError' || /abort/i.test(msg);
}

export function getInFlightSync() {
  return inFlight;
}

export function isAutoSyncDue() {
  const interval = localStorage.getItem(INTERVAL_KEY) || 'daily';
  if (interval === 'never') return false;
  const threshold = THRESHOLDS[interval] || THRESHOLDS.daily;
  const lastRaw = localStorage.getItem(GATE_KEY);
  const lastMs = lastRaw ? new Date(lastRaw).getTime() : 0;
  return Date.now() - lastMs > threshold;
}

// Starts a sync, or joins the one already running. Resolves with the backend
// result ({ synced_at, created, ... } or { in_progress: true } when another
// device/run holds the server lock).
export function runCalendarSync({ background = false } = {}) {
  if (inFlight) return inFlight;

  const previous = localStorage.getItem(GATE_KEY);
  localStorage.setItem(GATE_KEY, new Date().toISOString());
  const undoOptimisticGate = () => {
    if (previous) localStorage.setItem(GATE_KEY, previous);
    else localStorage.removeItem(GATE_KEY);
  };

  inFlight = base44.functions
    .invoke('syncGoogleCalendar', {})
    .then((res) => {
      const data = res?.data || {};
      trackFire('calendar_sync', {
        props: {
          finished: !!data.synced_at,
          in_progress: !!data.in_progress,
          created: data.created ?? null,
          updated: data.updated ?? null,
          skipped: data.skipped ?? null,
        },
      });
      if (data.synced_at) {
        localStorage.setItem(GATE_KEY, data.synced_at);
      } else {
        // No sync finished in THIS call — another run holds the server lock
        // ({ in_progress: true }). That run may be a crashed one whose lock has
        // not gone stale yet, so the optimistic marker must not stand in for a
        // finished sync (it would switch auto-sync off for a whole interval).
        // Put back what was there; the next trigger simply asks again, which is
        // one cheap call while the lock is held.
        undoOptimisticGate();
      }
      return data;
    })
    .catch((err) => {
      // A user-initiated sync undoes the optimistic marker so a retry right
      // after connecting isn't gated out. A BACKGROUND sync keeps it instead:
      // an account with no Google Calendar connected (or a server hiccup) used
      // to fail this call on every single app open, which is what put a red
      // error on their Home screen every session. Keeping the marker backs off
      // for one full interval; connecting the calendar triggers a direct sync.
      if (isAbortedError(err)) {
        // The page/app went away mid-call. Let the next trigger ask again.
        undoOptimisticGate();
        return { aborted: true };
      }
      if (!background) undoOptimisticGate();
      trackFire('calendar_sync_failed', {
        props: { background, message: String(err?.message || err).slice(0, 300) },
      });
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

// Remembers whether this account actually has a Google Calendar connected, so
// the background sync never fires for someone who has never connected one.
export function setCalendarConnected(isConnected) {
  localStorage.setItem(CONNECTED_KEY, isConnected ? 'true' : 'false');
}

// Cheap "is a calendar connected?" check that also records the answer.
async function probeConnected() {
  const known = localStorage.getItem(CONNECTED_KEY);
  if (known === 'true') return true;
  if (known === 'false') return false;
  // Unknown (e.g. an existing user on a new device): ask once, then remember.
  try {
    const res = await base44.functions.invoke('syncGoogleCalendar', { probe: true });
    const connected = !!(res?.data || res)?.connected;
    setCalendarConnected(connected);
    return connected;
  } catch {
    setCalendarConnected(false);
    return false;
  }
}

// Background trigger: only runs when a calendar is actually connected AND the
// user's chosen interval has elapsed.
// Returns the shared promise (or null when nothing needed to run).
export async function maybeAutoSync() {
  if (inFlight) return inFlight;
  if (!isAutoSyncDue()) return null;
  if (!(await probeConnected())) return null;
  return runCalendarSync({ background: true }).catch(() => null);
}
// ---------------------------------------------------------------------------
// Phone calendars (Samsung Calendar, Outlook, any account the phone's calendar
// app shows). Only in the Android app: the native CalendarBridge plugin reads
// the phone's calendar provider; the browser has no such thing and every
// function below is a no-op there. Which calendars to sync is the user's
// choice, saved on their account (User.device_calendar_ids), so a new phone
// starts with none and never imports anything unasked.
//
// Each phone row is reshaped to look like a Google event and posted to the
// same syncGoogleCalendar function with source: 'device', so imports get the
// same AI classification, reminder plans and dedupe as Google ones.

const DEVICE_GATE_KEY = 'device_calendar_last_synced_at';
const DEVICE_DAYS = 365;
let deviceInFlight = null;

function calendarPlugin() {
  return (typeof window !== 'undefined' && window.Capacitor?.Plugins?.CalendarBridge) || null;
}

export function hasDeviceCalendars() {
  return !!calendarPlugin();
}

// All-day rows are stored by Android at UTC midnight of the day.
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// One phone row -> the Google event shape the backend already understands.
// Recurring series use their next upcoming occurrence as the start (the raw
// dtstart is the series' first day, often years back); a modified occurrence
// gets the "<series>_<time>" id the backend's series dedupe expects.
export function deviceRowToEvent(row) {
  if (!row || !row.id) return null;
  const cal = String(row.calendarId || '');
  const id = row.originalId
    ? `device:${cal}:${row.originalId}_${row.originalInstanceTime || row.dtstart || 0}`
    : `device:${cal}:${row.id}`;
  const begin = Number(row.nextBegin) || Number(row.dtstart) || 0;
  if (!begin) return null;
  const end = Number(row.nextEnd) || Number(row.dtend) || 0;
  const allDay = !!row.allDay;
  const event = {
    id,
    summary: row.title || 'Untitled event',
    description: row.description || '',
    location: row.location || '',
    status: 'confirmed',
    start: allDay ? { date: utcDay(begin) } : { dateTime: new Date(begin).toISOString() },
    recurrence: row.rrule ? [`RRULE:${row.rrule}`] : [],
    attendees: [],
    source: 'device',
    calendarId: cal,
    // The provider's own id for the event (Google's event id for a Google
    // account) so the backend can skip what it already imported from Google.
    syncId: row.syncId ? String(row.syncId) : '',
  };
  if (end) event.end = allDay ? { date: utcDay(end) } : { dateTime: new Date(end).toISOString() };
  if (row.organizer) event.organizer = { email: row.organizer };
  return event;
}

// { granted, calendars: [{ id, name, account, accountType, color, visible, isPrimary, owner }] }
export async function listDeviceCalendars() {
  const plugin = calendarPlugin();
  if (!plugin?.listCalendars) return { granted: false, calendars: [] };
  try {
    const res = await plugin.listCalendars();
    return { granted: !!res?.granted, calendars: res?.calendars || [] };
  } catch (err) {
    console.warn('[deviceCalendar] listCalendars failed:', err?.message || err);
    return { granted: false, calendars: [] };
  }
}

// Asks Android for READ_CALENDAR. Resolves true when granted.
export async function requestDeviceCalendarPermission() {
  const plugin = calendarPlugin();
  if (!plugin?.requestPermissions) return false;
  try {
    const res = await plugin.requestPermissions({ permissions: ['calendar'] });
    return res?.calendar === 'granted';
  } catch (err) {
    console.warn('[deviceCalendar] permission request failed:', err?.message || err);
    return false;
  }
}

export function isDeviceAutoSyncDue() {
  const lastRaw = localStorage.getItem(DEVICE_GATE_KEY);
  const lastMs = lastRaw ? new Date(lastRaw).getTime() : 0;
  return Date.now() - lastMs > THRESHOLDS['6hours'];
}

// Reads the chosen calendars on the phone and imports them. Resolves with the
// backend result. Joins a run already in progress.
export function runDeviceCalendarSync(calendarIds, { background = false } = {}) {
  if (deviceInFlight) return deviceInFlight;
  const ids = (calendarIds || []).map(String).filter(Boolean);
  const plugin = calendarPlugin();
  if (!plugin?.listEvents || ids.length === 0) return Promise.resolve(null);

  const previous = localStorage.getItem(DEVICE_GATE_KEY);
  localStorage.setItem(DEVICE_GATE_KEY, new Date().toISOString());

  deviceInFlight = (async () => {
    const read = await plugin.listEvents({ calendarIds: ids, days: DEVICE_DAYS });
    if (!read?.granted) {
      const err = new Error('calendar_permission');
      err.code = 'calendar_permission';
      throw err;
    }
    const events = (read.events || []).map(deviceRowToEvent).filter(Boolean);
    const res = await base44.functions.invoke('syncGoogleCalendar', {
      source: 'device',
      calendarIds: ids,
      events,
    });
    const data = res?.data || res;
    trackFire('device_calendar_synced', {
      props: { background, calendars: ids.length, events: events.length, created: data?.created ?? null },
    });
    return data;
  })()
    .catch((err) => {
      if (isAbortedError(err)) return { aborted: true };
      if (previous) localStorage.setItem(DEVICE_GATE_KEY, previous);
      else localStorage.removeItem(DEVICE_GATE_KEY);
      trackFire('device_calendar_sync_failed', {
        props: { background, message: String(err?.message || err).slice(0, 300) },
      });
      throw err;
    })
    .finally(() => {
      deviceInFlight = null;
    });

  return deviceInFlight;
}

// Background trigger on app open: only for accounts that chose phone
// calendars, only on the app build that can read them, at most every 6 hours.
export async function maybeAutoSyncDevice(user) {
  if (deviceInFlight) return deviceInFlight;
  const ids = user?.device_calendar_ids;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (!hasDeviceCalendars() || !isDeviceAutoSyncDue()) return null;
  return runDeviceCalendarSync(ids, { background: true }).catch(() => null);
}
