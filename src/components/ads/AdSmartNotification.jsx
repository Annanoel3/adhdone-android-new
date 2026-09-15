import React from "react";
import { motion } from "framer-motion";

// The ADHDone notification: warm, specific, one thing at a time.
export default function AdSmartNotification({ when, title, body, why, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
      className="w-full rounded-2xl bg-white shadow-[0_10px_34px_rgba(0,0,0,0.14)] px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-[11px] font-bold text-white">
          A
        </div>
        <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
          ADHDone
        </span>
        {when && <span className="text-[11px] text-gray-400 ml-auto">{when}</span>}
      </div>
      <p className="text-[15px] font-bold text-gray-900 leading-snug">{title}</p>
      {body && (
        <p className="text-[13px] text-gray-600 leading-snug mt-0.5">{body}</p>
      )}
      {why && (
        <p className="text-[10px] font-semibold text-orange-600 mt-1.5 uppercase tracking-wide">
          {why}
        </p>
      )}
    </motion.div>
  );
}