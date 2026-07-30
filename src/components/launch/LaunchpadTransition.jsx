import React, { useState, useEffect, useRef } from 'react';
import { Rocket, X } from 'lucide-react';
import { motion } from 'framer-motion';

const TOTAL_MS = 5 * 60 * 1000;

export default function LaunchpadTransition({ session, onComplete, onCancel, onWarn }) {
  const endTime = new Date(session.endTimeISO).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endTime - Date.now()));
  const warnedRef = useRef(false);

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 text-white">
      <button
        onClick={onCancel}
        className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Cancel launch"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-sm text-center">
        <motion.div
          animate={isWarning ? { scale: [1, 1.12, 1] } : { y: [0, -8, 0] }}
          transition={isWarning ? { duration: 0.6, repeat: Infinity } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto mb-5 w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center shadow-2xl shadow-orange-500/30"
        >
          <Rocket className="w-10 h-10 text-white" />
        </motion.div>

        <h2 className="text-2xl font-bold mb-1">The Launchpad</h2>
        <p className="text-lg font-semibold text-orange-300 mb-4">{session.title}</p>

        <p className="text-sm text-indigo-100/80 leading-relaxed mb-8">
          You have 5 minutes to finish what you're doing, put down your phone, grab a glass of water, and sit at your desk.
        </p>

        <div className="relative mx-auto w-56 h-56 mb-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r={R} stroke="rgba(255,255,255,0.12)" strokeWidth="12" fill="none" />
            <circle
              cx="100" cy="100" r={R}
              stroke={isWarning ? '#fbbf24' : '#a78bfa'}
              strokeWidth="12" fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress / 100)}
              style={{ transition: 'stroke-dashoffset 0.3s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-5xl font-bold tabular-nums ${isWarning ? 'text-amber-300' : 'text-white'}`}>
              {mm}:{ss}
            </div>
            <div className="text-xs uppercase tracking-wider text-indigo-200/60 mt-1">
              {isWarning ? 'heads up 👋' : 'until liftoff'}
            </div>
          </div>
        </div>

        <p className="text-xs text-indigo-200/70 leading-relaxed">
          When the clock hits zero, we'll start a focus session for you automatically. No pressure — you showed up, and that's everything.
        </p>
      </div>
    </div>
  );
}