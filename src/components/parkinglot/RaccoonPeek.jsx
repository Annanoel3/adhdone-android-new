import React from "react";
import { motion } from "framer-motion";

const RACCOON_URL = "https://media.base44.com/images/public/68dd79726fce6eca73056b9b/84b0d762c_generated_image.png";

// Once the parking lot is genuinely full, someone shows up to rummage through
// it. Peeks over the bottom edge of the screen, looks around, ducks back down.
export default function RaccoonPeek({ count = 0, alwaysOn = false }) {
  if (!alwaysOn && count < 10) return null;

  return (
    <motion.div
      className="fixed left-4 z-40 pointer-events-none"
      style={{ bottom: 0, width: 96 }}
      initial={{ y: 110 }}
      animate={{ y: [110, 10, 10, 6, 10, 110] }}
      transition={{
        duration: 9,
        times: [0, 0.18, 0.4, 0.55, 0.72, 1],
        repeat: Infinity,
        repeatDelay: 14,
        ease: "easeInOut",
      }}
    >
      <motion.img
        src={RACCOON_URL}
        alt=""
        aria-hidden="true"
        className="w-24 h-auto drop-shadow-lg"
        animate={{ rotate: [0, -5, 4, 0] }}
        transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
    </motion.div>
  );
}