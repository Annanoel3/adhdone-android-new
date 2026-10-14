import React, { useState } from "react";

// The seasonal-theme secret, pinned to the top of Today's Focus until this
// date (local); after it, the secret goes back to wandering (Layout.jsx).
export const SECRET_ON_HOME_UNTIL = new Date(2026, 9, 16);
export const secretPinnedToHome = () => Date.now() < SECRET_ON_HOME_UNTIL.getTime();

export default function HomeSecretLink({ theme }) {
  const [gone, setGone] = useState(() => localStorage.getItem("seasonal_unlocked") === "true");
  if (gone || !secretPinnedToHome()) return null;
  return (
    <div className="text-center">
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