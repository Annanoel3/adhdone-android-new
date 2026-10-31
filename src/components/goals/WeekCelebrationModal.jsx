import React, { useEffect } from "react";
import { X } from "lucide-react";

// Week 1–3 of a month finished on the goal page (ported from the Goals app's
// WeekCelebrationModal). The Goals app looked up a random GIF for it through
// Base44's InvokeLLM, which ADHDone never uses, so this shows the card the
// Goals app showed when no GIF came back. Closes itself after 5 seconds.
// It opens on its own, so the goal page shows it only on its popup turn
// (usePopupTurn).
export default function WeekCelebrationModal({ weekNumber, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!weekNumber) return null;

  return (
    <div
      role="dialog"
      data-state="open"
      aria-label={`Week ${weekNumber} done`}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ position: "relative", maxWidth: "600px", width: "90%", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "40px", textAlign: "center" }}>
          <p style={{ fontSize: "1.3rem", fontWeight: "700", color: "#fff", margin: 0 }}>🎉 Week {weekNumber} Crushed! 🎉</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 10, right: 10, zIndex: 10001,
            background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
            width: 30, height: 30, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", color: "white",
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
