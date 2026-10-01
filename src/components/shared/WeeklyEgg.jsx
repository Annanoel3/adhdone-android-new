import React from "react";
import { trackFire } from "@/lib/appTrack";

// A hidden easter-egg trigger that lives in ONE of several spots on a page.
// Which spot it picks rotates every week, so finding it is a little game. It
// was text-xs and nobody saw it (Anna, Sep 30 2026): now a full-size emoji.
const SLOT_COUNT = 4;

function currentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7));
}

export default function WeeklyEgg({ slot, type = "ideas", emoji = "💡" }) {
  if (currentWeek() % SLOT_COUNT !== slot) return null;

  return (
    <button
      type="button"
      onClick={() => {
        trackFire('easter_egg_found', { props: { egg: `${emoji} (${type} GIF)`, slot } });
        window.triggerEasterEgg?.(type);
      }}
      aria-label="A little something"
      className="text-2xl leading-none p-1 select-none"
    >
      {emoji}
    </button>
  );
}