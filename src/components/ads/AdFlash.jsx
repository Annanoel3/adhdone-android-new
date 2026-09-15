import React from "react";
import { motion } from "framer-motion";

// A single hard white flash used to cut between the "before" and "after"
// halves of a spot — hides the tone change and gives the edit a beat.
export default function AdFlash() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 0.5, times: [0, 0.25, 1], ease: "easeOut" }}
      className="pointer-events-none fixed inset-0 bg-white z-50"
    />
  );
}