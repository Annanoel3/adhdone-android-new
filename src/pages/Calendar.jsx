import React, { useState, useEffect, useCallback } from 'react';
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
import {
  runCalendarSync, maybeAutoSync, getInFlightSync, setCalendarConnected,
  hasDeviceCalendars, listDeviceCalendars, requestDeviceCalendarPermission, runDeviceCalendarSync,
} from '@/lib/calendarSync';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';

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

  if (!available) return null;

  const sync = async (ids) => {
    if (!ids.length) return;
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
      setBusy(false);
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

  const toggle = async (id) => {
    const next = new Set(chosen);
    const adding = !next.has(id);
    if (adding) next.add(id); else next.delete(id);
    setChosen(next);
    const ids = Array.from(next);
    try {
      await base44.auth.updateMe({ device_calendar_ids: ids });
    } catch (err) {
      setError(`Couldn't save that choice: ${err?.message || err}`);
      return;
    }
    // A newly ticked calendar imports straight away; unticking only stops
    // future syncs — what was already imported stays as tasks.
    if (adding) await sync(ids);
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
              Samsung Calendar, Outlook, or any calendar your phone's calendar app shows. Tick the ones to bring in; they work exactly like Google Calendar imports.
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
                  disabled={busy}
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
    } catch {
      setSyncedEvents([]);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const list = await base44.entities.Task.filter({ status: 'active' }, '-updated_date', 200);
      setTasks(list || []);
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

  // All sync starts go through the shared module: it joins a run that's
  // already in flight (from the layout, or from this page before a navigation)
  // instead of launching a second one.
  const attemptSync = useCallback(() => runCalendarSync(), []);

  // Lightweight connection check — does NOT trigger a full sync, so a sync
  // error for any other reason can't be mistaken for "not connected".
  const probeConnection = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('syncGoogleCalendar', { probe: true });
      const result = res.data;
      if (result?.connected) {
        setConnected(true);
        setCalendarConnected(true);
        if (result.connected_email) setConnectedEmail(result.connected_email);
        return true;
      }
    } catch { /* not connected */ }
    setConnected(false);
    setCalendarConnected(false);
    setConnectedEmail(null);
    return false;
  }, []);

  // On mount: check auth, load events, probe connection
  useEffect(() => {
    const init = async () => {
      const authed = await base44.auth.isAuthenticated();
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
        await Promise.all([loadSyncedEvents(), loadTasks()]);
        // Straight back from our own OAuth callback, which lands here as
        // ?gcal=connected (or an explicit failure reason). A brand-new grant
        // isn't always readable on the first ask, so retry briefly rather than
        // letting one "no" stick as "not connected".
        const gcal = new URLSearchParams(window.location.search).get('gcal');
        if (gcal && gcal !== 'connected') {
          setSyncError(
            gcal === 'denied' ? 'Google sign-in was cancelled.'
            : gcal === 'expired' ? 'That sign-in link timed out — tap Connect again.'
            : gcal === 'no_refresh_token' ? "Google didn't return a lasting permission — tap Connect again and approve the calendar access."
            : 'Connecting to Google failed — tap Connect to try again.'
          );
        }
        const justConnected = gcal === 'connected'
          || sessionStorage.getItem('adhd_calendar_just_connected') === '1';
        sessionStorage.removeItem('adhd_calendar_just_connected');
        // The phone build reads calendars from the phone; Google is never
        // probed or synced there.
        let isConnected = hasDeviceCalendars() ? false : await probeConnection();
        if (!hasDeviceCalendars() && !isConnected && justConnected) {
          for (let i = 0; i < 4 && !isConnected; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            isConnected = await probeConnection();
          }
        }
        // Background auto-sync — at most once per the user's chosen interval,
        // via the shared module (joins any run already in flight). If a sync
        // is running when this page opens, surface it as "Syncing…" and
        // refresh the grid when it lands.
        const running = isConnected ? (getInFlightSync() || maybeAutoSync()) : null;
        if (running) {
          setSyncing(true);
          running
            .then(async (result) => {
              if (result?.synced_at) {
                setLastSyncedAt(result.synced_at);
                localStorage.setItem('calendar_last_synced_at', result.synced_at);
              }
              await Promise.all([loadSyncedEvents(), loadTasks()]);
            })
            .catch(() => {})
            .finally(() => setSyncing(false));
        }
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSyncedEvents, probeConnection]);

  // Re-check connection status every time the page becomes visible
  useEffect(() => {
    if (hasDeviceCalendars()) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') probeConnection();
    };
    probeConnection();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [probeConnection]);

  // Runs OAuth in a POPUP, which is how per-user connections are meant to be
  // made. It used to be a full-page redirect: that dumped the user back on the
  // app root instead of here, and the connection never ended up stored. This
  // page never unloads now — when the popup closes we just re-check.
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    setSyncError(null);
    try {
      // App-owned OAuth. Full-page hand-off, deliberately: the Android app has
      // no popups. Google returns to our OWN callback, which redirects straight
      // back to this page with ?gcal=…, so there is no detour through a Base44
      // host and nothing depends on connector storage.
      const res = await base44.functions.invoke('googleCalendarConnect', {});
      const url = res.data?.url;
      if (!url) throw new Error('Could not start Google sign-in');
      window.location.href = url;
    } catch (e) {
      setSyncError(e.message || 'Could not start Google sign-in');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await base44.functions.invoke('googleCalendarDisconnect', {});
    setConnected(false);
    setCalendarConnected(false);
    setConnectedEmail(null);
    setSyncResult(null);
    setSyncedEvents([]);
    setLastSyncedAt(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const ok = await probeConnection();
      if (!ok) {
        setSyncError('Google Calendar disconnected. Please reconnect.');
      } else {
        const result = await attemptSync();
        if (result?.aborted) {
          // Page/app went away mid-sync — nothing to report.
        } else if (result?.in_progress) {
          setSyncError('A sync is already running for your account — give it a minute and it will finish on its own.');
        } else {
          setSyncResult(result);
        }
        if (result?.synced_at) {
          setLastSyncedAt(result.synced_at);
          localStorage.setItem('calendar_last_synced_at', result.synced_at);
        }
        if (result?.connected_email) setConnectedEmail(result.connected_email);
        // Reload both imported events AND in-app tasks — synced calendar
        // events become Task records too, and the grid shows both.
        await Promise.all([loadSyncedEvents(), loadTasks()]);
      }
    } catch (e) {
      setSyncError(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

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

  const GoogleLogo = () => (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );

  return (
    <div className={`min-h-screen p-4 md:p-8 ${isDark ? 'bg-gray-900' : ''}`}
      style={{ paddingBottom: 'max(8rem, calc(8rem + env(safe-area-inset-bottom)))' }}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Phone build: calendars are read from the phone now, so the Google
            sign-in card is gone. Anyone who comes back here to sync Google
            finds this note instead. */}
        {phone && (
          <Card className={`border-none shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shadow">
                  <CalendarDays className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${textPrimary}`}>New calendar integration now in use!</h2>
                  <p className={`text-sm ${textSecondary}`}>No Google sign-in needed anymore.</p>
                </div>
              </div>
              <p className={`text-sm ${textSecondary}`}>
                ADHDone now reads calendars straight from your phone. Tick the calendar(s) you want below — your Google calendar is in that list — and everything keeps working the way it did. Events already brought in stay where they are.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Google sign-in card — web only */}
        {!phone && (
        <Card className={`border-none shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <CardContent className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shadow">
                <CalendarDays className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className={`text-2xl font-bold ${textPrimary}`}>Google Calendar</h1>
                <p className={`text-sm ${textSecondary}`}>
                  {connected
                    ? 'Syncing your calendar events as smart tasks'
                    : 'Connect to import events as smart tasks'}
                </p>
              </div>
            </div>

            {/* Connected account info */}
            {connected && connectedEmail && (
              <>
                <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-100'}`}>
                  <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className={`font-medium truncate min-w-0 ${isDark ? 'text-gray-200' : 'text-blue-800'}`}>{connectedEmail}</span>
                  <Badge className="ml-auto text-xs bg-blue-100 text-blue-700 border-blue-200 border flex-shrink-0">Connected</Badge>
                </div>
                <div className={`flex items-center gap-2 text-sm ${textSecondary}`}>
                  <Clock className="w-3.5 h-3.5" />
                  Last synced: {formatLastSynced(lastSyncedAt)}
                </div>
              </>
            )}

            {/* Action buttons */}
            {connected && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  className={`gap-2 ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}`}
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Unlink className="w-4 h-4" />
                  Disconnect
                </Button>
              </div>
            )}

            {syncing && (
              <KeepAppOpenNote className="justify-start" text="Keep the app open while syncing — closing it cancels the sync." />
            )}

            {/* Auto-sync setting */}
            {connected && (
              <div className={`flex items-center gap-2 text-sm`}>
                <label className={textSecondary}>Auto-sync:</label>
                <select
                  value={autoSyncInterval}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAutoSyncInterval(val);
                    localStorage.setItem('calendar_auto_sync_interval', val);
                  }}
                  className={`text-xs rounded px-2 py-1 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
                >
                  <option value="never">Never</option>
                  <option value="6hours">Every 6 hours</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            )}

            {/* Switch account button */}
            {connected && (
              <button
                onClick={handleConnect}
                className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors ${isDark ? 'border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              >
                <Plus className="w-3.5 h-3.5" />
                Switch / reconnect Google account
              </button>
            )}

            {/* Sync result banner */}
            {syncResult && !syncError && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Synced {syncResult.results?.length || syncResult.created || 0} events —{' '}
                  {syncResult.created} new tasks created, {syncResult.updated} tasks refreshed, {syncResult.skipped} unchanged.
                </span>
              </div>
            )}
            {syncError && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            {/* Connect button + privacy notice */}
            {!connected && (
              <div className="mt-5 space-y-3">
                <Button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="gap-3 px-6 py-3 h-auto bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 shadow-sm font-medium rounded-xl"
                  variant="outline"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleLogo />}
                  {connecting ? 'Waiting for Google…' : 'Connect Google Calendar'}
                </Button>
                <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>
                    ADHDone requests <strong>read-only</strong> access to your Google Calendar to set smart reminders. Your data is never sold or used for ads.{' '}
                    <Link to="/privacypolicy" className="text-blue-500 hover:underline">Privacy Policy</Link>
                    {' '}·{' '}
                    <Link to="/Terms" className="text-blue-500 hover:underline">Terms</Link>
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* How it works — shown only when not connected (web only) */}
        {!phone && !connected && (
          <Card className={`border-none shadow-sm ${isDark ? 'bg-gray-800' : 'bg-blue-50/50 border border-blue-100'}`}>
            <CardContent className="p-5 space-y-3">
              <h3 className={`font-semibold ${textPrimary}`}>How it works</h3>
              <ul className={`space-y-2 text-sm ${textSecondary}`}>
                <li className="flex gap-2"><Zap className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> AI reads each event and decides importance (low / medium / high) from the title, timing, and attendees.</li>
                <li className="flex gap-2"><CalendarDays className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> Events become ADHDone tasks with smart reminders scaled to importance, including notes, location, and attendees.</li>
                <li className="flex gap-2"><Cake className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> Yearly birthday events (e.g. "John's Birthday") go into the Birthday tracker automatically.</li>
                <li className="flex gap-2"><RefreshCw className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> Syncs daily in the background. Re-syncing never duplicates existing tasks.</li>
              </ul>
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
            <CalendarGrid tasks={tasks} events={syncedEvents} isDark={isDark} onItemOpen={handleItemOpen} user={user} />
          </CardContent>
        </Card>

        {connected && syncedEvents.length === 0 && tasks.length === 0 && !syncing && (
          <div className="text-center py-12">
            <CalendarDays className={`w-12 h-12 mx-auto mb-4 ${textSecondary}`} />
            <p className={`font-medium ${textPrimary}`}>Nothing on the calendar yet</p>
            <p className={`text-sm mt-1 ${textSecondary}`}>Add tasks in the app or sync Google Calendar to see them here.</p>
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
      </div>
    </div>
  );
}