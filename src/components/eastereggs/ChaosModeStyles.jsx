import React, { useState, useEffect } from "react";
import { isChaosOn, isSessionOverrideOff } from "./chaosMode";

// Injects the chaos-mode stylesheet. Static only — no animation, no flashing.
export default function ChaosModeStyles({ user }) {
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    window.addEventListener('chaos-mode-changed', rerender);
    return () => window.removeEventListener('chaos-mode-changed', rerender);
  }, []);

  // An explicit session "off" always wins, so the tap-out works even when the
  // profile flag is set.
  const active = isSessionOverrideOff() ? false : isChaosOn(user);
  if (!active) return null;

  return (
    <style>{`
      html body {
        background: repeating-linear-gradient(45deg, #00e5a0 0 44px, #ff2ec4 44px 88px) !important;
        font-family: "Comic Sans MS", "Chalkboard SE", cursive !important;
      }
      body * {
        font-family: "Comic Sans MS", "Chalkboard SE", cursive !important;
        letter-spacing: 0.04em !important;
        color: #14121a !important;
      }
      body h1, body h2, body h3 {
        color: #b1009c !important;
        text-shadow: 3px 3px 0 #fff200, -2px -2px 0 #00e5ff !important;
        text-transform: uppercase !important;
      }
      [class*="shadow-lg"], [class*="shadow-md"], [class*="shadow-xl"] {
        background: #fff200 !important;
        border: 6px dashed #ff2ec4 !important;
        border-radius: 34px 6px 34px 6px !important;
        transform: rotate(-1.2deg) !important;
        box-shadow: 10px 10px 0 #00e5ff !important;
      }
      [class*="shadow-lg"]:nth-child(even), [class*="shadow-md"]:nth-child(even) {
        transform: rotate(1.4deg) !important;
        background: #b9ff2e !important;
      }
      button {
        background: #ff6a00 !important;
        border: 4px solid #6a00ff !important;
        border-radius: 999px 4px 999px 4px !important;
        font-weight: 900 !important;
        text-transform: uppercase !important;
      }
      input, textarea {
        background: #ffd0f2 !important;
        border: 4px dotted #00a2ff !important;
      }
      /* Popups keep the loud skin but must stay centered and on-screen: the
         rotate + fat dashed border above pushed dialogs off the right edge. */
      [role="dialog"], [role="alertdialog"] {
        transform: translate(-50%, -50%) !important;
        border-width: 4px !important;
        border-radius: 24px !important;
        max-width: calc(100vw - 1.5rem) !important;
        box-shadow: 6px 6px 0 #00e5ff !important;
      }
      [role="dialog"] *, [role="alertdialog"] * {
        transform: none !important;
      }
      aside, [data-sidebar] {
        background: repeating-linear-gradient(90deg, #ffb300 0 20px, #ff2ec4 20px 40px) !important;
      }
    `}</style>
  );
}