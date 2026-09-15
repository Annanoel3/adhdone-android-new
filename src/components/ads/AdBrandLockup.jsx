import React from "react";
import { motion } from "framer-motion";

export default function AdBrandLockup({ line, dark = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="text-center"
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-sm font-extrabold text-white">
          A
        </div>
        <span
          className={`text-base font-extrabold tracking-tight ${
            dark ? "text-white" : "text-gray-900"
          }`}
        >
          ADHDone
        </span>
      </div>
      <p
        className={`text-[15px] font-semibold leading-snug ${
          dark ? "text-gray-300" : "text-gray-700"
        }`}
      >
        {line}
      </p>
    </motion.div>
  );
}