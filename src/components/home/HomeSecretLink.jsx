import React, { useState } from "react";

// The seasonal-theme secret ("what's this? 👀"). It lives on Home and moves
// to a different spot each day (Anna, Oct 27 2026: "put the seasonal easter
// egg in better places, like just change its position on the home screen
// every day"). Before this it wandered page to page and sat at the very
// bottom, where a one-minute visit never scrolled; only Tabitha found it, in
// the week it was pinned to the top of Today's Focus. Today's spot comes from
// the date, so it stays put all day and moves overnight. Found once, it's
// gone for good (seasonal_unlocked).
export const SECRET_SPOTS = ["focus", "welcome", "tiles", "tip", "bottom"];

export const secretSpotToday = () => {
  const d = new Date();
  const dayIndex = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return SECRET_SPOTS[dayIndex % SECRET_SPOTS.length];
};

const unlocked = () => {
  try { return localStorage.getItem("seasonal_unlocked") === "true"; } catch { return false; }
};

// Mount one per spot on Home; only today's spot shows anything.
export default function HomeSecretLink({ theme, spot, className = "" }) {
  const [gone, setGone] = useState(unlocked);
  if (gone || spot !== secretSpotToday()) return null;
  return (
    <div className={className || "text-center"}>
      <button
        type="button"
        onClick={() => { setGone(true); window.dispatchEvent(new Event("adhd-find-secret")); }}
        className={`text-base opacity-80 hover:opacity-100 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
      >
        what's this? 👀
      </button>
    </div>
  );
}
