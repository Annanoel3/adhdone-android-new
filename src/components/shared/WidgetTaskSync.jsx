import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { pushWidgetTasks, pushAlarms, pushAlarmSound, setAlarmMode, pushAlarmQuietVibrate, refreshAlarms } from '../utils/widgetBridge';
import { maybeAutoSyncDevice } from '@/lib/calendarSync';

// Seeds the home-screen widget once on app open, from anywhere in the app — a
// notification tap or a share can land the user on a screen that never renders
// today's list, and the widget shouldn't sit stale until they visit Home.
// Once Home does render, TodaysTasks keeps it current as tasks change.
//
// Seeds the phone's alarms the same way, once the signed-in user is known
// (their default alert style, alarm_mode, lives on the profile), and hands
// native the ring sound they chose. Only runs on an app build that has the
// AlarmBridge plugin.
export default function WidgetTaskSync({ user }) {
  useEffect(() => {
    if (!window.Capacitor?.Plugins?.WidgetBridge) return;
    base44.entities.Task.list('-updated_date', 500)
      .then(pushWidgetTasks)
      .catch(() => {});
  }, []);

  const userId = user?.id;
  const alarmMode = user?.alarm_mode;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    setAlarmMode(alarmMode);
    base44.entities.Task.list('-updated_date', 500)
      .then(pushAlarms)
      .catch(() => {});
  }, [userId, alarmMode]);

  const soundUrl = user?.alarm_sound_url;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    pushAlarmSound(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, soundUrl]);

  // Vibrate-only while the phone is on silent, vibrate or Do Not Disturb:
  // the phone keeps its own copy of the answer, so hand it over on open too
  // (a reinstall, or an answer given on another phone).
  const quietVibrate = !!user?.alarm_vibrate_when_quiet;
  useEffect(() => {
    if (!userId) return;
    pushAlarmQuietVibrate(quietVibrate);
  }, [userId, quietVibrate]);

  // Phone calendars the user chose to import: refresh them in the background
  // on app open (at most every 6 hours). No-op in the browser and for anyone
  // who never picked a phone calendar.
  // A calendar sync can remove or move imported events, so the phone's alarm
  // list is rebuilt once it's done.
  useEffect(() => {
    if (!user) return;
    maybeAutoSyncDevice(user)
      .then((res) => {
        if (res && !res.aborted && window.Capacitor?.Plugins?.AlarmBridge) refreshAlarms();
      })
      .catch(() => {});
  }, [user?.id, (user?.device_calendar_ids || []).join(',')]);

  // Coming back to the app (it was only in the background, so nothing above
  // re-runs): rebuild the alarm list from the tasks as they are now. A task
  // finished or deleted somewhere else, or an event the calendar moved, must
  // not keep its old alarm on this phone. At most once a minute.
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 60 * 1000) return;
      last = Date.now();
      refreshAlarms();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  // A capture made outside the app (share sheet, pinned notification, widget)
  // landed while the app is open: refresh the task list, the widget and the
  // phone's alarms right away instead of waiting for the next screen wake.
  useEffect(() => {
    let handle = null;
    let cancelled = false;
    const onLanded = () => {
      window.dispatchEvent(new CustomEvent('tasks-changed'));
      base44.entities.Task.list('-updated_date', 500)
        .then((tasks) => {
          pushWidgetTasks(tasks);
          if (window.Capacitor?.Plugins?.AlarmBridge) pushAlarms(tasks);
        })
        .catch(() => {});
    };
    const attach = () => {
      const ShareBridge = window.Capacitor?.Plugins?.ShareBridge;
      if (!ShareBridge?.addListener) return false;
      Promise.resolve(ShareBridge.addListener('captureLanded', onLanded))
        .then((h) => { if (cancelled) h?.remove?.(); else handle = h; })
        .catch(() => {});
      return true;
    };
    // The bridge attaches a moment after the web layer boots.
    const poll = attach() ? null : setInterval(() => { if (attach()) clearInterval(poll); }, 500);
    const stop = poll ? setTimeout(() => clearInterval(poll), 15000) : null;
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (stop) clearTimeout(stop);
      handle?.remove?.();
    };
  }, []);

  return null;
}
