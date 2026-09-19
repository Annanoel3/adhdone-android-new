import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// One shared card for every hidden badge / easter-egg reveal. Slides up from the
// bottom, stays out of the way, auto-dismisses. Deliberately no flashing.
export default function EggBadge() {
  const [badge, setBadge] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      setBadge(e.detail);
      const t = setTimeout(() => setBadge(null), 7000);
      return () => clearTimeout(t);
    };
    window.addEventListener('egg-badge', handler);
    return () => window.removeEventListener('egg-badge', handler);
  }, []);

  useEffect(() => {
    if (!badge) return;
    const t = setTimeout(() => setBadge(null), 7000);
    return () => clearTimeout(t);
  }, [badge]);

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed left-4 right-4 z-[100] mx-auto max-w-sm"
          style={{ bottom: 'max(6rem, calc(5rem + env(safe-area-inset-bottom)))' }}
        >
          <div className="relative rounded-2xl bg-gray-900 text-white shadow-2xl px-5 py-4 flex items-start gap-3">
            <span className="text-3xl leading-none">{badge.emoji}</span>
            <div className="flex-1 min-w-0 pr-4">
              <p className="font-bold">{badge.title}</p>
              {badge.body && (
                <p className="text-sm text-gray-300 mt-0.5">{badge.body}</p>
              )}
            </div>
            <button
              onClick={() => setBadge(null)}
              aria-label="Dismiss"
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}