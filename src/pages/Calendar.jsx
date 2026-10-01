import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  RefreshCw,
  Unlink,
  Clock,
  Users,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Cake,
  ChevronDown,
  Zap,
  Lock,
  Plus,
  Mail,
} from 'lucide-react';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import TaskDetailsModal from '@/components/tasks/TaskDetailsModal';
import KeepAppOpenNote from '@/components/shared/KeepAppOpenNote';
import FirstUseDialog, { firstUseSeen, markFirstUseSeen } from '@/components/onboarding/FirstUseDialog';
import {
  runCalendarSync, maybeAutoSync, getInFlightSync, setCalendarConnected,
  hasDeviceCalendars, listDeviceCalendars, requestDeviceCalendarPermission, runDeviceCalendarSync,
} from '@/lib/calendarSync';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';
// One-time note for accounts that had Google Calendar attached before the
// phone build started reading calendars from the phone instead.
const CALENDAR_SWITCH_KEY = 'onboarding_calendar_switch_note_seen';

const URGENCY_COLORS = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

function formatDateTime(iso, isAllDay) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isAllDay) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatLastSynced(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Phone calendars — Samsung Calendar, Outlook, any account the phone's own
// calendar app shows. Android-app only: the native CalendarBridge plugin reads
// them, so in a browser (or an older build) this card renders nothing. Which
// calendars to import is the user's choice and lives on their account
// (device_calendar_ids); nothing is read until they tick one.
function PhoneCalendarsCard({ user, isDark, textPrimary, textSecondary, onSynced }) {
  const [granted, setGranted] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [chosen, setChosen] = useState(() => new Set((user?.device_calendar_ids || []).map(String)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(() => localStorage.getItem('device_calendar_last_synced_at') || null);
  // The calendar list sits behind a dropdown; a phone with several accounts
  // can have a dozen calendars, which is a lot to be greeted by.
  const [listOpen, setListOpen] = useState(false);

  const available = hasDeviceCalendars();

  const loadCalendars = useCallback(async () => {
    const res = await listDeviceCalendars();
    setGranted(res.granted);
    setCalendars(res.calendars || []);
  }, []);

  useEffect(() => {
    if (available) loadCalendars();
  }, [available, loadCalendars]);

  useEffect(() => {
    setChosen(new Set((user?.device_calendar_ids || []).map(String)));
  }, [user?.device_calendar_ids]);

  // The checkboxes never wait on a sync. A tick shows and saves at once; the
  // import runs in the background. A tick made while a sync is already
  // running gets one more sync right after it, with every calendar ticked.
  const chosenRef = useRef(chosen);
  useEffect(() => { chosenRef.current = chosen; }, [chosen]);
  const syncingRef = useRef(false);
  const queuedRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());

  if (!available) return null;

  const sync = async (ids) => {
    if (!ids.length) return;
    if (syncingRef.current) {
      queuedRef.current = ids;
      return;
    }
    syncingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await runDeviceCalendarSync(ids);
      if (data && !data.aborted) {
        setResult(data);
        setLastSynced(localStorage.getItem('device_calendar_last_synced_at'));
        if (onSynced) await onSynced();
      }
    } catch (err) {
      setError(err?.code === 'calendar_permission'
        ? 'Calendar access was turned off. Allow it again to sync.'
        : `Sync failed: ${err?.message || err}`);
    } finally {
      syncingRef.current = false;
      setBusy(false);
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued && queued.length) sync(queued);
    }
  };

  const allow = async () => {
    setBusy(true);
    try {
      const ok = await requestDeviceCalendarPermission();
      await loadCalendars();
      if (!ok) setError('Calendar access was not allowed. You can allow it in your phone\'s app settings.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => {
    const next = new Set(chosenRef.current);
    const adding = !next.has(id);
    if (adding) next.add(id); else next.delete(id);
    chosenRef.current = next;
    setChosen(next);
    // Saves run one after another, each with the latest set of ticks, so
    // quick taps can't land out of order.
    saveChainRef.current = saveChainRef.current
      .then(() => base44.auth.updateMe({ device_calendar_ids: Array.from(chosenRef.current) }))
      .then(() => {
        // A newly ticked calendar imports in the background; unticking only
        // stops future syncs — what was already imported stays as tasks.
        if (adding) sync(Array.from(chosenRef.current));
      })
      .catch((err) => setError(`Couldn't save that choice: ${err?.message || err}`));
  };

  const chosenIds = Array.from(chosen);
  const chosenNames = calendars.filter((c) => chosen.has(String(c.id))).map((c) => c.name || 'Calendar');
  const summary = chosenNames.length === 0
    ? 'Choose calendars'
    : chosenNames.length <= 2
      ? chosenNames.join(', ')
      : `${chosenNames.slice(0, 2).join(', ')} +${chosenNames.length - 2} more`;

  return (
    <Card className={`border-none shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-xl font-bold ${textPrimary}`}>Phone calendars</h2>
            <p className={`text-sm ${textSecondary}`}>
              Google, Samsung, Outlook — any calendar your phone's calendar app shows. Tick the ones to bring in; their events become tasks with reminders.
            </p>
          </div>
          {granted && chosenIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => sync(chosenIds)} disabled={busy}
              className={isDark ? 'border-gray-600 text-gray-200' : ''}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1">{busy ? 'Syncing…' : 'Sync now'}</span>
            </Button>
          )}
        </div>

        {granted === false && (
          <div className="space-y-2">
            <p className={`text-sm ${textSecondary}`}>ADHDone needs read-only access to the calendars on this phone. Nothing is read until you pick a calendar below.</p>
            <Button onClick={allow} disabled={busy} className="bg-purple-600 hover:bg-purple-700 text-white">
              {busy ? 'Waiting for Android…' : 'Allow calendar access'}
            </Button>
          </div>
        )}

        {granted && calendars.length === 0 && (
          <p className={`text-sm ${textSecondary}`}>No calendars found on this phone.</p>
        )}

        {granted && calendars.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setListOpen((o) => !o)}
              aria-expanded={listOpen}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left ${
                isDark ? 'border-gray-600 bg-gray-700/40 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{summary}</span>
                <span className={`block text-xs ${textSecondary}`}>
                  {chosenNames.length === 0 ? `${calendars.length} on this phone` : `${chosenNames.length} of ${calendars.length} syncing`}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${listOpen ? 'rotate-180' : ''}`} />
            </button>
            {listOpen && calendars.map((c) => (
              <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                isDark ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={chosen.has(String(c.id))}
                  onChange={() => toggle(String(c.id))}
                />
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color || '#8b5cf6' }} />
                <span className="min-w-0">
                  <span className={`block text-sm font-medium truncate ${textPrimary}`}>{c.name || 'Calendar'}</span>
                  {c.account && <span className={`block text-xs truncate ${textSecondary}`}>{c.account}</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}
        {result && !error && (
          <div className={`flex items-start gap-2 text-sm ${textSecondary}`}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>
              {result.in_progress
                ? 'A sync is already running.'
                : `Imported ${result.created ?? 0}, updated ${result.updated ?? 0}${result.cancelled_removed ? `, removed ${result.cancelled_removed}` : ''}.`}
            </span>
          </div>
        )}
        {lastSynced && !result && (
          <p className={`text-xs ${textSecondary}`}>Last synced {new Date(lastSynced).toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Calendar() {
  const [theme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [syncedEvents, setSyncedEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem('calendar_last_synced_at') || null);
  const [autoSyncInterval, setAutoSyncInterval] = useState(() => 
    localStorage.getItem('calendar_auto_sync_interval') || 'daily'
  );
  const [detailTask, setDetailTask] = useState(null);
  const [detailItemClass, setDetailItemClass] = useState('task');
  const [modalOpen, setModalOpen] = useState(false);
  const [switchNote, setSwitchNote] = useState(false);

  const loadSyncedEvents = useCallback(async () => {
    try {
      const events = await base44.entities.CalendarSyncedEvent.list('-last_synced_at', 50);
      setSyncedEvents(events);
      if (events.length > 0) {
        const latest = events.reduce((a, b) =>
          new Date(a.last_synced_at) > new Date(b.last_synced_at) ? a : b
        );
        setLastSyncedAt(latest.last_synced_at);
        localStorage.setItem('calendar_last_synced_at', latest.last_synced_at);
      }
      return events;
    } catch {
      setSyncedEvents([]);
      return [];
    }
  }, []);

  // EVERY active task, a page at a time. The calendar used to stop at the 200
  // most recently edited, so once a year of imported events was in, older
  // ones quietly dropped off the calendar even though nothing had happened to
  // them.
  const loadTasks = useCallback(async () => {
    try {
      const PAGE = 200;
      const all = [];
      const seen = new Set();
      for (let skip = 0; skip < 5000; skip += PAGE) {
        const page = (await base44.entities.Task.filter({ status: 'active' }, '-updated_date', PAGE, skip)) || [];
        let added = 0;
        for (const t of page) {
          if (!seen.has(t.id)) { seen.add(t.id); all.push(t); added++; }
        }
        if (page.length < PAGE || added === 0) break;
      }
      // Cancelled events stay on the calendar, crossed out on their day.
      try {
        const cancelled = (await base44.entities.Task.filter({ status: 'cancelled', classification: 'event' }, '-updated_date', 200)) || [];
        for (const t of cancelled) {
          if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
        }
      } catch (e) {
        // The rest of the calendar still shows.
      }
      // Finished tasks too (the 300 most recent), so a passed day still says
      // what it held instead of going blank once everything on it was done.
      try {
        const done = (await base44.entities.Task.filter({ status: 'completed' }, '-updated_date', 300)) || [];
        for (const t of done) {
          if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
        }
      } catch (e) {
        // The rest of the calendar still shows.
      }
      setTasks(all);
    } catch {
      setTasks([]);
    }
  }, []);

  const handleItemOpen = async (item) => {
    let t = item?.task;
    if (!t && item?.taskId) {
      try { t = await base44.entities.Task.get(item.taskId); } catch { return; }
    }
    if (!t) return;
    const cls = item.kind === 'birthday' ? 'birthday'
      : item.kind === 'imported_event' ? 'event'
      : 'task';
    setDetailTask(t);
    setDetailItemClass(cls);
    setModalOpen(true);
  };

  const handleModalUpdate = (updatedTask) => {
    setDetailTask(updatedTask);
    loadTasks();
    loadSyncedEvents();
  };

  // On mount: check auth, load events, probe connection
  useEffect(() => {
    const init = async () => {
      const authed = await base44.auth.isAuthenticated();
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
        const [events] = await Promise.all([loadSyncedEvents(), loadTasks()]);
        // Phone build: someone who had Google Calendar attached before gets
        // told once where their calendar went. Nobody else sees this.
        if (hasDeviceCalendars() && !firstUseSeen(CALENDAR_SWITCH_KEY)) {
          let hadGoogle = false;
          try { hadGoogle = localStorage.getItem('calendar_connected') === 'true'; } catch (e) {}
          if (!hadGoogle) {
            hadGoogle = (events || []).some((ev) =>
              ev?.google_event_id && !String(ev.google_event_id).startsWith('device:'));
          }
          if (hadGoogle) setSwitchNote(true);
        }
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSyncedEvents]);

  const isDark = theme === 'dark';
  // Phone build: calendars come from the phone, the Google sign-in card is gone.
  const phone = hasDeviceCalendars();
  const cardBase = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <p className={textSecondary}>Please log in to use Calendar sync.</p>
        <Button onClick={() => base44.auth.redirectToLogin()}>Log in</Button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-4 md:p-8 ${isDark ? 'bg-gray-900' : ''}`}
      style={{ paddingBottom: 'max(8rem, calc(8rem + env(safe-area-inset-bottom)))' }}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* On the web there is nothing to connect: calendars are read by the
            phone app (Google Calendar's own sign-in was retired Oct 1, 2026 —
            nobody had used it, and the phone's calendars cover every account). */}
        {!phone && (
          <Card className={`border-none shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shadow">
                  <CalendarDays className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className={`text-2xl font-bold ${textPrimary}`}>Calendar</h1>
                  <p className={`text-sm ${textSecondary}`}>Events come in through the ADHDone app on your phone.</p>
                </div>
              </div>
              <p className={`text-sm ${textSecondary}`}>
                Open ADHDone on your phone and pick which of its calendars to bring in — Google, Samsung, Outlook, whatever the phone has. Their events become tasks with reminders, and they show up here too.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Phone calendars — only on the Android build that can read them */}
        <PhoneCalendarsCard
          user={user}
          isDark={isDark}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          onSynced={async () => { await Promise.all([loadSyncedEvents(), loadTasks()]); }}
        />

        {/* Calendar view — in-app tasks + imported events */}
        <Card className={`border-none shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <CardContent className="p-2 md:p-6">
            {/* Only tasks go on the grid. An imported event shows through its
                task for as long as that task is active; the import records
                (syncedEvents) are just the sync's bookkeeping. Drawing them too
                showed recently imported events twice, and kept showing events
                the user had already checked off or deleted. */}
            <CalendarGrid tasks={tasks} isDark={isDark} onItemOpen={handleItemOpen} user={user} />
          </CardContent>
        </Card>

        {syncedEvents.length === 0 && tasks.length === 0 && !syncing && (
          <div className="text-center py-12">
            <CalendarDays className={`w-12 h-12 mx-auto mb-4 ${textSecondary}`} />
            <p className={`font-medium ${textPrimary}`}>Nothing on the calendar yet</p>
            <p className={`text-sm mt-1 ${textSecondary}`}>Add a task, or bring in your phone's calendars from the ADHDone app, and it shows up here.</p>
          </div>
        )}

        <TaskDetailsModal
          task={detailTask}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onUpdate={handleModalUpdate}
          theme={theme}
          itemClassification={detailItemClass}
        />

        <FirstUseDialog
          open={switchNote}
          theme={theme}
          title="New calendar integration now in use!"
          body="No Google sign-in needed anymore. ADHDone now reads calendars straight from your phone. Tick the calendar(s) you want in the Phone calendars list — your Google calendar is in there — and everything keeps working the way it did. Events already brought in stay where they are."
          onConfirm={() => { markFirstUseSeen(CALENDAR_SWITCH_KEY); setSwitchNote(false); }}
        />
      </div>
    </div>
  );
}