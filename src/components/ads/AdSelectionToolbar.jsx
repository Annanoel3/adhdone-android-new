import React from "react";
import { motion } from "framer-motion";
import { Pin, Copy, Share2 } from "lucide-react";

// Android's text-selection pill (pin / copy / share) with the share button lit
// up and a hand tapping it — the exact moment the capture starts.
export default function AdSelectionToolbar() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="absolute -bottom-9 left-1/2 -translate-x-1/2 z-30"
    >
      <div className="flex items-center rounded-full bg-[#2c2c2f] px-1.5 py-1 shadow-[0_8px_22px_rgba(0,0,0,0.35)]">
        <span className="w-7 h-7 rounded-full flex items-center justify-center">
          <Pin className="w-3.5 h-3.5 text-white" />
        </span>
        <span className="w-7 h-7 rounded-full flex items-center justify-center">
          <Copy className="w-3.5 h-3.5 text-white" />
        </span>
        <span className="w-7 h-7 rounded-full bg-green-600/60 flex items-center justify-center">
          <Share2 className="w-3.5 h-3.5 text-white" />
        </span>
      </div>
      <motion.span
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.15 }}
        className="absolute -right-2 top-4 text-[22px]"
      >
        👆
      </motion.span>
    </motion.div>
  );
}