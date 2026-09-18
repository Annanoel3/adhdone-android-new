import React from "react";

// A tiny hidden star that lives in ONE of several spots on the Tasks page.
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
      onClick={() => window.triggerEasterEgg?.('awesome')}
      aria-label="A little something"
      className="text-xs leading-none p-1 select-none"
    >
      ⭐
    </button>
  );
}