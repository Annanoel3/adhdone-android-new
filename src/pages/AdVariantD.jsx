import React from "react";
import { motion } from "framer-motion";
import AdStage from "@/components/ads/AdStage";
import AdSmartNotification from "@/components/ads/AdSmartNotification";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT D — The Confession.
// Hypothesis: "built by one of us" lands harder than any feature.
const MARKS = [500, 2600, 5200, 7600];
const LOOP = 11000;

export default function AdVariantD() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);

  return (
    <AdStage tone="warm">
      <div className="space-y-7">
        {step >= 1 && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-[22px] font-extrabold text-gray-900 leading-tight text-center"
          >
            I built this because a reminder at 3pm
            <br />
            never once made me mail that package.
          </motion.p>
        )}

        {step >= 2 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="text-[15px] text-gray-600 text-center"
          >
            So I made the reminder smarter instead.
          </motion.p>
        )}

        {step >= 3 && (
          <AdSmartNotification
            title="One thing: mail the package 📦"
            body="Not the whole list. Just this one."
          />
        )}

        {step >= 4 && (
          <AdBrandLockup line="Not another checklist app. Built by someone with ADHD." />
        )}
      </div>
    </AdStage>
  );
}