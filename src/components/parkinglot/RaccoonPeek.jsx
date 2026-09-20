import React from "react";
import { motion } from "framer-motion";

const CREW_URL = "https://media.base44.com/images/public/68dd79726fce6eca73056b9b/3f3f9d038_HappyHomeStickerbyNETFLIX.gif";

// Once the parking lot is genuinely full (10+ ideas), two people pop up at the
// edge of the screen, take one look at the pile, and decide it's a system.
// Solidarity, not a comment on the size of the pile. The GIF carries its own
// "It's a system!" line, so nothing is drawn above it.
//
// The slide is measured in the element's own height ("100%"), so the crew is
// fully below the screen edge between appearances no matter how tall the GIF
// renders. A fixed pixel offset left the top of it showing at the bottom.
export default function RaccoonPeek({ count = 0 }) {
  if (count < 10) return null;

  return (
    <motion.div
      className="fixed left-4 z-40 pointer-events-none flex flex-col items-center"
      style={{ bottom: -12, width: 132 }}
      initial={{ y: "100%" }}
      animate={{ y: ["100%", "0%", "0%", "0%", "100%"] }}
      transition={{
        duration: 10,
        times: [0, 0.16, 0.5, 0.8, 1],
        repeat: Infinity,
        repeatDelay: 16,
        ease: "easeInOut",
      }}
    >
      <img
        src={CREW_URL}
        alt=""
        aria-hidden="true"
        className="w-32 h-auto drop-shadow-lg"
      />
    </motion.div>
  );
}
