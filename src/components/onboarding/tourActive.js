// Global "a page tour is on screen" flag. Auto-popups (Focus Mode, notification
// follow-ups, birthday/text prompts) check this so nothing ever opens behind a
// tour card.
let active = false;

export function isTourActive() {
  return active;
}

export function setTourActive(value) {
  const next = !!value;
  if (next === active) return;
  active = next;
  window.dispatchEvent(new CustomEvent("tour-active-changed", { detail: { active } }));
}

// Resolves immediately when no tour is running, otherwise when the tour ends.
export function waitForTourEnd() {
  if (!active) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      if (!active) {
        window.removeEventListener("tour-active-changed", handler);
        resolve();
      }
    };
    window.addEventListener("tour-active-changed", handler);
  });
}