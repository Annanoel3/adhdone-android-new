import React from "react";
import { motion } from "framer-motion";

// The "every other app" notification: flat, grey, forgettable.
export default function AdPlainNotification({ when, text, app = "Reminders", shake = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -14 }}
      animate={
        shake
          ? { opacity: 1, y: 0, x: [0, -3, 3, -2, 2, 0] }
          : { opacity: 1, y: 0 }
      }
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full rounded-xl bg-[#26262a] px-3 py-2 border border-white/5"
    >
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-4 h-4 rounded-md bg-gray-600" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {app}
        </span>
        <span className="text-[10px] text-gray-600 ml-auto">{when}</span>
      </div>
      <p className="text-[13px] text-gray-400 leading-snug">{text}</p>
    </motion.div>
  );
}