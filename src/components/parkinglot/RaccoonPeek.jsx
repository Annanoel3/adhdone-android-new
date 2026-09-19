import React from "react";
import { motion } from "framer-motion";

const CREW_URL = "https://media.base44.com/images/public/68dd79726fce6eca73056b9b/3f3f9d038_HappyHomeStickerbyNETFLIX.gif";

// Once the parking lot is genuinely full, two people pop up at the edge of the
// screen, take one look at the pile, and decide it's a system. Solidarity, not
// a comment on the size of the pile.
export default function RaccoonPeek({ count = 0, alwaysOn = false }) {
  if (!alwaysOn && count < 10) return null;

  return (
    <motion.div
      className="fixed left-4 z-40 pointer-events-none flex flex-col items-center"
      style={{ bottom: 0, width: 132 }}
      initial={{ y: 150 }}
      animate={{ y: [150, 12, 12, 12, 150] }}
      transition={{
        duration: 10,
        times: [0, 0.16, 0.5, 0.8, 1],
        repeat: Infinity,
        repeatDelay: 16,
        ease: "easeInOut",
      }}
    >
      <div className="mb-1 rounded-2xl bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 shadow-lg whitespace-nowrap">
        It's a system!
      </div>
      <img
        src={CREW_URL}
        alt=""
        aria-hidden="true"
        className="w-32 h-auto drop-shadow-lg"
      />
    </motion.div>
  );
}