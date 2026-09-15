import React from "react";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";

// A muted app icon with a climbing unread count — the visual shorthand for
// "these are stacking up and nothing is happening."
export default function AdUnreadBadge({ count }) {
  return (
    <div className="relative w-14 h-14 mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-[#2a2a2e] border border-white/5 flex items-center justify-center">
        <Bell className="w-6 h-6 text-gray-500" />
      </div>
      {count > 0 && (
        <motion.div
          key={count}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1.35, 1], opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="absolute -top-1.5 -right-1.5 min-w-[24px] h-6 px-1.5 rounded-full bg-red-500 flex items-center justify-center text-[13px] font-extrabold text-white shadow-[0_0_18px_rgba(239,68,68,0.7)]"
        >
          {count}
        </motion.div>
      )}
    </div>
  );
}