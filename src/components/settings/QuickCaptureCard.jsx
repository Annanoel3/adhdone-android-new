import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Zap, AlarmClock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { setAlarmMode, pushAlarms } from '../utils/widgetBridge';

const getPlugins = () => {
  const p = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};
  return { ShareBridge: p.ShareBridge, NotifyBridge: p.NotifyBridge, AlarmBridge: p.AlarmBridge };
};

export default function QuickCaptureCard({ theme }) {
  const { ShareBridge, NotifyBridge } = getPlugins();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ShareBridge?.isQuickCaptureEnabled) return;
    ShareBridge.isQuickCaptureEnabled()
      .then((res) => setEnabled(!!res?.enabled))
      .catch(() => {});
  }, [ShareBridge]);

  if (!ShareBridge?.setQuickCaptureEnabled) return null;

  const handleToggle = async (next) => {
    setBusy(true);
    setError('');
    try {
      if (next && NotifyBridge?.requestPermission) {
        await NotifyBridge.requestPermission();
      }
      const res = await ShareBridge.setQuickCaptureEnabled({ enabled: next });
      setEnabled(!!res?.enabled);
      if (next && !res?.enabled) {
        setError(
          res?.reason === 'permission'
            ? 'Notifications are blocked for ADHDone. Turn them on in your phone settings to use quick capture.'
            : "Couldn't turn on quick capture. Try again."
        );
      }
    } catch (e) {
      setError("Couldn't turn on quick capture. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
          <Zap className="w-5 h-5" />
          Quick Capture
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
              Pinned capture notification
            </p>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Keeps a shortcut in your notification tray so you can dump a task from anywhere.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={busy} />
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}

// Alarms — a real, out-loud alarm for tasks marked high or urgent. Android
// only: this renders nothing unless the app build has the AlarmBridge plugin
// (older builds, web). The choice lives on the profile as alarm_mode;
// 'notification' (everyone's default) means no alarm is ever booked for this
// person. Turning it on books alarms for the tasks that qualify right away and
// shows what Android is still withholding (exact timing, showing over the lock
// screen, battery limits), each with the matching phone-settings screen.
export function AlarmCard({ user, theme }) {
  const { AlarmBridge, NotifyBridge } = getPlugins();
  const dark = theme === 'dark';
  const [on, setOn] = useState(user?.alarm_mode === 'alarm');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOn(user?.alarm_mode === 'alarm');
  }, [user?.alarm_mode]);

  const refreshStatus = async () => {
    if (!AlarmBridge?.getStatus) return;
    try {
      setStatus(await AlarmBridge.getStatus());
    } catch (e) {
      // Leave whatever we last knew on screen.
    }
  };

  useEffect(() => {
    if (!AlarmBridge) return;
    refreshStatus();
    // Coming back from a phone-settings screen resumes the app; re-check then.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStatus();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [AlarmBridge]);

  if (!AlarmBridge?.sync) return null;

  const resync = async (mode) => {
    setAlarmMode(mode);
    const tasks = await base44.entities.Task.list('-updated_date', 500);
    await pushAlarms(tasks);
    await refreshStatus();
  };

  const handleToggle = async (next) => {
    setBusy(true);
    setError('');
    try {
      if (next && NotifyBridge?.requestPermission) {
        await NotifyBridge.requestPermission();
      }
      const mode = next ? 'alarm' : 'notification';
      await base44.auth.updateMe({ alarm_mode: mode });
      setOn(next);
      await resync(mode);
    } catch (e) {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const openSetting = async (fn) => {
    try {
      await fn();
    } catch (e) {
      // The settings screen didn't open; the status line still tells the truth.
    }
  };

  const textMain = dark ? 'text-gray-200' : 'text-gray-900';
  const textSub = dark ? 'text-gray-400' : 'text-gray-600';

  const Row = ({ ok, label, detail, action, onAction }) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={`text-sm ${textMain}`}>{label}</p>
        <p className={`text-xs ${textSub}`}>{ok ? 'Allowed' : detail}</p>
      </div>
      {!ok && (
        <Button size="sm" variant="outline" onClick={() => openSetting(onAction)}>
          {action}
        </Button>
      )}
    </div>
  );

  return (
    <Card className={`mb-6 border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
          <AlarmClock className="w-5 h-5" />
          Alarms
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <p className={`text-sm font-medium ${textMain}`}>
              Ring an alarm for high and urgent tasks
            </p>
            <p className={`text-xs ${textSub}`}>
              Rings out loud like an alarm clock, even with the screen off. Tasks with a time
              ring an hour before; day-only tasks ring at 9 AM. Your usual reminders still come.
            </p>
          </div>
          <Switch checked={on} onCheckedChange={handleToggle} disabled={busy} />
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        {on && status && (
          <div className={`mt-4 border-t pt-2 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
            <Row
              ok={status.notifications}
              label="Notifications"
              detail="Blocked for ADHDone in your phone settings — the alarm can't show without them."
              action="Ask again"
              onAction={() => NotifyBridge?.requestPermission?.()}
            />
            <Row
              ok={status.exactAlarms}
              label="Exact timing"
              detail="Android needs permission to ring at the exact minute."
              action="Allow"
              onAction={() => AlarmBridge.openExactAlarmSettings()}
            />
            <Row
              ok={status.fullScreen}
              label="Show over the lock screen"
              detail="Lets the alarm take over the screen instead of sitting in the tray."
              action="Allow"
              onAction={() => AlarmBridge.openFullScreenSettings()}
            />
            <Row
              ok={status.ignoringBatteryOptimizations}
              label="Battery"
              detail="Samsung puts sleeping apps to bed; an alarm from a sleeping app can be late or skipped."
              action="Fix"
              onAction={() => AlarmBridge.requestIgnoreBatteryOptimizations()}
            />
            <p className={`text-xs mt-2 ${textSub}`}>
              {status.booked === 1 ? '1 alarm set.' : `${status.booked || 0} alarms set.`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
