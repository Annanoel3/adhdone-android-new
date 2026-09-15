import { setTourActive, isTourActive } from './tourActive';

// One shared registry for every blocking onboarding surface (welcome note, tour
// cards, quick-capture offer). Two surfaces must never be on screen at once,
// and the next one only appears once the screen is genuinely calm — no magic
// setTimeouts anywhere in the sequence.
let open = 0;
let lastInteractionAt = 0;

if (typeof window !== 'undefined') {
  const touch = () => { lastInteractionAt = Date.now(); };
  window.addEventListener('keydown', touch, true);
  window.addEventListener('pointerdown', touch, true);
}

export function enterOnboardingSurface() {
  open += 1;
  setTourActive(true);
}

export function exitOnboardingSurface() {
  open = Math.max(0, open - 1);
  if (open === 0) setTourActive(false);
}

export function isOnboardingSurfaceOpen() {
  return open > 0;
}

const isUserBusy = () => {
  if (Date.now() - lastInteractionAt < 2000) return true;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
};

// Resolves the moment nothing is blocking the screen and the user isn't in the
// middle of typing or tapping. Polls readiness instead of guessing a delay.
export function waitForCalm() {
  return new Promise((resolve) => {
    const check = () => {
      if (!isOnboardingSurfaceOpen() && !isTourActive() && !isUserBusy()) {
        resolve();
        return;
      }
      setTimeout(check, 400);
    };
    check();
  });
}