// Tasks the user has spoken/typed that are still being parsed by the AI.
// Lives outside React so the queue survives navigation — the user is sent
// straight back Home and sees a placeholder card with a spinner while the
// processing continues in the background.

let captures = [];
const listeners = new Set();

const emit = () => {
  const snapshot = [...captures];
  listeners.forEach((fn) => fn(snapshot));
};

export function subscribeCaptures(fn) {
  listeners.add(fn);
  fn([...captures]);
  return () => listeners.delete(fn);
}

export function enqueueCapture({ text, presetDate = null, presetDueDateISO = null }) {
  const capture = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    presetDate,
    presetDueDateISO,
    started: false,
  };
  captures.push(capture);
  emit();
  return capture.id;
}

// Claims the next unprocessed capture (marks it started so it can't be
// picked up twice if the processor re-renders).
export function claimNextCapture() {
  const next = captures.find((c) => !c.started);
  if (next) next.started = true;
  return next;
}

export function removeCapture(id) {
  captures = captures.filter((c) => c.id !== id);
  emit();
}