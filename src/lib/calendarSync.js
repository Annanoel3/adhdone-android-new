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
const INTERVAL_KEY = 'calendar_auto_sync_interval';
const THRESHOLDS = {
  '6hours': 6 * 3600000,
  daily: 24 * 3600000,
  weekly: 7 * 24 * 3600000,
};

let inFlight = null;

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

// Background trigger: only runs when the user's chosen interval has elapsed.
// Returns the shared promise (or null when nothing needed to run).
export function maybeAutoSync() {
  if (inFlight) return inFlight;
  if (!isAutoSyncDue()) return null;
  return runCalendarSync({ background: true }).catch(() => null);
}