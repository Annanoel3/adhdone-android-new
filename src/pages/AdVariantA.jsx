import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdStage from "@/components/ads/AdStage";
import AdPlainNotification from "@/components/ads/AdPlainNotification";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import AdUnreadBadge from "@/components/ads/AdUnreadBadge";
import AdFlash from "@/components/ads/AdFlash";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT A — Before / After.
// Hypothesis: seeing your own pain is the hook.
const IGNORED = [
  { when: "3:00 PM", text: "Reminder: fold the laundry" },
  { when: "4:00 PM", text: "Reminder: fold the laundry" },
  { when: "5:00 PM", text: "Reminder: fold the laundry" },
];

const MARKS = [400, 1400, 2300, 3200, 4600, 5100, 7300];
const AFTER_STEP = 5;
const LOOP = 11000;

export default function AdVariantA() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);
  const after = step >= AFTER_STEP;
  const unread = Math.min(Math.max(step - 1, 0), IGNORED.length);

  return (
    <AdStage tone={after ? "warm" : "dark"}>
      {step === AFTER_STEP - 1 && <AdFlash />}

      <AnimatePresence mode="wait">
        {!after ? (
          <motion.div
            key="before"
            exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            {/* Red pressure building behind the stack */}
            <motion.div
              animate={{ opacity: unread >= 2 ? 0.5 : 0.18, scale: [1, 1.06, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -inset-16 rounded-full bg-red-600/30 blur-3xl"
            />

            <div className="relative space-y-4">
              <AdUnreadBadge count={unread} />

              <div className="space-y-2">
                {IGNORED.slice(0, unread).map((n, i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: i < unread - 1 ? 0.45 : 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AdPlainNotification when={n.when} text={n.text} />
                  </motion.div>
                ))}
              </div>

              {step >= 4 && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="pt-2 text-center text-[26px] font-extrabold text-gray-400 leading-tight"
                >
                  Still not folded.
                </motion.p>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="after"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="relative space-y-7"
          >
            {/* Warm bloom behind the one good notification */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.75, scale: 1 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="pointer-events-none absolute -inset-12 rounded-full bg-gradient-to-br from-orange-300/60 to-rose-300/50 blur-3xl"
            />

            <motion.div
              initial={{ scale: 0.82, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="relative"
            >
              <AdSmartNotification
                when="Sun 2:15 PM"
                title="One thing: fold the laundry 🧺"
                body="Not the whole list. Just this one."
                why="One nudge at a time, never a pile-up"
              />
            </motion.div>

            {step >= AFTER_STEP + 1 && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative text-center text-[27px] font-extrabold leading-[1.1] bg-gradient-to-br from-orange-600 to-rose-600 bg-clip-text text-transparent"
              >
                One that actually
                <br />
                gets you moving.
              </motion.p>
            )}

            {step >= AFTER_STEP + 2 && (
              <div className="relative">
                <AdBrandLockup line="Not another checklist app." />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AdStage>
  );
}