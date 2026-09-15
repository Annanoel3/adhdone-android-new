import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import AdStage from "@/components/ads/AdStage";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT C — It already did the work.
// Hypothesis: showing the intelligence sells harder than showing the result.
// Each line below is a real input the commute alert uses.
const WORK = [
  "Checked live traffic on your route",
  "Checked what time you start",
  "Subtracted the drive, added 10 minutes",
];

const MARKS = [400, 2400, 2900, 3400, 5000, 7200];
const LOOP = 10500;

export default function AdVariantC() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);

  return (
    <AdStage tone="warm">
      <div className="space-y-6">
        {step >= 1 && (
          <AdSmartNotification
            when="Thu 8:24 AM"
            title="🚗 Time to leave for work"
            body="It's about 26 min with traffic right now — leaving now gets you there by 9:00 AM."
          />
        )}

        <div className="space-y-2 pl-1">
          {WORK.map((line, i) => (
            step >= i + 2 && (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="flex items-center gap-2"
              >
                <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
                <span className="text-[13px] font-medium text-gray-700">{line}</span>
              </motion.div>
            )
          ))}
        </div>

        {step >= 5 && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center text-xl font-extrabold text-gray-900 leading-tight pt-1"
          >
            It didn't just remind you.
            <br />
            It thought first.
          </motion.p>
        )}

        {step >= 6 && <AdBrandLockup line="Reminders that do the math for you." />}
      </div>
    </AdStage>
  );
}