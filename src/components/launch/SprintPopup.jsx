import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Timer, PartyPopper } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmDialog from '@/components/launch/ConfirmDialog';
import KeepAppOpenNote from '@/components/shared/KeepAppOpenNote';
import { speak } from '@/components/utils/speak';
import {
  surfaceClasses,
  mutedText,
  subtleText,
  primaryButton,
  outlineButton,
  isSeasonal,
} from '@/components/utils/launchTheme';

const TOTAL_MS = 5 * 60 * 1000;

export default function SprintPopup({ session, ended, onComplete, onKeepGoing, onStop, onCancel, onMinimize, theme, specialMode }) {
  const surface = surfaceClasses(theme, specialMode);
  const muted = mutedText(theme, specialMode);
  const subtle = subtleText(theme, specialMode);
  const primary = primaryButton(theme, specialMode);
  const outline = outlineButton(theme, specialMode);
  const trackStroke = theme === 'dark' && !isSeasonal(specialMode) ? '#374151' : '#e5e7eb';

  const endTime = new Date(session.endTimeISO).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endTime - Date.now()));
  const [overtime, setOvertime] = useState(() => Math.max(0, Date.now() - endTime));
  const [confirming, setConfirming] = useState(false);

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

  // The clock never actually stops at 5:00 — it keeps counting while the
  // checkpoint sits on screen (or while the app is backgrounded), so whatever
  // the user kept working during that gap is counted, not thrown away. "Keep
  // going" carries the sprint's original start time into Focus Mode, so the
  // elapsed timer there already includes this overtime.
  useEffect(() => {
    if (!ended) return;
    const tick = () => setOvertime(Math.max(0, Date.now() - endTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ended, endTime]);

  // Speak the checkpoint out loud — a quiet chime is easy to miss, and this is
  // the moment the user has to decide whether to keep going.
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(
      () => speak('Your five minutes is up. Would you like to keep going?'),
      400
    );
    return () => clearTimeout(t);
  }, [ended]);

  const totalSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const progress = ((TOTAL_MS - remaining) / TOTAL_MS) * 100;
  const overSec = Math.floor(overtime / 1000);
  const overMM = String(Math.floor(overSec / 60)).padStart(2, '0');
  const overSS = String(overSec % 60).padStart(2, '0');
  const R = 80;
  const C = 2 * Math.PI * R;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (o) return;
        if (ended) return; // after the checkpoint, only the buttons dismiss
        // Closing the dialog minimizes the sprint (keeps it running) — the user
        // must explicitly tap "Cancel sprint" to actually stop it.
        onMinimize?.();
      }}
    >
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] text-center overflow-hidden ${surface}`}>
        {!ended ? (
          <div className="py-4">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
              <Timer className="w-7 h-7 text-white" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">5-Minute Sprint</div>
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
                  animate={{ strokeDashoffset: C * (1 - progress / 100) }}
                  transition={{ duration: 0.3 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold tabular-nums">{mm}:{ss}</div>
                <div className={`text-[10px] uppercase tracking-wider mt-1 ${subtle}`}>left</div>
              </div>
            </div>

            <p className={`text-sm leading-relaxed mb-4 ${muted}`}>
              You're doing it! Work until the timer ends — then you can stop if you want. No guilt either way. 💚
            </p>

            <KeepAppOpenNote className="mb-3" text="Keep the app open — closing it stops the timer." />

            <button
              onClick={() => setConfirming(true)}
              className={`text-xs transition-colors ${subtle} hover:opacity-100`}
            >
              Cancel sprint
            </button>
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

            <h2 className="text-2xl font-bold mb-2">5 minutes done! 🎉</h2>

            <div className={`text-sm tabular-nums mb-3 ${subtle}`}>
              Still counting · 5:00 <span className="font-semibold">+ {overMM}:{overSS}</span>
            </div>

            <p className={`leading-relaxed mb-6 px-2 ${muted}`}>
              It's okay to stop if you want — you showed up, and that's the win. Or keep the momentum going. Either way, we're proud of you.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onKeepGoing}
                className={`flex-1 rounded-xl text-sm font-semibold py-2.5 transition-colors ${primary}`}
              >
                Keep going
              </button>
              <button
                onClick={onStop}
                className={`flex-1 rounded-xl text-sm font-medium py-2.5 transition-colors ${outline}`}
              >
                Take the win &amp; stop
              </button>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={confirming}
          title="Cancel the 5-minute sprint?"
          description="You can start another anytime. No guilt either way. 💚"
          confirmLabel="Yes, cancel sprint"
          onConfirm={() => { setConfirming(false); onCancel?.(); }}
          onClose={() => setConfirming(false)}
          theme={theme}
          specialMode={specialMode}
        />
      </DialogContent>
    </Dialog>
  );
}