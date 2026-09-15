import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdStage from "@/components/ads/AdStage";
import AdPlainNotification from "@/components/ads/AdPlainNotification";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT A — Before / After.
// Hypothesis: seeing your own pain is the hook.
const MARKS = [400, 1500, 2600, 3900, 5400, 7600];
const LOOP = 11000;

export default function AdVariantA() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);
  const after = step >= 5;

  return (
    <AdStage tone={after ? "warm" : "dark"}>
      <AnimatePresence mode="wait">
        {!after ? (
          <motion.div key="before" exit={{ opacity: 0, scale: 0.97 }} className="space-y-2">
            {step >= 1 && <AdPlainNotification when="3:00 PM" text="Reminder: fold the laundry" />}
            {step >= 2 && <AdPlainNotification when="4:00 PM" text="Reminder: fold the laundry" />}
            {step >= 3 && <AdPlainNotification when="5:00 PM" text="Reminder: fold the laundry" />}
            {step >= 4 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
                className="pt-4 text-center text-lg font-bold text-gray-500"
              >
                Still not folded.
              </motion.p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="after"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <AdSmartNotification
              when="Sun 2:15 PM"
              title="One thing: fold the laundry 🧺"
              body="Not the whole list. Just this one."
              why="One nudge at a time, never a pile-up"
            />
            {step >= 6 && (
              <AdBrandLockup line="It's not more reminders. It's better ones." />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AdStage>
  );
}