import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { pushWidgetTasks, pushAlarms, pushAlarmSound, setAlarmMode, pushAlarmQuietWhen, quietWhenFor, pushEventQuiet, refreshAlarms, alarmPermissionStatus, listActiveTasks } from '../utils/widgetBridge';
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
    // Every active task (paged): native drops any alarm missing from the set.
    listActiveTasks()
      .then(pushAlarms)
      .catch(() => {});
  }, [userId, alarmMode]);

  const soundUrl = user?.alarm_sound_url;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    pushAlarmSound(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, soundUrl]);

  // Vibrate-only while the phone is quiet (silent or vibrate mode, Do Not
  // Disturb, or both, as picked): the phone keeps its own copy of the answer,
  // so hand it over on open too (a reinstall, or an answer given on another
  // phone). Builds before 1.3.12 only get on/off.
  const quietWhen = quietWhenFor(user);
  useEffect(() => {
    if (!userId) return;
    pushAlarmQuietWhen(quietWhen);
  }, [userId, quietWhen]);

  // "Silent alarms during events": the same, for the phone's copy of that answer.
  const quietDuringEvents = !!user?.alarm_quiet_during_events;
  useEffect(() => {
    if (!userId) return;
    pushEventQuiet(quietDuringEvents);
  }, [userId, quietDuringEvents]);

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

  // What Android allows ADHDone on this phone (notifications, exact alarms,
  // full-screen, display over other apps, battery), saved on the profile so
  // the dashboard shows who is missing a switch that reminders and alarms
  // need. Information only: nothing about reminders changes because of it.
  // Read on open and whenever the app comes back to the front (at most once a
  // minute); written only when something changed, or once a day.
  const savedPermissions = user?.alarm_permissions;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    let saved = savedPermissions || null;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 60 * 1000) return;
      last = Date.now();
      const st = await alarmPermissionStatus();
      if (!st) return;
      const next = {
        notifications: !!st.notifications,
        exact_alarms: !!st.exactAlarms,
        full_screen: !!st.fullScreen,
        battery: !!st.ignoringBatteryOptimizations,
      };
      // Older builds don't report these two; leave them out rather than guess.
      if (typeof st.overlay === 'boolean') next.overlay = st.overlay;
      if (Number(st.lastRangAt) > 0) next.last_rang_at = new Date(Number(st.lastRangAt)).toISOString();
      const keys = Object.keys(next);
      const same = !!saved
        && keys.every((k) => saved[k] === next[k])
        && Object.keys(saved).every((k) => k === 'checked_at' || keys.includes(k));
      const checkedAt = Date.parse(saved?.checked_at || '');
      const fresh = checkedAt > Date.now() - 24 * 60 * 60 * 1000;
      if (same && fresh) return;
      next.checked_at = new Date().toISOString();
      const missing = [
        !next.notifications && 'Notifications',
        !next.exact_alarms && 'Exact alarms',
        !next.full_screen && 'Full-screen',
        next.overlay === false && 'Display over apps',
        !next.battery && 'Battery',
      ].filter(Boolean);
      try {
        await base44.auth.updateMe({
          alarm_permissions: next,
          alarm_permissions_missing: missing.length ? missing.join(', ') : 'All allowed',
        });
        saved = next;
      } catch (err) {
        // Not saved this time; the next open or resume tries again.
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // A capture made outside the app (share sheet, pinned notification, widget)
  // landed while the app is open: refresh the task list, the widget and the
  // phone's alarms right away instead of waiting for the next screen wake.
  useEffect(() => {
    let handle = null;
    let cancelled = false;
    const onLanded = () => {
      window.dispatchEvent(new CustomEvent('tasks-changed'));
      // Active tasks only, every page of them — the widget shows active tasks
      // and native drops any alarm missing from the set.
      listActiveTasks()
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
