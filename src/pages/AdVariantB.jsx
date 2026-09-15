import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdStage from "@/components/ads/AdStage";
import AdPlainNotification from "@/components/ads/AdPlainNotification";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT B — The Flood.
// Hypothesis: the visual of overwhelm collapsing into calm is the hook.
const FLOOD = [
  { when: "8:00", text: "Reminder: fold the laundry" },
  { when: "8:00", text: "Reminder: call the pharmacy" },
  { when: "8:01", text: "Reminder: pay the electric bill" },
  { when: "8:01", text: "Reminder: reply to Sarah" },
  { when: "8:02", text: "Reminder: fold the laundry" },
  { when: "8:02", text: "Reminder: dentist paperwork" },
  { when: "8:03", text: "Reminder: take out the trash" },
  { when: "8:03", text: "Reminder: pay the electric bill" },
  { when: "8:04", text: "Reminder: fold the laundry" },
  { when: "8:04", text: "Reminder: water the plants" },
];

// Ten cards land fast and stack up, then everything collapses at once.
const MARKS = [300, ...FLOOD.map((_, i) => 500 + i * 260), 3600, 4600, 7000];
const CALM_STEP = FLOOD.length + 2;
const LOOP = 10500;

export default function AdVariantB() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);
  const calm = step >= CALM_STEP;
  const shown = Math.min(Math.max(step - 1, 0), FLOOD.length);

  return (
    <AdStage tone={calm ? "warm" : "dark"}>
      <AnimatePresence mode="wait">
        {!calm ? (
          <motion.div
            key="flood"
            exit={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            transition={{ duration: 0.4 }}
            className="relative"
          >
            {/* Pressure reads as a slow, steady red build — no jitter. */}
            <motion.div
              animate={{ opacity: shown >= 5 ? 0.45 : 0.12 }}
              transition={{ duration: 1.6, ease: "easeOut" }}
              className="pointer-events-none absolute -inset-12 rounded-full bg-red-600/30 blur-3xl"
            />
            <div className="relative space-y-1.5">
              {FLOOD.slice(0, shown).map((n, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: i < shown - 3 ? 0.4 : 1, y: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <AdPlainNotification when={n.when} text={n.text} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="calm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="space-y-6"
          >
            <AdSmartNotification
              title="One thing: pay the electric bill 💡"
              body="Not the whole list. Just this one."
            />
            {step >= CALM_STEP + 1 && (
              <AdBrandLockup line="Everything you have to do. One thing at a time." />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AdStage>
  );
}