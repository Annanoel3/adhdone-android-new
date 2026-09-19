import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdReelFrame from "@/components/ads/AdReelFrame";
import AdMessagesPhone from "@/components/ads/AdMessagesPhone";
import AdCapturedTasks from "@/components/ads/AdCapturedTasks";
import AdBrandLockup from "@/components/ads/AdBrandLockup";
import { useAdLoop, useAdSteps } from "@/components/ads/useAdLoop";

// VARIANT F — Three texts, three shares, three tasks.
// Built for a reel: the top and bottom strips of the canvas stay empty so a
// platform's own username/caption text can't land on anything that matters, and
// every band has a fixed height so no copy appearing ever pushes the phone.

const THREADS = [
  {
    sender: "Sarah",
    clock: "4:08 PM",
    messages: [
      { from: "them", text: "Hey! Don't forget Jamie's birthday party this Saturday. Can you pick me up at 4?" },
    ],
  },
  {
    sender: "Mom",
    clock: "4:11 PM",
    messages: [
      { from: "them", text: "Hi sweetie, can you please grab some wine on the way home today" },
    ],
  },
  {
    sender: "Ryan 💛",
    clock: "4:14 PM",
    messages: [
      { from: "them", text: "Hey babe, can we go to that sushi place tomorrow for dinner?" },
    ],
  },
];

const TASKS = [
  { title: "Pick up Sarah, then Jamie's birthday party", when: "Saturday 4:00 PM", tag: "event", from: "Sarah" },
  { title: "Grab wine on the way home", when: "Today", tag: "errand", from: "Mom" },
  { title: "Sushi dinner with Ryan", when: "Tomorrow", tag: "event", from: "Ryan 💛" },
];

// Noise that shows up while you're trying to remember three things at once.
const NOISE = [
  "Instagram · 4 new likes on your story",
  "Weather · Rain starting in 20 min",
];

// 1 msg1 · 2 select1 · 3 sheet1 · 4 msg2 · 5 select2 · 6 sheet2
// 7 msg3 · 8 select3 · 9 sheet3 · 10 app+task1 · 11 task2 · 12 task3 · 13 payoff · 14 brand
const MARKS = [500, 2000, 2900, 4100, 5500, 6400, 7600, 9000, 9900, 11100, 11700, 12300, 13400, 15000];
const LOOP = 19000;

export default function AdVariantF() {
  const runId = useAdLoop(LOOP);
  const step = useAdSteps(MARKS, runId);

  // Which thread is on screen, and where we are inside it.
  const threadIndex = step >= 7 ? 2 : step >= 4 ? 1 : 0;
  const threadStart = [1, 4, 7][threadIndex];
  const showThread = step >= 1 && step < 10;
  const highlight = step >= threadStart + 1;
  const showSheet = step >= threadStart + 2;

  // Junk notifications drift in over the first two threads, then clear out.
  const banners = step >= 10 ? [] : NOISE.slice(0, Math.max(0, Math.min(2, step - 2)));

  const headline = (
    <AnimatePresence mode="wait">
      {step < 10 ? (
        <motion.p
          key="setup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="text-[21px] font-extrabold text-gray-900 leading-tight"
        >
          Three people.
          <br />
          Three things to remember.
        </motion.p>
      ) : (
        <motion.p
          key="payoff"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="text-[21px] font-extrabold text-gray-900 leading-tight"
        >
          All three. Already waiting.
        </motion.p>
      )}
    </AnimatePresence>
  );

  const phone = showThread ? (
    <AdMessagesPhone
      sender={THREADS[threadIndex].sender}
      clock={THREADS[threadIndex].clock}
      messages={THREADS[threadIndex].messages}
      highlight={highlight}
      showSheet={showSheet}
      banners={banners}
    />
  ) : step >= 10 ? (
    <AdCapturedTasks tasks={TASKS} visibleCount={step - 9} />
  ) : (
    <div style={{ width: 'min(86vw, 30vh, 420px)' }} className="aspect-[9/19]" />
  );

  const caption = (
    <div className="w-full">
      {step >= 13 && step < 14 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-[17px] font-extrabold text-gray-900 leading-tight"
        >
          You didn't type a thing.
          <br />
          You just hit share.
        </motion.p>
      )}
      {step >= 14 && <AdBrandLockup line="Highlight any text. Share it. It's a task." />}
    </div>
  );

  return <AdReelFrame headline={headline} phone={phone} caption={caption} />;
}