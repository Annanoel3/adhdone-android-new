import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  CalendarDays, RefreshCw, Unlink, Clock, Users, AlertCircle,
  CheckCircle2, Loader2, Cake, Zap, Lock, Plus, Mail, Bell,
} from 'lucide-react';

const CONNECTOR_ID = '6a04df00e62b57f635e00b0f';

const URGENCY_COLORS = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const REMINDER_OPTIONS = [
  { value: '10min',         label: 'Every 10 min',    desc: 'Super urgent' },
  { value: '20min',         label: 'Every 20 min',    desc: 'Very high priority' },
  { value: '30min',         label: 'Every 30 min',    desc: 'High priority' },
  { value: '1hour',         label: 'Every hour',      desc: 'Urgent' },
  { value: '2hours',        label: 'Every 2 hours',   desc: 'Important' },
  { value: 'daily',         label: 'Once a day',      desc: 'Medium priority' },
  { value: 'every_other_day', label: 'Every other day', desc: 'Low priority' },
  { value: 'once',          label: 'Just once',       desc: 'One-time reminder' },
];

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

// Modal for setting reminders on newly imported events
function ReminderPickerModal({ events, onSave, onDismiss, isDark }) {
  const [choices, setChoices] = useState(() => {
    const init = {};
    events.forEach(ev => { init[ev.taskId] = ev.suggestedInterval; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const cardBg = isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200';

  const handleSave = async () => {
    setSaving(true);
    for (const ev of events) {
      const interval = choices[ev.taskId];
      if (interval && interval !== ev.suggestedInterval) {
        await base44.entities.Task.update(ev.taskId, { reminder_interval: interval });
      }
    }
    setSaving(false);
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-4">
      <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`font-bold text-lg ${textPrimary}`}>Set reminders for new events</h2>
              <p className={`text-sm ${textSecondary}`}>How often should ADHDone remind you?</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {events.map(ev => (
            <div key={ev.taskId} className={`rounded-xl border p-3 ${cardBg}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`font-medium text-sm ${textPrimary}`}>{ev.title}</span>
                {ev.start_time && (
                  <span className={`text-xs ${textSecondary} flex-shrink-0`}>
                    {formatDateTime(ev.start_time, ev.is_all_day)}
                  </span>
                )}
              </div>
              <p className={`text-xs mb-2 ${textSecondary}`}>AI suggested: <strong>{REMINDER_OPTIONS.find(r => r.value === ev.suggestedInterval)?.label || ev.suggestedInterval}</strong></p>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setChoices(c => ({ ...c, [ev.taskId]: opt.value }))}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      choices[ev.taskId] === opt.value
                        ? 'bg-blue-500 text-white border-blue-500 font-medium'
                        : isDark
                          ? 'bg-gray-600 border-gray-500 text-gray-300 hover:bg-gray-500'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 flex gap-3 border-t border-gray-100">
          <Button variant="outline" onClick={onDismiss} className="flex-1">Keep AI suggestions</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save reminders'}
          </Button>
        </div>
      </div>
    </div>
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
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [reminderPickerEvents, setReminderPickerEvents] = useState(null);

  const loadSyncedEvents = useCallback(async () => {
    try {
      const events = await base44.entities.CalendarSyncedEvent.list('-last_synced_at', 50);
      setSyncedEvents(events);
      if (events.length > 0) {
        const latest = events.reduce((a, b) =>
          new Date(a.last_synced_at) > new Date(b.last_synced_at) ? a : b
        );
        setLastSyncedAt(latest.last_synced_at);
      }
    } catch {
      setSyncedEvents([]);
    }
  }, []);

  const attemptSync = useCallback(async () => {
    const res = await base44.functions.invoke('syncGoogleCalendar', {});
    return res.data;
  }, []);

  const handleSyncResult = useCallback(async (result) => {
    if (result?.connected_email) setConnectedEmail(result.connected_email);
    setSyncResult(result);
    if (result?.synced_at) setLastSyncedAt(result.synced_at);
    await loadSyncedEvents();

    // If new tasks were created, show the reminder picker
    if (result?.created > 0 && result?.results?.length > 0) {
      const newEvents = result.results
        .filter(r => r.routedAs !== 'birthday' && r.taskId)
        .map(r => ({
          taskId: r.taskId,
          title: r.title,
          start_time: r.start_time,
          is_all_day: r.is_all_day,
          suggestedInterval: r.reminder_interval || 'daily',
        }));
      if (newEvents.length > 0) setReminderPickerEvents(newEvents);
    }
  }, [loadSyncedEvents]);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
        await loadSyncedEvents();
        try {
          const conn = await base44.functions.invoke('syncGoogleCalendar', { probe: true });
          if (conn?.data?.error === 'not_connected') {
            setConnected(false);
          } else {
            setConnected(true);
            if (conn?.data?.connected_email) setConnectedEmail(conn.data.connected_email);
          }
        } catch {
          setConnected(false);
        }
      }
      setLoading(false);
    });
  }, [loadSyncedEvents]);

  const handleConnect = async () => {
    const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
    const popup = window.open(url, '_blank', 'width=600,height=700');
    const timer = setInterval(async () => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setSyncing(true);
        setSyncError(null);
        try {
          const result = await attemptSync();
          if (result?.error === 'not_connected') {
            setConnected(false);
          } else {
            setConnected(true);
            await handleSyncResult(result);
          }
        } catch (e) {
          setSyncError(e.message);
        } finally {
          setSyncing(false);
        }
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    await base44.connectors.disconnectAppUser(CONNECTOR_ID);
    setConnected(false);
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
      const result = await attemptSync();
      if (result?.error === 'not_connected') {
        setConnected(false);
        setSyncError('Google Calendar disconnected. Please reconnect.');
      } else {
        await handleSyncResult(result);
      }
    } catch (e) {
      setSyncError(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const isDark = theme === 'dark';
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
      <div className="max-w-3xl mx-auto space-y-6">

        <Card className={`border-none shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shadow">
                  <CalendarDays className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className={`text-2xl font-bold ${textPrimary}`}>Google Calendar</h1>
                  <p className={`text-sm ${textSecondary}`}>
                    {connected ? 'Syncing your calendar events as smart tasks' : 'Connect to import events as smart tasks'}
                  </p>
                </div>
              </div>

              {connected && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}
                    className={`gap-2 ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : ''}`}>
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDisconnect}
                    className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50">
                    <Unlink className="w-4 h-4" />
                    Disconnect
                  </Button>
                </div>
              )}
            </div>

            {connected && connectedEmail && (
              <div className={`mt-4 flex items-center gap-2 p-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-100'}`}>
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-blue-800'}`}>{connectedEmail}</span>
                <Badge className="ml-auto text-xs bg-blue-100 text-blue-700 border-blue-200 border">Connected</Badge>
              </div>
            )}

            {connected && (
              <button onClick={handleConnect}
                className={`mt-2 flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition-colors ${isDark ? 'border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
                <Plus className="w-3.5 h-3.5" />
                Switch / reconnect Google account
              </button>
            )}

            {connected && (
              <div className={`mt-3 flex items-center gap-2 text-sm ${textSecondary}`}>
                <Clock className="w-3.5 h-3.5" />
                Last synced: {formatLastSynced(lastSyncedAt)}
              </div>
            )}

            {syncResult && !syncError && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Synced {syncResult.total_events} events — {syncResult.created} new tasks created, {syncResult.updated} tasks refreshed, {syncResult.skipped} unchanged.
                </span>
              </div>
            )}
            {syncError && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            {!connected && (
              <div className="mt-5 space-y-3">
                <Button onClick={handleConnect}
                  className="gap-3 px-6 py-3 h-auto bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 shadow-sm font-medium rounded-xl"
                  variant="outline">
                  <GoogleLogo />
                  Connect Google Calendar
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

        {!connected && (
          <Card className={`border-none shadow-sm ${isDark ? 'bg-gray-800' : 'bg-blue-50/50 border border-blue-100'}`}>
            <CardContent className="p-5 space-y-3">
              <h3 className={`font-semibold ${textPrimary}`}>How it works</h3>
              <ul className={`space-y-2 text-sm ${textSecondary}`}>
                <li className="flex gap-2"><Zap className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> AI reads each event and decides urgency. Titles with "urgent", "ASAP", etc. automatically get hourly reminders.</li>
                <li className="flex gap-2"><CalendarDays className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> Events become ADHDone tasks. After syncing you can customize the reminder frequency for each event.</li>
                <li className="flex gap-2"><Cake className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> Yearly birthday events go into the Birthday tracker automatically.</li>
                <li className="flex gap-2"><RefreshCw className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> Syncs daily in the background. Re-syncing never duplicates existing tasks.</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {connected && syncedEvents.length > 0 && (
          <div className="space-y-3">
            <h2 className={`font-semibold text-sm uppercase tracking-wide ${textSecondary}`}>
              Imported Events ({syncedEvents.length})
            </h2>
            {syncedEvents.map((ev) => (
              <Card key={ev.id} className={`border shadow-sm ${cardBase}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {ev.routed_as === 'birthday' && <Cake className="w-4 h-4 text-pink-500 flex-shrink-0" />}
                        <span className={`font-medium truncate ${textPrimary}`}>{ev.title}</span>
                      </div>
                      <div className={`text-xs ${textSecondary} flex flex-wrap items-center gap-3`}>
                        {ev.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDateTime(ev.start_time, ev.is_all_day)}
                          </span>
                        )}
                        {ev.attendee_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {ev.attendee_count} attendee{ev.attendee_count !== 1 ? 's' : ''}
                          </span>
                        )}
                        {ev.ai_reminder_interval && (
                          <span className="flex items-center gap-1">
                            <Bell className="w-3 h-3" />
                            {REMINDER_OPTIONS.find(r => r.value === ev.ai_reminder_interval)?.label || ev.ai_reminder_interval}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge className={`text-xs border ${URGENCY_COLORS[ev.ai_importance] || URGENCY_COLORS.medium}`}>
                        {ev.ai_importance}
                      </Badge>
                      {ev.routed_as === 'birthday' ? (
                        <Badge className="text-xs bg-pink-100 text-pink-700 border-pink-200 border">birthday</Badge>
                      ) : (
                        <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 border">task</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {connected && syncedEvents.length === 0 && !syncing && (
          <div className="text-center py-16">
            <CalendarDays className={`w-12 h-12 mx-auto mb-4 ${textSecondary}`} />
            <p className={`font-medium ${textPrimary}`}>No events synced yet</p>
            <p className={`text-sm mt-1 ${textSecondary}`}>Click "Sync now" to import your upcoming events.</p>
          </div>
        )}
      </div>

      {reminderPickerEvents && (
        <ReminderPickerModal
          events={reminderPickerEvents}
          isDark={isDark}
          onSave={() => { setReminderPickerEvents(null); loadSyncedEvents(); }}
          onDismiss={() => setReminderPickerEvents(null)}
        />
      )}
    </div>
  );
}