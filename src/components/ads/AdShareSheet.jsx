import React from "react";
import { motion } from "framer-motion";

const APPS = [
  { label: "Quick\nShare", bg: "bg-blue-500", char: "⇪" },
  { label: "ADHDone", bg: "bg-gradient-to-br from-orange-300 to-rose-300", char: "✅", highlight: true },
  { label: "Gmail", bg: "bg-red-500", char: "✉" },
  { label: "Messenger", bg: "bg-sky-500", char: "💬" },
];

// The Android "Sharing text" sheet, with ADHDone as the tapped target.
export default function AdShareSheet({ snippet }) {
  return (
    <motion.div
      initial={{ y: 140, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-[#1c1c1e] px-4 pt-3 pb-4 z-20"
    >
      <p className="text-white text-[12px] font-semibold mb-2">Sharing text</p>
      <div className="rounded-lg bg-white/10 px-2.5 py-2 mb-3">
        <p className="text-white/70 text-[10px] leading-snug line-clamp-2">{snippet}</p>
      </div>
      <div className="flex items-start justify-between">
        {APPS.map((a) => (
          <div key={a.label} className="relative flex flex-col items-center gap-1 w-14">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[15px] ${a.bg}`}>
              {a.char}
            </div>
            <span className="text-white/70 text-[8px] text-center leading-tight whitespace-pre-line">
              {a.label}
            </span>
            {a.highlight && (
              <>
                <motion.span
                  initial={{ scale: 0.4, opacity: 0.8 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
                  className="absolute top-0 w-10 h-10 rounded-full bg-white/60"
                />
                <motion.span
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.3 }}
                  className="absolute -bottom-1 left-7 text-[20px]"
                >
                  👆
                </motion.span>
              </>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}