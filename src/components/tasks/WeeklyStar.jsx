import React from "react";
import { trackFire } from "@/lib/appTrack";

// A hidden star that lives in ONE of several spots on the Tasks page. It was
// text-xs and nobody saw it (Anna, Sep 30 2026): now 18px (text-lg).
// Which spot it picks rotates every week, so it's a little "find me" game.
// Tapping it fires the celebration GIF easter egg.
const SLOT_COUNT = 4;

function currentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7));
}

export default function WeeklyStar({ slot }) {
  if (currentWeek() % SLOT_COUNT !== slot) return null;

  return (
    <button
      type="button"
      onClick={() => {
        trackFire('easter_egg_found', { props: { egg: '⭐ (My Tasks star)', slot } });
        window.triggerEasterEgg?.('awesome');
      }}
      aria-label="A little something"
      className="text-lg leading-none p-1 select-none"
    >
      ⭐
    </button>
  );
}