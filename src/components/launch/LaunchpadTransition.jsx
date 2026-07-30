import React, { useState, useEffect, useRef } from 'react';
import { Rocket, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ConfirmDialog from '@/components/launch/ConfirmDialog';
import { overlayClasses } from '@/components/utils/launchTheme';

const TOTAL_MS = 5 * 60 * 1000;

export default function LaunchpadTransition({ session, onComplete, onCancel, onWarn, onMinimize, theme, specialMode }) {
  const o = overlayClasses(theme, specialMode);
  const endTime = new Date(session.endTimeISO).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endTime - Date.now()));
  const warnedRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, endTime - Date.now());
      setRemaining(r);
      if (r <= 60000 && r > 0 && !warnedRef.current) {
        warnedRef.current = true;
        onWarn?.();
      }
      if (r <= 0) {
        clearInterval(id);
        onComplete?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endTime]);

  const totalSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const progress = ((TOTAL_MS - remaining) / TOTAL_MS) * 100;
  const R = 90;
  const C = 2 * Math.PI * R;
  const isWarning = remaining <= 60000 && remaining > 0;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-6 ${o.bg} ${o.text}`}>
      <button
        onClick={() => onMinimize?.()}
        className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Minimize"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-sm text-center">
        <motion.div
          animate={isWarning ? { scale: [1, 1.12, 1] } : { y: [0, -8, 0] }}
          transition={isWarning ? { duration: 0.6, repeat: Infinity } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className={`mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/30 ${o.accent}`}
        >
          <Rocket className="w-10 h-10" />
        </motion.div>

        <h2 className="text-2xl font-bold mb-1">The Launchpad</h2>
        <p className={`text-lg font-semibold mb-4 ${o.title}`}>{session.title}</p>

        <p className={`text-sm leading-relaxed mb-8 ${o.muted}`}>
          You have 5 minutes to finish what you're doing, put down your phone, grab a glass of water, and sit at your desk.
        </p>

        <div className="relative mx-auto w-56 h-56 mb-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={R} stroke={o.ringTrack} strokeWidth="12" fill="none" />
            <circle
              cx="100" cy="100" r={R}
              stroke={isWarning ? o.ringWarn : o.ring}
              strokeWidth="12" fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress / 100)}
              style={{ transition: 'stroke-dashoffset 0.3s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-5xl font-bold tabular-nums ${isWarning ? o.warnText : o.text}`}>
              {mm}:{ss}
            </div>
            <div className={`text-xs uppercase tracking-wider mt-1 ${o.muted}`}>
              {isWarning ? 'heads up 👋' : 'until liftoff'}
            </div>
          </div>
        </div>

        <p className={`text-xs leading-relaxed mb-4 ${o.muted}`}>
          When the clock hits zero, we'll start a focus session for you automatically. No pressure — you showed up, and that's everything.
        </p>

        <button
          onClick={() => setConfirming(true)}
          className={`text-xs opacity-70 hover:opacity-100 transition-opacity ${o.muted}`}
        >
          Cancel launchpad
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Cancel the launchpad?"
        description="We'll stop the countdown. You can start another anytime — no guilt. 💚"
        confirmLabel="Yes, cancel"
        onConfirm={() => { setConfirming(false); onCancel?.(); }}
        onClose={() => setConfirming(false)}
        theme={theme}
        specialMode={specialMode}
      />
    </div>
  );
}