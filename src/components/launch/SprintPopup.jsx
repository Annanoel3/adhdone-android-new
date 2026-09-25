import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Timer, PartyPopper } from 'lucide-react';
import { motion } from 'framer-motion';
import KeepAppOpenNote from '@/components/shared/KeepAppOpenNote';
import { speak } from '@/components/utils/speak';
import { timerAlarmsSupported } from '@/components/utils/widgetBridge';
import {
  surfaceClasses,
  mutedText,
  subtleText,
  primaryButton,
  outlineButton,
  isSeasonal,
} from '@/components/utils/launchTheme';

const minutesWord = (n) => (n === 1 ? '1 minute' : `${n} minutes`);
// A session's length (ones saved before the timer had a choice were 5 minutes).
const sessionDurationMs = (s) => (s && s.durationMs > 0 ? s.durationMs : 5 * 60 * 1000);

// The task timer on screen. It counts DOWN, with a ring that empties as time
// passes: for ADHD, the usual advice is a visual timer that shows how much time
// is left (the "Time Timer" idea), because time you can see is easier to track
// than time you have to sense. "I finished the task" (checks it off) and "Stop
// working" (it stays open) are there the whole time. When it's up: "Keep
// going" (Focus Mode on the task) or the same two, and a small counter keeps
// adding the time spent past the end, so none of it goes uncounted.
export default function SprintPopup({ session, ended, onComplete, onKeepGoing, onFinish, onStop, onMinimize, theme, specialMode }) {
  const surface = surfaceClasses(theme, specialMode);
  const muted = mutedText(theme, specialMode);
  const subtle = subtleText(theme, specialMode);
  const primary = primaryButton(theme, specialMode);
  const outline = outlineButton(theme, specialMode);
  const trackStroke = theme === 'dark' && !isSeasonal(specialMode) ? '#374151' : '#e5e7eb';

  const totalMs = sessionDurationMs(session);
  const totalMin = Math.round(totalMs / 60000);
  const endTime = new Date(session.endTimeISO).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endTime - Date.now()));
  const [overtime, setOvertime] = useState(() => Math.max(0, Date.now() - endTime));

  useEffect(() => {
    if (ended) return;
    const id = setInterval(() => {
      const r = Math.max(0, endTime - Date.now());
      setRemaining(r);
      if (r <= 0) {
        clearInterval(id);
        onComplete?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endTime, ended]);

  // The clock never actually stops at the end: it keeps counting while the
  // end screen sits there (or while the app is in the background), so any
  // work done in that gap is counted. "Keep going" carries the timer's start
  // into Focus Mode, so the elapsed time there already includes it.
  useEffect(() => {
    if (!ended) return;
    const tick = () => setOvertime(Math.max(0, Date.now() - endTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ended, endTime]);

  // Say it out loud: a quiet chime is easy to miss, and this is the moment to
  // decide whether to keep going.
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(
      () => speak(`Your ${minutesWord(totalMin)} ${totalMin === 1 ? 'is' : 'are'} up. Would you like to keep going?`),
      400
    );
    return () => clearTimeout(t);
  }, [ended, totalMin]);

  const clock = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
  };
  const progress = ((totalMs - remaining) / totalMs) * 100;
  const R = 80;
  const C = 2 * Math.PI * R;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (o) return;
        if (ended) return; // at the end, only the buttons close it
        // Closing it tucks the timer away (it keeps running); the buttons stop it.
        onMinimize?.();
      }}
    >
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] text-center overflow-hidden ${surface}`}>
        {!ended ? (
          <div className="py-4">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
              <Timer className="w-7 h-7 text-white" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">
              {minutesWord(totalMin)} timer
            </div>
            <h2 className="text-xl font-bold mb-4">{session.title}</h2>

            <div className="relative mx-auto w-44 h-44 mb-5">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r={R} stroke={trackStroke} strokeWidth="12" fill="none" />
                <motion.circle
                  cx="100" cy="100" r={R}
                  stroke="#10b981"
                  strokeWidth="12" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  animate={{ strokeDashoffset: C * (progress / 100) }}
                  transition={{ duration: 0.3 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold tabular-nums">{clock(remaining)}</div>
                <div className={`text-[10px] uppercase tracking-wider mt-1 ${subtle}`}>left</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 mb-3">
              <button
                onClick={onFinish}
                className={`w-full rounded-xl text-sm font-semibold py-2.5 transition-colors ${outline}`}
              >
                I finished the task
              </button>
              <button
                onClick={onStop}
                className={`w-full rounded-xl text-sm font-medium py-2.5 transition-colors ${outline}`}
              >
                Stop working
              </button>
            </div>

            {!timerAlarmsSupported() && (
              <KeepAppOpenNote className="mb-1" text="Keep the app open — closing it stops the timer." />
            )}
            <p className={`text-xs ${subtle}`}>
              {timerAlarmsSupported()
                ? "You can close this. It rings when time's up."
                : 'Close this to keep working. It keeps counting.'}
            </p>
          </div>
        ) : (
          <div className="py-6">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg"
            >
              <PartyPopper className="w-8 h-8 text-white" />
            </motion.div>

            <h2 className="text-2xl font-bold mb-2">Time's up! 🎉</h2>

            <div className={`text-sm tabular-nums mb-3 ${subtle}`}>
              {session.title} · {clock(totalMs)} <span className="font-semibold">+ {clock(overtime)}</span>
            </div>

            <p className={`leading-relaxed mb-6 px-2 ${muted}`}>
              Keep going if you're on a roll, or stop here. Either way, you showed up.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={onKeepGoing}
                className={`w-full rounded-xl text-sm font-semibold py-2.5 transition-colors ${primary}`}
              >
                Keep going
              </button>
              <button
                onClick={onFinish}
                className={`w-full rounded-xl text-sm font-semibold py-2.5 transition-colors ${outline}`}
              >
                I finished the task
              </button>
              <button
                onClick={onStop}
                className={`w-full rounded-xl text-sm font-medium py-2.5 transition-colors ${outline}`}
              >
                Stop working
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
