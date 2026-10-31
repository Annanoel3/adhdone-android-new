import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

// A whole month of the plan finished on the goal page (ported from the Goals
// app's MonthCelebrationModal, same GIFs from Anna's storage): the month's GIF,
// then the steps finished that month two at a time, then "Keep going!". Closes
// itself after about 24 seconds; the X skips it. It opens on its own, so the
// goal page shows it only on its popup turn (usePopupTurn). On a night season
// the closing button is dark glass instead of white.

const BASE = "https://rbxbrfewaxvhvlntxhuv.supabase.co/storage/v1/object/public/Month%20Gifs";

const MONTH_CONFIG = {
  1: { gif: BASE + "/1%20Month%20one.gif", textColor: "#ffffff", textTop: "78%" },
  2: { gif: BASE + "/2%20Month%20two.gif", textColor: "#12027b", textTop: "79%" },
  3: { gif: BASE + "/3%20Month%20three.gif", textColor: "#000000", textTop: "76%" },
  4: { gif: BASE + "/4%20Month%20four.gif", textColor: "#ffffff", textTop: "78%" },
  5: { gif: BASE + "/5%20Month%20five.gif", textColor: "#ffffff", textTop: "79%" },
  6: { gif: BASE + "/6%20Month%20six.gif", textColor: "#ff8200", textTop: "79%" },
  7: { gif: BASE + "/7%20Month%20seven.gif", textColor: "#ffffff", textTop: "80%" },
  8: { gif: BASE + "/8%20Month%20eight.gif", textColor: "#12027b", textTop: "79%" },
  9: { gif: BASE + "/9%20Month%20nine.gif", textColor: "#ffffff", textTop: "77%" },
  10: { gif: BASE + "/10%20Month%20ten.gif", textColor: "#000000", textTop: "79%" },
  11: { gif: BASE + "/11%20Month%20eleven.gif", textColor: "#ff8200", textTop: "79%" },
  12: { gif: BASE + "/12%20Month%20twelve.gif", textColor: "#ffffff", textTop: "79%" },
};

const NIGHT = new Set(["halloween", "christmas", "newyears", "fourthjuly"]);

function buildBatches(steps, monthNumber) {
  const titles = (steps || []).map((s) => s.title).filter(Boolean);
  const batches = [[`You crushed Month ${monthNumber}! 🎉`]];
  for (let i = 0; i < titles.length && batches.length < 5; i += 2) batches.push(titles.slice(i, i + 2));
  return batches;
}

export default function MonthCelebrationModal({ monthNumber, completedSteps, onClose, specialMode }) {
  const [phase, setPhase] = useState("intro"); // intro | text | done
  const [batchIndex, setBatchIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const config = MONTH_CONFIG[monthNumber] || MONTH_CONFIG[((Number(monthNumber) - 1) % 12) + 1] || MONTH_CONFIG[1];
  const batches = buildBatches(completedSteps, monthNumber);
  const night = NIGHT.has(specialMode);

  useEffect(() => {
    const t = setTimeout(() => setPhase("text"), 4500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const autoClose = setTimeout(() => onClose(), 23500);
    return () => clearTimeout(autoClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "text") return undefined;
    setVisible(true);
    const fadeOut = setTimeout(() => setVisible(false), 3500);
    const next = setTimeout(() => {
      if (batchIndex < batches.length - 1) setBatchIndex((b) => b + 1);
      else { setPhase("done"); setVisible(false); }
    }, 4000);
    return () => { clearTimeout(fadeOut); clearTimeout(next); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, batchIndex]);

  if (!monthNumber) return null;

  return (
    <div role="dialog" data-state="open" aria-label={`Month ${monthNumber} done`} style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      <img
        src={config.gif}
        alt={`Month ${monthNumber} celebration`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute", top: 14, right: 14, zIndex: 10001,
          background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%",
          width: 30, height: 30, cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center", color: "white",
        }}
      >
        <X size={14} />
      </button>
      {(phase === "text" || phase === "done") && (
        <div style={{
          position: "absolute", top: config.textTop, left: 0, right: 0, bottom: "3%", zIndex: 10000,
          background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "0 24px", borderRadius: "0 0 8px 8px",
        }}>
          {phase === "text" && (
            <div style={{ textAlign: "center", opacity: visible ? 1 : 0, transition: "opacity 0.5s ease" }}>
              {batches[batchIndex]?.map((line, i) => (
                <p key={i} style={{
                  color: config.textColor,
                  fontSize: batchIndex === 0 ? "1.3rem" : "1.05rem",
                  fontWeight: batchIndex === 0 ? "800" : "600",
                  margin: "3px 0",
                  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                  lineHeight: 1.3,
                }}>{line}</p>
              ))}
            </div>
          )}
          {phase === "done" && (
            <button
              onClick={onClose}
              style={night ? {
                background: "rgba(0,0,0,0.7)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "999px", padding: "13px 36px", fontSize: "1rem", fontWeight: "700", cursor: "pointer",
              } : {
                background: "white", color: "#111", border: "none", borderRadius: "999px",
                padding: "13px 36px", fontSize: "1rem", fontWeight: "700", cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              }}
            >
              Keep going! 🎉
            </button>
          )}
        </div>
      )}
    </div>
  );
}
