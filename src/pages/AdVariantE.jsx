import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdStage from "@/components/ads/AdStage";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT E — Day-in-the-life speed run.
// Hypothesis: breadth and rhythm beat depth and emotion.
// One card at a time, ~2s each, no reading required.
const DAY = [
  {
    when: "7:20 AM",
    title: "🚧 Traffic is worse than usual",
    body: "Leaving by 8:24 keeps you on time.",
  },
  {
    when: "11:40 AM",
    title: "Quiet — you're on shift",
    body: "Nudges hold until you're off.",
  },
  {
    when: "2:15 PM",
    title: "One thing: fold the laundry 🧺",
    body: "Not the whole list. Just this one.",
  },
  {
    when: "6:00 PM",
    title: "Mom's birthday is tomorrow 🎂",
    body: "Her text is already drafted.",
  },
];

const CARD_MS = 1900;
const MARKS = [300, ...DAY.map((_, i) => 300 + (i + 1) * CARD_MS)];
const LOOP = 300 + DAY.length * CARD_MS + 3200;

export default function AdVariantE() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);
  const index = Math.max(step - 1, 0);
  const done = index >= DAY.length;

  return (
    <AdStage tone="warm">
      <div className="space-y-7">
        <div className="min-h-[112px] flex items-center">
          <AnimatePresence mode="wait">
            {step >= 1 && !done && (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="w-full"
              >
                <AdSmartNotification {...DAY[index]} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {done && (
          <>
            <motion.p
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center text-[26px] font-extrabold text-gray-900 leading-tight"
            >
              A whole day, handled.
            </motion.p>
            <AdBrandLockup line="It's with you from the drive in to the text you forgot." />
          </>
        )}
      </div>
    </AdStage>
  );
}