import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { schedulePush } from '@/functions/schedulePush';
import { cancelScheduled } from '@/functions/cancelScheduled';

const PomodoroContext = createContext(null);

const STORAGE_KEY = 'pomodoro_state';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // If timer was active, calculate elapsed time
    if (state.isActive && state.savedAt) {
      const elapsed = Math.floor((Date.now() - state.savedAt) / 1000);
      state.timeLeft = Math.max(0, state.timeLeft - elapsed);
    }
    return state;
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
}

export function PomodoroProvider({ children }) {
  const saved = loadState();

  const [workDuration, setWorkDuration] = useState(saved?.workDuration ?? 25);
  const [breakDuration, setBreakDuration] = useState(saved?.breakDuration ?? 5);
  const [timeLeft, setTimeLeft] = useState(saved?.timeLeft ?? 25 * 60);
  const [isActive, setIsActive] = useState(saved?.isActive ?? false);
  const [mode, setMode] = useState(saved?.mode ?? 'work');
  const [sessionCount, setSessionCount] = useState(saved?.sessionCount ?? 0);
  const [completionSound, setCompletionSound] = useState(saved?.completionSound ?? 'joyful_melody');
  const [selectedPlaylist, setSelectedPlaylist] = useState(saved?.selectedPlaylist ?? 'none');

  const intervalRef = useRef(null);
  const audioRef = useRef(null);
  const scheduledNotifIdRef = useRef(null);

  const scheduleTimerNotification = useCallback(async (secondsRemaining, currentMode) => {
    // Only schedule if the app is not visible (backgrounded / screen off)
    if (document.visibilityState === 'visible') return;

    // Cancel any existing scheduled notification first
    if (scheduledNotifIdRef.current) {
      cancelScheduled({ notificationId: scheduledNotifIdRef.current }).catch(() => {});
      scheduledNotifIdRef.current = null;
    }
    try {
      const user = await import('@/api/base44Client').then(m => m.base44.auth.me());
      if (!user?.email) return;
      const sendAt = new Date(Date.now() + secondsRemaining * 1000).toISOString();
      const title = currentMode === 'work' ? '🍅 Focus session complete!' : '☕ Break time over!';
      const body = currentMode === 'work' ? 'Great work! Time for a break.' : 'Ready to focus again?';
      const result = await schedulePush({
        toUserExternalId: user.email,
        title,
        body,
        sendAtISO: sendAt,
      });
      if (result?.data?.notificationId) {
        scheduledNotifIdRef.current = result.data.notificationId;
      }
    } catch (e) {
      // Silently fail — in-app sound still works
    }
  }, []);

  const cancelTimerNotification = useCallback(() => {
    if (scheduledNotifIdRef.current) {
      cancelScheduled({ notificationId: scheduledNotifIdRef.current }).catch(() => {});
      scheduledNotifIdRef.current = null;
    }
  }, []);

  const completionSounds = {
    joyful_melody: { name: "Joyful Melody", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Joyful%20Melody.wav" },
    piano_melody: { name: "Piano Melody", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Piano%20Melody.mp3" },
    short_notification: { name: "Short Notification", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Short%20Notification.wav" },
    short_piano: { name: "Short Piano Notification", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Short%20Piano%20Notification.mp3" },
    applause: { name: "Applause", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/Applause.wav" },
    jr_station: { name: "JR Station Notification", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification.mp3" },
    jr_station_3: { name: "JR Station Notification 3", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification%203.mp3" },
    jr_osaka_loop: { name: "JR Osaka Loop", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Osaka%20Loop%204.mp3" },
    jr_morning_tranquility: { name: "JR Morning Tranquility", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Morning%20Tranquility.mp3" },
    jr_flower_shop: { name: "JR Flower Shop", url: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/JR%20Flower%20Shop.mp3" },
  };

  const breakEndSound = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/Notifications/TX6WF5K-reveal-asia.mp3";

  const playCompletionSound = useCallback((isBreakEnd = false) => {
    const audio = audioRef.current || new Audio();
    audio.src = isBreakEnd ? breakEndSound : completionSounds[completionSound]?.url;
    audio.play().catch(() => {});
  }, [completionSound]);

  const handleTimerComplete = useCallback((currentMode, currentSessionCount) => {
    // Cancel the scheduled notification since we completed in-app
    cancelTimerNotification();
    if (currentMode === 'work') {
      playCompletionSound(false);
      const newSessionCount = currentSessionCount + 1;
      setSessionCount(newSessionCount);
      setMode('break');
      setTimeLeft(breakDuration * 60);
      setTimeout(() => {
        setIsActive(true);
        scheduleTimerNotification(breakDuration * 60, 'break');
      }, 1000);
    } else {
      playCompletionSound(true);
      setMode('work');
      setTimeLeft(workDuration * 60);
      setTimeout(() => {
        setIsActive(true);
        scheduleTimerNotification(workDuration * 60, 'work');
      }, 1000);
    }
  }, [playCompletionSound, breakDuration, workDuration, cancelTimerNotification]);

  // Schedule notification when app goes to background, cancel when it comes back
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isActive && timeLeft > 0) {
        // App backgrounded — schedule the fallback notification
        scheduleTimerNotification(timeLeft, mode);
      } else if (document.visibilityState === 'visible') {
        // App foregrounded — cancel it, in-app timer will handle completion
        cancelTimerNotification();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, timeLeft, mode, scheduleTimerNotification, cancelTimerNotification]);

  // Persist state whenever it changes
  useEffect(() => {
    saveState({ workDuration, breakDuration, timeLeft, isActive, mode, sessionCount, completionSound, selectedPlaylist });
  }, [workDuration, breakDuration, timeLeft, isActive, mode, sessionCount, completionSound, selectedPlaylist]);

  // Timer tick
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isActive]);

  // Handle completion when timeLeft hits 0
  useEffect(() => {
    if (timeLeft === 0 && !isActive) return;
    if (timeLeft === 0) {
      setIsActive(false);
      handleTimerComplete(mode, sessionCount);
    }
  }, [timeLeft]);

  const toggleTimer = useCallback(() => {
    setIsActive(prev => {
      const nowActive = !prev;
      if (nowActive) {
        // Starting/resuming — schedule a notification
        setTimeLeft(tl => {
          scheduleTimerNotification(tl, mode);
          return tl;
        });
      } else {
        // Pausing — cancel the notification
        cancelTimerNotification();
      }
      return nowActive;
    });
  }, [scheduleTimerNotification, cancelTimerNotification, mode]);

  const resetTimer = useCallback(() => {
    cancelTimerNotification();
    setIsActive(false);
    setMode('work');
    setTimeLeft(workDuration * 60);
    setSessionCount(0);
  }, [cancelTimerNotification, workDuration]);

  const handleWorkDurationChange = (value) => {
    const duration = parseInt(value, 10);
    setWorkDuration(duration);
    if (mode === 'work' && !isActive) setTimeLeft(duration * 60);
  };

  const handleBreakDurationChange = (value) => {
    const duration = parseInt(value, 10);
    setBreakDuration(duration);
    if (mode === 'break' && !isActive) setTimeLeft(duration * 60);
  };

  return (
    <PomodoroContext.Provider value={{
      workDuration, breakDuration, timeLeft, isActive, mode, sessionCount,
      completionSound, setCompletionSound, selectedPlaylist, setSelectedPlaylist,
      completionSounds, toggleTimer, resetTimer,
      handleWorkDurationChange, handleBreakDurationChange,
      scheduleTimerNotification, cancelTimerNotification,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro must be used within PomodoroProvider');
  return ctx;
}