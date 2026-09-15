import { useEffect, useState } from "react";

// Restarts the spot every `totalMs` so it can be left running while screen
// recording — no clicking, no dead air between takes.
export function useAdLoop(totalMs) {
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setRunId((r) => r + 1), totalMs);
    return () => clearTimeout(t);
  }, [runId, totalMs]);
  return runId;
}

// `marks` are millisecond timestamps from the start of the spot. Returns how
// many of them have passed, so each beat of the script is just `step >= n`.
export function useAdSteps(marks, runId) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const timers = marks.map((m, i) => setTimeout(() => setStep(i + 1), m));
    return () => timers.forEach(clearTimeout);
  }, [runId]);
  return step;
}