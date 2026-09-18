import React from "react";

// A tiny hidden easter-egg trigger that lives in ONE of several spots on a page.
// Which spot it picks rotates every week, so finding it is a little game.
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
      onClick={() => window.triggerEasterEgg?.(type)}
      aria-label="A little something"
      className="text-xs leading-none p-1 select-none"
    >
      {emoji}
    </button>
  );
}