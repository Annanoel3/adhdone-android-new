import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePomodoro } from '@/context/PomodoroContext';
import { base44 } from '@/api/base44Client';
import { scheduleReminder, cancelScheduledReminder } from '@/components/utils/reminderScheduler';
import { playWarning, playLiftoff, playSprintEnd, haptic } from '@/components/utils/launchSounds';
import LaunchpadTransition from '@/components/launch/LaunchpadTransition';
import SprintPopup from '@/components/launch/SprintPopup';
import { Rocket, Timer, X } from 'lucide-react';

const LaunchContext = createContext(null);
const LAUNCHPAD_KEY = 'launchpad_session';
const SPRINT_KEY = 'sprint_session';
const DURATION_MS = 5 * 60 * 1000;
// Don't fire a stale completion if the app reopens more than this long after
// the scheduled time (avoids a surprise rocket sound hours later).
const GRACE_MS = 10 * 60 * 1000;

export function LaunchProvider({ children }) {
  const navigate = useNavigate();
  const pomodoro = usePomodoro();
  const [launchpad, setLaunchpad] = useState(null);
  const [sprint, setSprint] = useState(null);
  const [sprintEnded, setSprintEnded] = useState(false);
  const [launchpadMinimized, setLaunchpadMinimized] = useState(false);
  const [sprintMinimized, setSprintMinimized] = useState(false);

  const pomodoroRef = useRef(pomodoro);
  useEffect(() => { pomodoroRef.current = pomodoro; }, [pomodoro]);

  const fireLiftoff = useCallback(async (taskId) => {
    playLiftoff();
    haptic([200, 100, 200, 100, 300]);
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
          playSprintEnd();
          haptic([100, 50, 100]);
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

    const session = { taskId: task.id, title: task.title, endTimeISO, notifId };
    localStorage.setItem(SPRINT_KEY, JSON.stringify(session));
    setSprintEnded(false);
    setSprintMinimized(false);
    setSprint(session);
  }, []);

  const cancelLaunchpad = useCallback(() => {
    if (launchpad?.notifId) cancelScheduledReminder(launchpad.notifId).catch(() => {});
    localStorage.removeItem(LAUNCHPAD_KEY);
    setLaunchpadMinimized(false);
    setLaunchpad(null);
  }, [launchpad]);

  const cancelSprint = useCallback(() => {
    const p = pomodoroRef.current;
    if (p) p.resetTimer(); // stop the sprint's pomodoro so the mini bar disappears
    if (sprint?.notifId) cancelScheduledReminder(sprint.notifId).catch(() => {});
    localStorage.removeItem(SPRINT_KEY);
    setSprintMinimized(false);
    setSprint(null);
    setSprintEnded(false);
  }, [sprint]);

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
          onResume={() => { setLaunchpadMinimized(false); localStorage.setItem(LAUNCHPAD_KEY, JSON.stringify({ ...launchpad, minimized: false })); }}
          onCancel={cancelLaunchpad}
        />
      )}
      {sprint && !sprintMinimized && (
        <SprintPopup
          session={sprint}
          ended={sprintEnded}
          onComplete={() => {
            if (sprint.notifId) cancelScheduledReminder(sprint.notifId).catch(() => {});
            localStorage.removeItem(SPRINT_KEY);
            playSprintEnd();
            haptic([100, 50, 100]);
            setSprintEnded(true);
          }}
          onKeepGoing={() => {
            localStorage.removeItem(SPRINT_KEY);
            setSprint(null);
            setSprintEnded(false);
          }}
          onStop={() => {
            const p = pomodoroRef.current;
            if (p) p.resetTimer();
            localStorage.removeItem(SPRINT_KEY);
            setSprintMinimized(false);
            setSprint(null);
            setSprintEnded(false);
          }}
          onMinimize={() => { setSprintMinimized(true); localStorage.setItem(SPRINT_KEY, JSON.stringify({ ...sprint, minimized: true })); }}
          onCancel={cancelSprint}
        />
      )}
      {sprint && sprintMinimized && (
        <MinimizedChip
          icon={Timer}
          label={`5-min Sprint · ${sprint.title}`}
          onResume={() => { setSprintMinimized(false); localStorage.setItem(SPRINT_KEY, JSON.stringify({ ...sprint, minimized: false })); }}
          onCancel={cancelSprint}
        />
      )}
    </LaunchContext.Provider>
  );
}

function MinimizedChip({ icon: Icon, label, onResume, onCancel }) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full shadow-lg pl-4 pr-2 py-2 bg-gray-900 text-white"
      style={{ bottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }}
    >
      <Icon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      <button onClick={onResume} className="text-sm font-medium max-w-[45vw] truncate hover:underline">
        {label}
      </button>
      <button
        onClick={onCancel}
        className="ml-1 w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center flex-shrink-0"
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