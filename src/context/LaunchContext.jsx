import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePomodoro } from '@/context/PomodoroContext';
import { base44 } from '@/api/base44Client';
import { scheduleReminder, cancelScheduledReminder } from '@/components/utils/reminderScheduler';
import { startAlertLoop, stopAlertLoop } from '@/components/utils/alertLoop';
import { getLaunchAlertSound, COMPLETION_SOUNDS } from '@/components/utils/completionSounds';
import { timerAlarmsSupported, bookOwnAlarm, cancelOwnAlarm, requestAlarmPermissions } from '@/components/utils/widgetBridge';
import SprintPopup from '@/components/launch/SprintPopup';
import { Timer } from 'lucide-react';
import { readThemeState, chipClasses } from '@/components/utils/launchTheme';
import { toast } from '@/components/ui/use-toast';

// The task timer. Pick how long (LaunchButtons), and the countdown stays on
// screen (SprintPopup) with "Stop working" and "I finished the task" there the
// whole time. When it's up it rings, and the choices are "Keep going" (Focus
// Mode on the task, carrying the time already spent), "I finished the task"
// (checks it off) or "Stop working" (the task stays open, e.g. laundry that
// isn't done yet). Both stops log the time. This used to be two things, the Launchpad
// (a 5-minute countdown into Focus Mode) and the 5-minute Sprint; the Launchpad
// is gone and the Sprint became this timer, any length.
//
// On the build that can ring, the end is an alarm on the phone's own clock: it
// rings with the app open or closed, with the sound picked for timers, never
// the account-wide alarm sound. Older builds keep the in-app sound loop and
// the fallback push.
const TIMER_ALARM_ID = 'timer:sprint';
// The Launchpad's alarm id: only ever cancelled now (a countdown that was
// running when the app updated).
const OLD_LAUNCHPAD_ALARM_ID = 'timer:launchpad';
const launchSoundUrl = () => COMPLETION_SOUNDS[getLaunchAlertSound()]?.url || '';
const ringHere = () => { if (!timerAlarmsSupported()) startAlertLoop(getLaunchAlertSound()); };
// The alarm screen carries the end choices as buttons (it has room for three).
// A tap stops the ring and opens the app at one of these paths; the effect
// below turns that into the same thing the popup's buttons do.
const TIMER_ALARM_ACTIONS = [
  { label: 'Keep going', path: '/Home?sprint=keep' },
  { label: 'I finished the task', path: '/Home?sprint=finish' },
  { label: 'Stop working', path: '/Home?sprint=stop' },
];
// The timer that most recently ran, kept outside React state so an alarm
// button tapped after the popup has gone can still act on it.
let lastSprint = null;

const LaunchContext = createContext(null);
const OLD_LAUNCHPAD_KEY = 'launchpad_session';
const SPRINT_KEY = 'sprint_session';
const DEFAULT_MINUTES = 5;
const MINUTE_MS = 60 * 1000;
// Don't show a stale end if the app reopens more than this long after the
// timer ran out (no surprise ring hours later).
const GRACE_MS = 10 * 60 * 1000;

// A session's length. Sessions saved before the timer had a choice of length
// were always 5 minutes.
export const sessionDurationMs = (s) => (s && s.durationMs > 0 ? s.durationMs : DEFAULT_MINUTES * MINUTE_MS);
const minutesWord = (n) => (n === 1 ? '1 minute' : `${n} minutes`);

// "I finished the task": the same finish as ticking it off on Home. The task
// and its open subtasks are done, a repeating task gets its next copy, and the
// lists update right away. The server takes care of its reminders and alarms.
async function finishTimerTask(sp) {
  if (!sp?.taskId) return;
  try {
    const task = await base44.entities.Task.get(sp.taskId).catch(() => null);
    if (!task) return;
    const name = (task.title || sp.title || '').trim() || 'Your task';
    if (task.status === 'completed') {
      toast({ title: `"${name}" was already done ✓` });
      return;
    }
    const completedAt = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('tasks-changed', {
      detail: { taskId: task.id, patch: { status: 'completed', completed_at: completedAt } },
    }));
    await base44.entities.Task.update(task.id, { status: 'completed', completed_at: completedAt });
    toast({ title: `"${name}" is done 🎉` });
    try {
      const { completeSubtasks } = await import('@/components/utils/subtaskCompletion');
      await completeSubtasks(task.id);
    } catch (e) { console.error('Failed to finish subtasks:', e); }
    if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
      try {
        const { createNextRecurrence } = await import('@/components/utils/taskRecurrence');
        await createNextRecurrence(task);
      } catch (e) { console.error('Failed to create next recurrence:', e); }
    }
  } catch (e) {
    console.error('Failed to finish the task from the timer:', e);
    toast({ title: "Couldn't check the task off. Try it from the task itself." });
  }
  // After the save: pages that re-fetched too early catch up with the real state.
  window.dispatchEvent(new CustomEvent('tasks-changed'));
}

export function LaunchProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pomodoro = usePomodoro();
  const [sprint, setSprint] = useState(null);
  const [sprintEnded, setSprintEnded] = useState(false);
  const [sprintMinimized, setSprintMinimized] = useState(false);
  // Visual theme for the timer overlay, read from the same localStorage keys
  // the Layout persists. Theme changes reload the app, so a render-time read
  // is sufficient.
  const { theme, specialMode } = readThemeState();

  const pomodoroRef = useRef(pomodoro);
  useEffect(() => { pomodoroRef.current = pomodoro; }, [pomodoro]);

  // The old 5-minute Sprint started a Pomodoro alongside itself. Only a
  // session from before the timer (no durationMs) still has one to stop; a
  // Pomodoro the person started on their own is never touched.
  const stopLegacyPomodoro = (sp) => {
    if (sp && !sp.durationMs) {
      const p = pomodoroRef.current;
      if (p) p.resetTimer();
    }
  };

  // Restore a timer that was running when the app was backgrounded or closed.
  useEffect(() => {
    // A Launchpad countdown left over from before the update: it is gone.
    try {
      if (localStorage.getItem(OLD_LAUNCHPAD_KEY)) {
        const lp = JSON.parse(localStorage.getItem(OLD_LAUNCHPAD_KEY) || 'null');
        localStorage.removeItem(OLD_LAUNCHPAD_KEY);
        cancelOwnAlarm(OLD_LAUNCHPAD_ALARM_ID);
        if (lp?.notifId) cancelScheduledReminder(lp.notifId).catch(() => {});
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
          // It ran out while away: show the end.
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
  }, []);

  const startTimer = useCallback(async (task, minutes = DEFAULT_MINUTES) => {
    let user;
    try { user = await base44.auth.me(); } catch { return; }
    if (!user?.email) return;

    const mins = Math.max(1, Math.round(Number(minutes) || DEFAULT_MINUTES));
    const durationMs = mins * MINUTE_MS;
    const endTimeISO = new Date(Date.now() + durationMs).toISOString();
    let notifId = null;
    // Every notification names its task: the body is also what the alarm
    // reads out loud, and "time's up" alone doesn't say what for.
    const title = "⏱️ Time's up!";
    const body = `${minutesWord(mins)} on "${(task.title || '').trim() || 'your task'}". Keep going, or stop here. Either way, you showed up. 💚`;
    // Alarm only on a build that can ring; the push is the fallback for
    // builds without alarms (on one that can, both would make the moment
    // arrive twice).
    if (!timerAlarmsSupported()) {
      try {
        notifId = await scheduleReminder({
          email: user.email,
          title,
          body,
          sendAtISO: endTimeISO,
          taskId: task.id,
          data: { screen: '/FocusTimer', taskId: task.id, type: 'sprint_end' },
        });
      } catch (e) { console.error('Timer push scheduling failed:', e); }
    }

    if (timerAlarmsSupported()) {
      requestAlarmPermissions({ feature: 'timers' });
      bookOwnAlarm({
        id: TIMER_ALARM_ID,
        taskId: task.id,
        title,
        heading: title,
        body,
        at: new Date(endTimeISO).getTime(),
        soundUrl: launchSoundUrl(),
        actions: TIMER_ALARM_ACTIONS,
      });
    }

    const session = { taskId: task.id, title: task.title, endTimeISO, notifId, durationMs };
    lastSprint = session;
    localStorage.setItem(SPRINT_KEY, JSON.stringify(session));
    setSprintEnded(false);
    setSprintMinimized(false);
    setSprint(session);
  }, []);

  // A timed session is real timed work: log it so Insights learns how long
  // this task actually takes (Focus Mode logs its own sessions, so the "keep
  // going" path is left out here to avoid counting it twice).
  const logSprintSession = useCallback(async (sp) => {
    if (!sp?.title) return;
    const startMs = new Date(sp.endTimeISO).getTime() - sessionDurationMs(sp);
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
      console.error('Failed to log timer session:', e);
    }
  }, []);

  // "Keep going" (at the end, from the popup or the alarm screen): hand off
  // into Focus Mode for this task, carrying the time already spent.
  const keepGoingAfterSprint = useCallback(async (sp) => {
    stopAlertLoop();
    cancelOwnAlarm(TIMER_ALARM_ID);
    stopLegacyPomodoro(sp);
    localStorage.removeItem(SPRINT_KEY);
    if (sp?.taskId) {
      try {
        // Carry the timer's time into Focus Mode so its elapsed clock keeps
        // counting from the timer's start instead of restarting at zero.
        const startISO = new Date(new Date(sp.endTimeISO).getTime() - sessionDurationMs(sp)).toISOString();
        // setFocusMode writes the session onto the profile FIRST and then
        // spends several seconds booking check-ins and quieting other tasks.
        // Wait only until the profile shows Focus Mode on (a beat), then move;
        // the rest of the call finishes in the background.
        base44.functions.invoke('setFocusMode', { action: 'enter', taskId: sp.taskId, startedAt: startISO })
          .catch((e) => console.error('Failed to enter focus mode after timer:', e));
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const me = await base44.auth.me().catch(() => null);
          if (me?.focus_mode_task_id === sp.taskId) break;
        }
        navigate('/Home', { replace: true });
        window.dispatchEvent(new CustomEvent('focus-mode-changed', { detail: { taskId: sp.taskId } }));
      } catch (e) {
        console.error('Failed to enter focus mode after timer:', e);
      }
    }
    // Only drop the popup once Focus Mode is entered, so there's no blank
    // Home screen in between.
    setSprint(null);
    setSprintEnded(false);
  }, [navigate]);

  // "Stop working": from the popup while it's counting, at the end, from the
  // tucked-away chip, or from the alarm screen. The timer stops and the time
  // spent is logged; the task stays open.
  const stopAfterSprint = useCallback((sp) => {
    stopAlertLoop();
    cancelOwnAlarm(TIMER_ALARM_ID);
    if (sp?.notifId) cancelScheduledReminder(sp.notifId).catch(() => {});
    if (sp) logSprintSession(sp);
    stopLegacyPomodoro(sp);
    localStorage.removeItem(SPRINT_KEY);
    setSprintMinimized(false);
    setSprint(null);
    setSprintEnded(false);
  }, [logSprintSession]);

  // "I finished the task": the same stop, and the task is checked off.
  const finishAfterSprint = useCallback((sp) => {
    stopAfterSprint(sp);
    finishTimerTask(sp);
  }, [stopAfterSprint]);

  // A button tapped on the alarm screen lands here as ?sprint=keep,
  // ?sprint=finish or ?sprint=stop. The query is cleared first so a remount
  // can't replay it.
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
    else if (action === 'finish') finishAfterSprint(sp);
    else if (action === 'stop') stopAfterSprint(sp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  return (
    <LaunchContext.Provider
      value={{
        startTimer,
        // The reminder follow-up's "Just 5 minutes" starts a 5-minute timer.
        startSprint: (task) => startTimer(task, DEFAULT_MINUTES),
        hasActiveLaunch: !!sprint,
      }}
    >
      {children}
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
          onFinish={() => finishAfterSprint(sprint)}
          onStop={() => stopAfterSprint(sprint)}
          onMinimize={() => { setSprintMinimized(true); localStorage.setItem(SPRINT_KEY, JSON.stringify({ ...sprint, minimized: true })); }}
        />
      )}
      {sprint && sprintMinimized && (
        <MinimizedChip
          session={sprint}
          ended={sprintEnded}
          theme={theme}
          specialMode={specialMode}
          onResume={() => { setSprintMinimized(false); localStorage.setItem(SPRINT_KEY, JSON.stringify({ ...sprint, minimized: false })); }}
          onStop={() => stopAfterSprint(sprint)}
          onFinish={() => finishAfterSprint(sprint)}
        />
      )}
    </LaunchContext.Provider>
  );
}

// The timer tucked away: time left and the task, tap to open it again, and
// both ways to stop right there too (short words: the chip is small).
function MinimizedChip({ session, ended, theme, specialMode, onResume, onStop, onFinish }) {
  const endMs = new Date(session.endTimeISO).getTime();
  const [left, setLeft] = useState(() => Math.max(0, endMs - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, endMs - Date.now())), 1000);
    return () => clearInterval(id);
  }, [endMs]);
  const sec = Math.floor(left / 1000);
  const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full shadow-lg pl-4 pr-2 py-2 ${chipClasses(theme, specialMode)}`}
      style={{ bottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }}
    >
      <Timer className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      <button onClick={onResume} className="text-sm font-medium max-w-[30vw] truncate hover:underline">
        <span className="tabular-nums">{ended || left === 0 ? "Time's up" : clock}</span> · {session.title}
      </button>
      <button
        onClick={onStop}
        className="ml-1 text-xs font-semibold px-2.5 py-1 rounded-full hover:bg-black/10 flex-shrink-0"
        aria-label="Stop working"
      >
        Stop
      </button>
      <button
        onClick={onFinish}
        className="text-xs font-semibold px-2.5 py-1 rounded-full hover:bg-black/10 flex-shrink-0"
        aria-label="I finished the task"
      >
        Finished ✓
      </button>
    </div>
  );
}

export function useLaunch() {
  const ctx = useContext(LaunchContext);
  if (!ctx) throw new Error('useLaunch must be used within LaunchProvider');
  return ctx;
}
