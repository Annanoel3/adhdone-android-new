import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdStage from "@/components/ads/AdStage";
import AdPhoneFrame from "@/components/ads/AdPhoneFrame";
import AdPlainNotification from "@/components/ads/AdPlainNotification";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import AdFlash from "@/components/ads/AdFlash";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT A — Before / After, played out on a phone lock screen.
// Hypothesis: seeing your own pain is the hook.
const IGNORED = [
  { when: "3:00 PM", text: "Reminder: refill your prescription" },
  { when: "4:00 PM", text: "Reminder: refill your prescription" },
  { when: "5:00 PM", text: "Reminder: refill your prescription" },
];

const MARKS = [400, 1300, 2200, 3100, 4400, 4900, 7200];
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

      <div className="space-y-5">
        <AnimatePresence mode="wait">
          {!after ? (
            <motion.div
              key="before"
              exit={{ opacity: 0, scale: 0.95, filter: "blur(6px)" }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              {/* Red pressure building behind the phone */}
              <motion.div
                animate={{ opacity: unread >= 2 ? 0.55 : 0.15 }}
                transition={{ duration: 1.4, ease: "easeOut" }}
                className="pointer-events-none absolute -inset-8 rounded-[60px] bg-red-600/40 blur-3xl"
              />

              <AdPhoneFrame dark clock="5:14" date="Sunday, June 8">
                <div className="space-y-1.5">
                  {IGNORED.slice(0, unread).map((n, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: i < unread - 1 ? 0.45 : 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                      <AdPlainNotification when={n.when} text={n.text} />
                    </motion.div>
                  ))}
                </div>
              </AdPhoneFrame>
            </motion.div>
          ) : (
            <motion.div
              key="after"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="relative"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 0.8, scale: 1 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="pointer-events-none absolute -inset-8 rounded-[60px] bg-gradient-to-br from-orange-300/70 to-rose-300/60 blur-3xl"
              />

              <AdPhoneFrame clock="2:15" date="Sunday, June 8">
                <motion.div
                  initial={{ scale: 0.85, y: 16 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                >
                  <AdSmartNotification
                    when="now"
                    title="One thing: call the pharmacy 💊"
                    body="Not the whole list. Just this one."
                    why="One nudge at a time, never a pile-up"
                  />
                </motion.div>
              </AdPhoneFrame>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Caption rail under the phone — carries the story on both halves. */}
        <div className="min-h-[92px] flex flex-col items-center justify-start gap-3">
          <AnimatePresence mode="wait">
            {!after && step >= 4 && (
              <motion.p
                key="pain"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="text-center text-[26px] font-extrabold text-gray-500 leading-tight"
              >
                Still not refilled.
              </motion.p>
            )}
            {after && step >= AFTER_STEP + 1 && (
              <motion.p
                key="payoff"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="text-center text-[26px] font-extrabold leading-[1.1] bg-gradient-to-br from-orange-600 to-rose-600 bg-clip-text text-transparent"
              >
                One that actually
                <br />
                gets you moving.
              </motion.p>
            )}
          </AnimatePresence>

          {step >= AFTER_STEP + 2 && <AdBrandLockup line="Not another checklist app." />}
        </div>
      </div>
    </AdStage>
  );
}