import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePomodoro } from '@/context/PomodoroContext';
import { base44 } from '@/api/base44Client';
import { scheduleReminder, cancelScheduledReminder } from '@/components/utils/reminderScheduler';
import { playWarning, haptic } from '@/components/utils/launchSounds';
import { startAlertLoop, stopAlertLoop } from '@/components/utils/alertLoop';
import { getLaunchAlertSound, COMPLETION_SOUNDS } from '@/components/utils/completionSounds';
import { timerAlarmsSupported, bookOwnAlarm, cancelOwnAlarm, requestAlarmPermissions } from '@/components/utils/widgetBridge';
import LaunchpadTransition from '@/components/launch/LaunchpadTransition';
import SprintPopup from '@/components/launch/SprintPopup';
import { Rocket, Timer, X } from 'lucide-react';
import { readThemeState, chipClasses } from '@/components/utils/launchTheme';

// On the build that can ring, the launchpad's liftoff and the sprint's end are
// alarms on the phone's own clock — they ring with the app open or closed,
// with the launch alert sound picked in the app, never the account-wide alarm
// sound. The in-app popups stay for their buttons; only the sound loop moves
// to the alarm. Older builds keep the loop and the fallback push.
const LAUNCHPAD_ALARM_ID = 'timer:launchpad';
const SPRINT_ALARM_ID = 'timer:sprint';
const launchSoundUrl = () => COMPLETION_SOUNDS[getLaunchAlertSound()]?.url || '';
const ringHere = () => { if (!timerAlarmsSupported()) startAlertLoop(getLaunchAlertSound()); };
// The sprint alarm screen carries the popup's two choices as buttons. A tap
// stops the ring and opens the app at one of these paths; the effect below
// turns that into the same "keep going" / "stop" the popup's buttons run.
const SPRINT_ALARM_ACTIONS = [
  { label: 'Keep going', path: '/Home?sprint=keep' },
  { label: "I'm done", path: '/Home?sprint=stop' },
];
// The sprint that most recently ran, kept outside React state so an alarm
// button tapped after the popup has gone can still act on it.
let lastSprint = null;

const LaunchContext = createContext(null);
const LAUNCHPAD_KEY = 'launchpad_session';
const SPRINT_KEY = 'sprint_session';
const DURATION_MS = 5 * 60 * 1000;
// Don't fire a stale completion if the app reopens more than this long after
// the scheduled time (avoids a surprise rocket sound hours later).
const GRACE_MS = 10 * 60 * 1000;

export function LaunchProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pomodoro = usePomodoro();
  const [launchpad, setLaunchpad] = useState(null);
  const [sprint, setSprint] = useState(null);
  const [sprintEnded, setSprintEnded] = useState(false);
  const [launchpadMinimized, setLaunchpadMinimized] = useState(false);
  const [sprintMinimized, setSprintMinimized] = useState(false);
  // Visual theme for the Launchpad / Sprint overlays — read from the same
  // localStorage keys the Layout persists. Theme changes reload the app, so a
  // render-time read is sufficient.
  const { theme, specialMode } = readThemeState();

  const pomodoroRef = useRef(pomodoro);
  useEffect(() => { pomodoroRef.current = pomodoro; }, [pomodoro]);

  const fireLiftoff = useCallback(async (taskId) => {
    // Alert repeats (sound + vibration) until the user taps something — from
    // the phone's alarm where the build can ring, else the in-app loop.
    ringHere();
    // Liftoff enters Focus Mode for the chosen task — silences other recurring
    // reminders and enables hourly check-ins on it. The FocusModePrompt (in the
    // Layout) listens for the broadcast event and shows the active session, which
    // includes an optional mini Pomodoro for a timed burst.
    if (taskId) {
      try {
        await base44.functions.invoke('setFocusMode', { action: 'enter', taskId });
        window.dispatchEvent(new CustomEvent('focus-mode-changed', { detail: { taskId } }));
      } catch (e) {
        console.error('Failed to enter focus mode on liftoff:', e);
      }
    }
    navigate('/Home', { replace: true });
  }, [navigate]);

  // Restore any session that was active when the app was backgrounded/closed.
  useEffect(() => {
    try {
      const lpRaw = localStorage.getItem(LAUNCHPAD_KEY);
      if (lpRaw) {
        const lp = JSON.parse(lpRaw);
        const passed = Date.now() - new Date(lp.endTimeISO).getTime();
        if (passed > GRACE_MS) {
          localStorage.removeItem(LAUNCHPAD_KEY);
        } else if (passed >= 0) {
          // Liftoff was due while away — fire it now.
          localStorage.removeItem(LAUNCHPAD_KEY);
          if (lp.notifId) cancelScheduledReminder(lp.notifId).catch(() => {});
          fireLiftoff(lp.taskId);
        } else {
          setLaunchpad(lp);
          setLaunchpadMinimized(!!lp.minimized);
        }
      }
    } catch { /* ignore */ }

    try {
      const spRaw = localStorage.getItem(SPRINT_KEY);
      if (spRaw) {
        const sp = JSON.parse(spRaw);
        const passed = Date.now() - new Date(sp.endTimeISO).getTime();
        if (passed > GRACE_MS) {
          localStorage.removeItem(SPRINT_KEY);
        } else if (passed >= 0) {
          // Sprint ended while away — show the checkpoint.
          localStorage.removeItem(SPRINT_KEY);
          if (sp.notifId) cancelScheduledReminder(sp.notifId).catch(() => {});
          ringHere();
          lastSprint = sp;
          setSprint(sp);
          setSprintEnded(true);
        } else {
          setSprint(sp);
          setSprintMinimized(!!sp.minimized);
        }
      }
    } catch { /* ignore */ }
  }, [fireLiftoff]);

  const startLaunchpad = useCallback(async (task) => {
    let user;
    try { user = await base44.auth.me(); } catch { return; }
    if (!user?.email) return;

    const endTimeISO = new Date(Date.now() + DURATION_MS).toISOString();
    let notifId = null;
    // On a build that can ring, the phone's alarm IS the alert — no push as
    // well, or the moment arrives twice (a banner and a full-screen ring).
    // The push is only the fallback for builds without alarms.
    if (!timerAlarmsSupported()) {
      try {
        notifId = await scheduleReminder({
          email: user.email,
          title: '🚀 Liftoff time!',
          body: `Time to start: ${task.title}\n\nLet's go — you've got this.`,
          sendAtISO: endTimeISO,
          taskId: task.id,
          data: { screen: '/FocusTimer', taskId: task.id, type: 'launchpad' },
        });
      } catch (e) { console.error('Launchpad push scheduling failed:', e); }
    }

    if (timerAlarmsSupported()) {
      requestAlarmPermissions({ feature: 'timers' });
      bookOwnAlarm({
        id: LAUNCHPAD_ALARM_ID,
        taskId: task.id,
        title: '🚀 Liftoff time!',
        heading: '🚀 Liftoff time!',
        body: `Time to start: ${task.title}`,
        at: new Date(endTimeISO).getTime(),
        soundUrl: launchSoundUrl(),
      });
    }

    const session = { taskId: task.id, title: task.title, endTimeISO, notifId };
    localStorage.setItem(LAUNCHPAD_KEY, JSON.stringify(session));
    setLaunchpadMinimized(false);
    setLaunchpad(session);
  }, []);

  const startSprint = useCallback(async (task) => {
    let user;
    try { user = await base44.auth.me(); } catch { return; }
    if (!user?.email) return;

    // Start a fresh pomodoro work session immediately.
    const p = pomodoroRef.current;
    if (p) {
      p.resetTimer();
      setTimeout(() => p.toggleTimer(), 60);
    }

    const endTimeISO = new Date(Date.now() + DURATION_MS).toISOString();
    let notifId = null;
    // Alarm only on a build that can ring (see startLaunchpad); the push is
    // the fallback for builds without alarms.
    if (!timerAlarmsSupported()) {
      try {
        notifId = await scheduleReminder({
          email: user.email,
          title: '⏱️ 5 minutes up — no pressure!',
          body: "It's okay to stop if you want. You showed up, and that's the win. 💚",
          sendAtISO: endTimeISO,
          taskId: task.id,
          data: { screen: '/FocusTimer', taskId: task.id, type: 'sprint_end' },
        });
      } catch (e) { console.error('Sprint push scheduling failed:', e); }
    }

    if (timerAlarmsSupported()) {
      requestAlarmPermissions({ feature: 'timers' });
      bookOwnAlarm({
        id: SPRINT_ALARM_ID,
        taskId: task.id,
        title: '⏱️ 5 minutes up — no pressure!',
        heading: '⏱️ 5 minutes up — no pressure!',
        body: "It's okay to stop if you want. You showed up, and that's the win. 💚",
        at: new Date(endTimeISO).getTime(),
        soundUrl: launchSoundUrl(),
        actions: SPRINT_ALARM_ACTIONS,
      });
    }

    const session = { taskId: task.id, title: task.title, endTimeISO, notifId };
    lastSprint = session;
    localStorage.setItem(SPRINT_KEY, JSON.stringify(session));
    setSprintEnded(false);
    setSprintMinimized(false);
    setSprint(session);
  }, []);

  // A finished sprint is real timed work — log it so Insights learns how long
  // this task actually takes (Focus Mode logs its own sessions separately, so
  // the "keep going" path is deliberately excluded to avoid double-counting).
  const logSprintSession = useCallback(async (sp) => {
    if (!sp?.title) return;
    const startMs = new Date(sp.endTimeISO).getTime() - DURATION_MS;
    const seconds = Math.round((Date.now() - startMs) / 1000);
    if (seconds < 60) return;
    try {
      const user = await base44.auth.me();
      await base44.entities.FocusSessionLog.create({
        task_id: sp.taskId,
        task_title: sp.title,
        duration_seconds: seconds,
        started_at: new Date(startMs).toISOString(),
        completed_at: new Date().toISOString(),
        user_email: user.email,
      });
    } catch (e) {
      console.error('Failed to log sprint session:', e);
    }
  }, []);

  const cancelLaunchpad = useCallback(() => {
    cancelOwnAlarm(LAUNCHPAD_ALARM_ID);
    if (launchpad?.notifId) cancelScheduledReminder(launchpad.notifId).catch(() => {});
    localStorage.removeItem(LAUNCHPAD_KEY);
    setLaunchpadMinimized(false);
    setLaunchpad(null);
  }, [launchpad]);

  const cancelSprint = useCallback(() => {
    stopAlertLoop();
    cancelOwnAlarm(SPRINT_ALARM_ID);
    if (sprintEnded) logSprintSession(sprint);
    const p = pomodoroRef.current;
    if (p) p.resetTimer(); // stop the sprint's pomodoro so the mini bar disappears
    if (sprint?.notifId) cancelScheduledReminder(sprint.notifId).catch(() => {});
    localStorage.removeItem(SPRINT_KEY);
    setSprintMinimized(false);
    setSprint(null);
    setSprintEnded(false);
  }, [sprint, sprintEnded, logSprintSession]);

  // The two choices at the end of a sprint. The popup's buttons run these, and
  // so do the same buttons on the alarm screen (via ?sprint=keep / ?sprint=stop).
  const keepGoingAfterSprint = useCallback(async (sp) => {
    stopAlertLoop();
    cancelOwnAlarm(SPRINT_ALARM_ID);
    // "Keep going" → hand off into Focus Mode for this task (same destination
    // as the Launchpad liftoff and the Home Focus button). Reset the sprint's
    // pomodoro so the Focus Mode overlay's own optional timer takes over.
    const p = pomodoroRef.current;
    if (p) p.resetTimer();
    localStorage.removeItem(SPRINT_KEY);
    if (sp?.taskId) {
      try {
        // Carry the time already spent in the sprint into Focus Mode so
        // the elapsed timer keeps counting from the sprint's start
        // instead of restarting at zero.
        const sprintStartISO = new Date(new Date(sp.endTimeISO).getTime() - DURATION_MS).toISOString();
        // setFocusMode writes the session onto the profile FIRST and then spends
        // several seconds booking check-ins and quieting other tasks. Waiting
        // for all of it left this button dead for 6-7 seconds. Wait only until
        // the profile shows Focus Mode on (a beat), then move; the rest of the
        // call finishes in the background.
        base44.functions.invoke('setFocusMode', { action: 'enter', taskId: sp.taskId, startedAt: sprintStartISO })
          .catch((e) => console.error('Failed to enter focus mode after sprint:', e));
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const me = await base44.auth.me().catch(() => null);
          if (me?.focus_mode_task_id === sp.taskId) break;
        }
        navigate('/Home', { replace: true });
        window.dispatchEvent(new CustomEvent('focus-mode-changed', { detail: { taskId: sp.taskId } }));
        // No second nudge once the call finishes: the profile already showed
        // the session on, and a late nudge could reopen a task the user had
        // finished in the meantime.
      } catch (e) {
        console.error('Failed to enter focus mode after sprint:', e);
      }
    }
    // Only drop the sprint popup once Focus Mode is entered, so there's
    // no blank Home screen in between.
    setSprint(null);
    setSprintEnded(false);
  }, [navigate]);

  const stopAfterSprint = useCallback((sp) => {
    stopAlertLoop();
    cancelOwnAlarm(SPRINT_ALARM_ID);
    if (sp) logSprintSession(sp);
    const p = pomodoroRef.current;
    if (p) p.resetTimer();
    localStorage.removeItem(SPRINT_KEY);
    setSprintMinimized(false);
    setSprint(null);
    setSprintEnded(false);
  }, [logSprintSession]);

  // A button tapped on the sprint's alarm screen lands here as ?sprint=keep or
  // ?sprint=stop. The query is cleared first so a remount can't replay it.
  useEffect(() => {
    const action = new URLSearchParams(location.search).get('sprint');
    if (!action) return;
    navigate(location.pathname, { replace: true });
    let sp = sprint || lastSprint;
    if (!sp) {
      // The app was gone when the alarm rang: the session is still on disk.
      try { sp = JSON.parse(localStorage.getItem(SPRINT_KEY) || 'null'); } catch { sp = null; }
    }
    if (action === 'keep') keepGoingAfterSprint(sp);
    else if (action === 'stop') stopAfterSprint(sp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  return (
    <LaunchContext.Provider
      value={{
        startLaunchpad,
        startSprint,
        hasActiveLaunch: !!(launchpad || sprint),
      }}
    >
      {children}
      {launchpad && !launchpadMinimized && (
        <LaunchpadTransition
          session={launchpad}
          theme={theme}
          specialMode={specialMode}
          onWarn={() => { playWarning(); haptic(80); }}
          onComplete={() => {
            localStorage.removeItem(LAUNCHPAD_KEY);
            if (launchpad.notifId) cancelScheduledReminder(launchpad.notifId).catch(() => {});
            setLaunchpadMinimized(false);
            setLaunchpad(null);
            fireLiftoff(launchpad.taskId);
          }}
          onMinimize={() => { setLaunchpadMinimized(true); localStorage.setItem(LAUNCHPAD_KEY, JSON.stringify({ ...launchpad, minimized: true })); }}
          onCancel={cancelLaunchpad}
        />
      )}
      {launchpad && launchpadMinimized && (
        <MinimizedChip
          icon={Rocket}
          label={`Launchpad · ${launchpad.title}`}
          theme={theme}
          specialMode={specialMode}
          onResume={() => { setLaunchpadMinimized(false); localStorage.setItem(LAUNCHPAD_KEY, JSON.stringify({ ...launchpad, minimized: false })); }}
          onCancel={cancelLaunchpad}
        />
      )}
      {sprint && !sprintMinimized && (
        <SprintPopup
          session={sprint}
          theme={theme}
          specialMode={specialMode}
          ended={sprintEnded}
          onComplete={() => {
            if (sprint.notifId) cancelScheduledReminder(sprint.notifId).catch(() => {});
            localStorage.removeItem(SPRINT_KEY);
            ringHere();
            setSprintEnded(true);
          }}
          onKeepGoing={() => keepGoingAfterSprint(sprint)}
          onStop={() => stopAfterSprint(sprint)}
          onMinimize={() => { setSprintMinimized(true); localStorage.setItem(SPRINT_KEY, JSON.stringify({ ...sprint, minimized: true })); }}
          onCancel={cancelSprint}
        />
      )}
      {sprint && sprintMinimized && (
        <MinimizedChip
          icon={Timer}
          label={`5-min Sprint · ${sprint.title}`}
          theme={theme}
          specialMode={specialMode}
          onResume={() => { setSprintMinimized(false); localStorage.setItem(SPRINT_KEY, JSON.stringify({ ...sprint, minimized: false })); }}
          onCancel={cancelSprint}
        />
      )}
    </LaunchContext.Provider>
  );
}

function MinimizedChip({ icon: Icon, label, theme, specialMode, onResume, onCancel }) {
  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full shadow-lg pl-4 pr-2 py-2 ${chipClasses(theme, specialMode)}`}
      style={{ bottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }}
    >
      <Icon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      <button onClick={onResume} className="text-sm font-medium max-w-[45vw] truncate hover:underline">
        {label}
      </button>
      <button
        onClick={onCancel}
        className="ml-1 w-7 h-7 rounded-full hover:bg-black/10 flex items-center justify-center flex-shrink-0"
        aria-label="Cancel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useLaunch() {
  const ctx = useContext(LaunchContext);
  if (!ctx) throw new Error('useLaunch must be used within LaunchProvider');
  return ctx;
}