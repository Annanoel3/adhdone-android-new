import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Zap, AlarmClock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { setAlarmMode, refreshAlarms, pushAlarmSound, requestAlarmPermissions } from '../utils/widgetBridge';

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

// Alarms — how reminders arrive on this phone. Android only: this renders
// nothing unless the app build has the AlarmBridge plugin (older builds, web).
//
// Two things live here. The DEFAULT for tasks that have no alert style of their
// own (User.alarm_mode; each task's detail card has its own switch), and the
// ring SOUND (a preset from the sound bucket, or a file the user uploads; the
// phone downloads it once and rings from the copy). Neither changes when a
// task reminds — only how loud it is when it does.
const ALARM_SOUND_BASE = 'https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Notifications/';
const ALARM_SOUND_PRESETS = [
  { name: 'Joyful Melody', file: 'Joyful Melody.wav' },
  { name: 'Piano Melody', file: 'Piano Melody.mp3' },
  { name: 'Short Piano', file: 'Short Piano Notification.mp3' },
  { name: 'Short Notification', file: 'Short Notification.wav' },
  { name: 'Applause', file: 'Applause.wav' },
  { name: 'JR Station', file: 'JR Station Notification 3.mp3' },
  { name: 'JR Osaka Loop', file: 'JR Osaka Loop 4.mp3' },
  { name: 'JR Morning Tranquility', file: 'JR Morning Tranquility.mp3' },
  { name: 'JR Flower Shop', file: 'JR Flower Shop.mp3' },
].map((p) => ({ ...p, url: ALARM_SOUND_BASE + encodeURIComponent(p.file) }));
const ALARM_SOUND_MAX_BYTES = 10 * 1024 * 1024;
// The spoken alarm: not a file — the phone's own voice reads the reminder out
// loud (native AlarmSpeech). Saved in the same field as a sound URL, as this
// sentinel, so everything downstream stays one choice. Only offered on a build
// whose bridge can preview it (older builds would fall back to the default tone).
const SPOKEN_SOUND_URL = 'speak:';
const SPOKEN_SOUND_NAME = 'Read it to me';
const SPOKEN_SAMPLE = 'Time for this. Move the laundry to the dryer.';

// The alarm-sound chooser on its own, so the Settings card and the first-time
// set-up popup (QuickCapturePrompt's AlarmPermissionsDialog) show the very
// same thing and save to the same place.
export function AlarmSoundPicker({ user, theme, onSaved, className = '' }) {
  const dark = theme === 'dark';
  const [sound, setSound] = useState({ url: user?.alarm_sound_url || '', name: user?.alarm_sound_name || '' });
  const [soundBusy, setSoundBusy] = useState(false);
  const [soundNote, setSoundNote] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef(null);
  const fileRef = useRef(null);
  const { AlarmBridge } = getPlugins();
  const canSpeak = typeof AlarmBridge?.previewSpeech === 'function';

  useEffect(() => {
    setSound({ url: user?.alarm_sound_url || '', name: user?.alarm_sound_name || '' });
  }, [user?.alarm_sound_url, user?.alarm_sound_name]);

  useEffect(() => () => {
    if (previewRef.current === 'speech') AlarmBridge?.stopSpeech?.().catch(() => {});
    else if (previewRef.current) previewRef.current.pause();
  }, []);

  const stopPreview = () => {
    if (previewRef.current === 'speech') {
      previewRef.current = null;
      AlarmBridge?.stopSpeech?.().catch(() => {});
    } else if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
    }
    setPreviewing(false);
  };

  const togglePreview = () => {
    if (previewRef.current) {
      stopPreview();
      return;
    }
    if (!sound.url) return;
    if (sound.url === SPOKEN_SOUND_URL) {
      if (!canSpeak) return;
      previewRef.current = 'speech';
      setPreviewing(true);
      AlarmBridge.previewSpeech({ text: SPOKEN_SAMPLE })
        .then((res) => {
          if (previewRef.current !== 'speech') return;
          previewRef.current = null;
          setPreviewing(false);
          if (res && res.spoke === false && !res.stopped) {
            setSoundNote("This phone has no voice to read with (check its text-to-speech settings). Alarms would use the default tone instead.");
          }
        })
        .catch(() => stopPreview());
      return;
    }
    const audio = new Audio(sound.url);
    audio.onended = stopPreview;
    audio.onerror = () => {
      stopPreview();
      setSoundNote("Couldn't play that sound.");
    };
    previewRef.current = audio;
    setPreviewing(true);
    audio.play().catch(() => stopPreview());
  };

  const applySound = async (url, name) => {
    stopPreview();
    setSoundBusy(true);
    setSoundNote('');
    try {
      await base44.auth.updateMe({ alarm_sound_url: url, alarm_sound_name: name });
      setSound({ url, name });
      const res = await pushAlarmSound({ alarm_sound_url: url, alarm_sound_name: name });
      if (url === SPOKEN_SOUND_URL) {
        setSoundNote("Saved. Your alarms will be read out loud in the phone's voice — tap Play to hear it.");
      } else if (url) {
        setSoundNote(res?.ready
          ? 'Saved to your phone — it rings even with no signal.'
          : "Saved. It couldn't download yet, so the phone's default alarm rings until it does.");
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setSoundNote("Couldn't save that sound. Try again.");
    } finally {
      setSoundBusy(false);
    }
  };

  const handlePick = (e) => {
    const url = e.target.value;
    if (url === '__upload__') {
      fileRef.current?.click();
      return;
    }
    if (url === SPOKEN_SOUND_URL) {
      applySound(url, SPOKEN_SOUND_NAME);
      return;
    }
    const preset = ALARM_SOUND_PRESETS.find((p) => p.url === url);
    applySound(url, preset ? preset.name : sound.name);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > ALARM_SOUND_MAX_BYTES) {
      setSoundNote('That file is over 10 MB — pick a shorter clip.');
      return;
    }
    setSoundBusy(true);
    setSoundNote('Uploading…');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error('upload returned no url');
      await applySound(file_url, file.name.replace(/\.[a-z0-9]+$/i, ''));
    } catch (err) {
      setSoundNote("Couldn't upload that file. Try again.");
      setSoundBusy(false);
    }
  };

  const textMain = dark ? 'text-gray-200' : 'text-gray-900';
  const textSub = dark ? 'text-gray-400' : 'text-gray-600';
  const isPreset = !sound.url || sound.url === SPOKEN_SOUND_URL || ALARM_SOUND_PRESETS.some((p) => p.url === sound.url);

  return (
    <div className={className}>
      <p className={`text-sm font-medium ${textMain}`}>Alarm sound</p>
      <div className="flex items-center gap-2 mt-2">
        <select
          value={sound.url}
          onChange={handlePick}
          disabled={soundBusy}
          className={`flex-1 min-w-0 text-sm rounded-lg px-2 py-2 border ${dark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'}`}
        >
          {(canSpeak || sound.url === SPOKEN_SOUND_URL) && (
            <option value={SPOKEN_SOUND_URL}>{SPOKEN_SOUND_NAME} (spoken, no tone)</option>
          )}
          <option value="">Phone's default alarm</option>
          {ALARM_SOUND_PRESETS.map((p) => (
            <option key={p.url} value={p.url}>{p.name}</option>
          ))}
          {!isPreset && <option value={sound.url}>Your upload: {sound.name || 'sound'}</option>}
          <option value="__upload__">Upload your own…</option>
        </select>
        <Button size="sm" variant="outline" onClick={togglePreview} disabled={!sound.url || soundBusy}>
          {previewing ? 'Stop' : 'Play'}
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        className="hidden"
        onChange={handleUpload}
      />
      {soundNote && <p className={`text-xs mt-2 ${textSub}`}>{soundNote}</p>}
    </div>
  );
}

export function AlarmCard({ user, theme }) {
  const { AlarmBridge, NotifyBridge } = getPlugins();
  const dark = theme === 'dark';
  const [on, setOn] = useState(user?.alarm_mode === 'alarm');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // After the default changes: "switch your existing tasks too?" — holds the
  // mode just chosen while the question is up; null = no question.
  const [convertTo, setConvertTo] = useState(null);
  const [converting, setConverting] = useState(false);

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
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [AlarmBridge]);

  if (!AlarmBridge?.sync) return null;

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
      setAlarmMode(mode);
      await refreshAlarms();
      await refreshStatus();
      // Anything Android still withholds opens the guided walk-through now,
      // not the first time an alarm quietly fails to ring.
      if (next) await requestAlarmPermissions({ setup: true });
      // The default only covers tasks with no choice of their own. Ask whether
      // the tasks they already have should follow the new choice as well.
      setConvertTo(mode);
    } catch (e) {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Stamp the chosen style on every task they have now, so all of them ring
  // (or don't) the same way. Only the alert style changes — reminder times,
  // dates and everything else on the task stay exactly as they are.
  const convertExistingTasks = async (mode) => {
    setConverting(true);
    setError('');
    try {
      const tasks = await base44.entities.Task.list('-updated_date', 500);
      // A task with no choice of its own already follows the new default, so
      // only tasks that explicitly chose the other style need touching — and
      // those all at once, not one after another (75 tasks used to take ages).
      const toChange = (tasks || []).filter((t) =>
        t.status === 'active' && (t.alert_style === 'alarm' || t.alert_style === 'notification') && t.alert_style !== mode);
      const BATCH = 10;
      for (let i = 0; i < toChange.length; i += BATCH) {
        await Promise.all(toChange.slice(i, i + BATCH).map((t) => base44.entities.Task.update(t.id, { alert_style: mode })));
      }
      await refreshAlarms();
      await refreshStatus();
    } catch (e) {
      setError("Couldn't update every task. Try again from a task's own switch.");
    } finally {
      setConverting(false);
      setConvertTo(null);
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
      <Dialog open={!!convertTo} onOpenChange={(o) => { if (!o && !converting) setConvertTo(null); }}>
        <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={dark ? 'text-white' : ''}>
              {convertTo === 'alarm' ? 'Switch your existing tasks to alarms too?' : 'Switch your existing tasks to regular notifications too?'}
            </DialogTitle>
            <DialogDescription className={dark ? 'text-gray-400' : ''}>
              New tasks will use your new choice either way. This changes only how the tasks you already
              have get your attention — their reminder times don't move.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => convertExistingTasks(convertTo)} disabled={converting} className="flex-1">
              {converting ? 'Updating…' : 'Yes, all my tasks'}
            </Button>
            <Button variant="outline" onClick={() => setConvertTo(null)} disabled={converting} className="flex-1">
              Just new ones
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
              New tasks ring as an alarm
            </p>
            <p className={`text-xs ${textSub}`}>
              Same reminder times, but full-screen and impossible to ignore instead of a
              regular notification. Each task's detail card has its own switch.
            </p>
          </div>
          <Switch checked={on} onCheckedChange={handleToggle} disabled={busy} />
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <AlarmSoundPicker
          user={user}
          theme={theme}
          onSaved={refreshStatus}
          className={`mt-4 border-t pt-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}
        />

        {status && (
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
              detail="Lets the alarm take over the screen when the phone is locked."
              action="Allow"
              onAction={() => AlarmBridge.openFullScreenSettings()}
            />
            {status.overlay !== undefined && (
              <Row
                ok={status.overlay}
                label="Display over other apps"
                detail="Lets the alarm take over the screen while you're using the phone. Without it Android only shows a banner."
                action="Allow"
                onAction={() => AlarmBridge.openOverlaySettings()}
              />
            )}
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
