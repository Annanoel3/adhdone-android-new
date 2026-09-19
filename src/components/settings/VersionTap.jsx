import React, { useRef } from "react";
import { base44 } from "@/api/base44Client";
import { setChaos, isChaosOn } from "../eastereggs/chaosMode";
import { showEggBadge } from "../eastereggs/eggBadge";

const APP_VERSION = "1.0.0";
const TAPS_NEEDED = 7;

// The version line at the bottom of Settings. Tap it seven times.
export default function VersionTap({ user, theme }) {
  const taps = useRef(0);
  const timer = useRef(null);

  const handleTap = async () => {
    clearTimeout(timer.current);
    taps.current += 1;
    timer.current = setTimeout(() => { taps.current = 0; }, 1500);

    if (taps.current < TAPS_NEEDED) return;
    taps.current = 0;

    const turningOff = isChaosOn(user);
    setChaos(!turningOff);

    // Never leave someone stuck: turning it off also clears the account flag.
    if (turningOff && user?.chaos_mode) {
      base44.auth.updateMe({ chaos_mode: false }).catch(() => {});
    }

    showEggBadge({
      emoji: turningOff ? '😮‍💨' : '🌀',
      title: turningOff ? 'Chaos mode: off.' : 'Chaos mode: engaged.',
      body: turningOff
        ? 'Your eyes thank you.'
        : 'Tap the version seven more times to undo this. It also resets when you close the app.',
    });
  };

  return (
    <p
      onClick={handleTap}
      className={`text-center text-xs mt-6 select-none cursor-default ${
        theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
      }`}
    >
      ADHDone v{APP_VERSION}
    </p>
  );
}