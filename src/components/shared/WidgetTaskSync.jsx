import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { pushWidgetTasks, pushAlarms, pushAlarmSound, LOUD_ALARM_SOUND_FOR, setAlarmMode, pushAlarmQuietWhen, quietWhenFor, pushEventQuiet, refreshAlarms, alarmPermissionStatus, listActiveTasks } from '../utils/widgetBridge';
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

// The phone's plugins can show up a moment after the page loads (the update
// prompt and the quiet button wait for them too). Anything that decides what
// to show by "is the plugin there?" at first render gets the wrong answer
// once and never looks again — that's how a phone with the new recorder
// build showed no Record Notes in the menu. This watches for the plugin and
// re-renders when it lands.
export function usePluginPresent(name, timeoutMs = 20000) {
  const [present, setPresent] = useState(() => !!(typeof window !== "undefined" && window.Capacitor?.Plugins?.[name]));
  useEffect(() => {
    if (present || typeof window === "undefined" || !window.Capacitor?.isNativePlatform?.()) return;
    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (window.Capacitor?.Plugins?.[name]) {
        clearInterval(poll);
        setPresent(true);
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(poll);
      }
    }, 500);
    return () => clearInterval(poll);
  }, [name, present, timeoutMs]);
  return present;
}

export default function WidgetTaskSync({ user }) {
  const recorderPresent = usePluginPresent('RecorderBridge');
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

  // Which build this phone runs and which of our plugins it has, on file so
  // "why isn't X showing for them?" has an answer. Read once the plugins have
  // had a moment to land (they can announce themselves after the first
  // render); written only when something changed.
  const savedBuild = user?.app_build;
  const savedPlugins = Array.isArray(user?.phone_plugins) ? user.phone_plugins.join(',') : '';
  useEffect(() => {
    if (!userId || !window.Capacitor?.isNativePlatform?.()) return;
    let gone = false;
    const t = setTimeout(async () => {
      if (gone) return;
      const OURS = ['AlarmBridge', 'NotifyBridge', 'ShareBridge', 'WidgetBridge', 'CalendarBridge', 'RecorderBridge', 'ContactPickerBridge'];
      const plugins = OURS.filter((n) => !!window.Capacitor?.Plugins?.[n]);
      let info = null;
      try { info = await window.Capacitor?.Plugins?.App?.getInfo?.(); } catch (e) { /* older build */ }
      const build = info?.build ? String(info.build) : '';
      const version = info?.version ? String(info.version) : '';
      const patch = {};
      if (build && build !== savedBuild) { patch.app_build = build; patch.app_version = version; }
      if (plugins.join(',') !== savedPlugins) patch.phone_plugins = plugins;
      if (Object.keys(patch).length) base44.auth.updateMe(patch).catch(() => {});
    }, 12000);
    return () => { gone = true; clearTimeout(t); };
  }, [userId, savedBuild, savedPlugins]);

  // The reminder planner words an appointment's reminders around recording
  // notes only for people whose phone can record (app build 36+), so it has
  // to be told once.
  const canRecordSaved = user?.notes_can_record === true;
  useEffect(() => {
    if (!userId || canRecordSaved || !recorderPresent) return;
    base44.auth.updateMe({ notes_can_record: true }).catch(() => {});
  }, [userId, canRecordSaved, recorderPresent]);

  const soundUrl = user?.alarm_sound_url;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    // A chime from the old, quiet set is swapped for its loud re-master (same
    // sound, alarm loudness — see LOUD_ALARM_SOUND_FOR): the account is moved
    // and the phone gets the loud file now, not on the next open.
    const loud = LOUD_ALARM_SOUND_FOR.get(soundUrl);
    if (loud) {
      base44.auth.updateMe({ alarm_sound_url: loud }).catch(() => {});
      pushAlarmSound({ ...user, alarm_sound_url: loud });
      return;
    }
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
  // Read on open and whenever the app comes back to the front; written only
  // when something changed, or once a day.
  //
  // "Back to the front" has to include Android's own permission dialogs: they
  // pause the app without hiding the page, so visibilitychange never fires for
  // them. The first read happens the instant a new account opens the app —
  // before any prompt — and with nothing re-reading after the prompts, someone
  // who allowed notifications a minute later stayed on file as "off" for good
  // (and the nudge planner now skips people whose phone says off). So the
  // app-state change is watched too, and the read is cheap enough (a local
  // call, no network) to repeat every few seconds.
  const savedPermissions = user?.alarm_permissions;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    let saved = savedPermissions || null;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 5 * 1000) return;
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
    let stateHandle = null;
    let gone = false;
    Promise.resolve(window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', ({ isActive }) => {
      if (isActive) check();
    }))
      .then((h) => { if (gone) h?.remove?.(); else stateHandle = h; })
      .catch(() => {});
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', check);
      stateHandle?.remove?.();
    };
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
