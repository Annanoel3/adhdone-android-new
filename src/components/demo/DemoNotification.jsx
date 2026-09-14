import React from "react";
import { motion } from "framer-motion";

export default function DemoNotification({ item, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full rounded-3xl bg-white/95 shadow-[0_8px_30px_rgba(0,0,0,0.12)] px-4 py-3.5 backdrop-blur"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-[11px] font-bold text-white">
          A
        </div>
        <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
          ADHDone
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">{item.when}</span>
      </div>
      <p className="text-[15px] font-bold text-gray-900 leading-snug">{item.title}</p>
      <p className="text-[14px] text-gray-600 leading-snug mt-0.5">{item.body}</p>
      {item.why && (
        <p className="text-[11px] font-semibold text-orange-600 mt-2 uppercase tracking-wide">
          {item.why}
        </p>
      )}
    </motion.div>
  );
}