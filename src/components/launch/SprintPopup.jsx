import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Timer, PartyPopper } from 'lucide-react';
import { motion } from 'framer-motion';

const TOTAL_MS = 5 * 60 * 1000;

export default function SprintPopup({ session, ended, onComplete, onKeepGoing, onStop, onCancel, onMinimize }) {
  const endTime = new Date(session.endTimeISO).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endTime - Date.now()));

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

  const totalSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const progress = ((TOTAL_MS - remaining) / TOTAL_MS) * 100;
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
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] text-center overflow-hidden">
        {!ended ? (
          <div className="py-4">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
              <Timer className="w-7 h-7 text-white" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">5-Minute Sprint</div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">{session.title}</h2>

            <div className="relative mx-auto w-44 h-44 mb-5">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r={R} stroke="#e5e7eb" strokeWidth="12" fill="none" />
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
                <div className="text-4xl font-bold tabular-nums text-gray-900">{mm}:{ss}</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">left</div>
              </div>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              You're doing it! Work until the timer ends — then you can stop if you want. No guilt either way. 💚
            </p>

            <button
              onClick={() => { if (window.confirm('Cancel the 5-minute sprint?')) onCancel?.(); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
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

            <h2 className="text-2xl font-bold text-gray-900 mb-2">5 minutes done! 🎉</h2>
            <p className="text-gray-600 leading-relaxed mb-6 px-2">
              It's okay to stop if you want — you showed up, and that's the win. Or keep the momentum going. Either way, we're proud of you.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={onKeepGoing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Keep going
              </Button>
              <Button
                variant="outline"
                onClick={onStop}
                className="flex-1"
              >
                Take the win &amp; stop
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}