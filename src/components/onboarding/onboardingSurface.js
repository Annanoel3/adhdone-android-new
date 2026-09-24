import { useEffect, useState } from 'react';
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

// Anything modal on screen right now, whoever opened it: a Radix dialog, alert
// dialog or sheet (the side menu), or one of our own full-screen cards (they
// carry role="dialog" + data-state="open" for the Android back button).
// Popovers and dropdowns don't count — that's the user mid-tap, not a popup.
export function anyPopupOpen() {
  if (typeof document === 'undefined') return false;
  const els = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  for (const el of els) {
    if (!el.closest('[data-radix-popper-content-wrapper]')) return true;
  }
  return false;
}

const isUserBusy = () => {
  if (Date.now() - lastInteractionAt < 2000) return true;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
};

// The moment a waiter is released it owns the screen. Its dialog only registers
// itself a render later, so until it does — or for a short grace period, if it
// decides not to show after all — every other waiter keeps waiting. Without this
// two surfaces polling the same calm screen were released in the same tick and
// stacked on top of each other.
let claimedUntil = 0;
const CLAIM_GRACE_MS = 2500;

// Resolves the moment nothing is blocking the screen and the user isn't in the
// middle of typing or tapping. Polls readiness instead of guessing a delay.
export function waitForCalm() {
  return new Promise((resolve) => {
    const check = () => {
      if (!isOnboardingSurfaceOpen() && !isTourActive() && !anyPopupOpen() && !isUserBusy() && Date.now() >= claimedUntil) {
        claimedUntil = Date.now() + CLAIM_GRACE_MS;
        resolve();
        return;
      }
      setTimeout(check, 400);
    };
    check();
  });
}

// Same turn-taking without the "user is mid-tap" wait, for a popup that is the
// answer to something the user just did (a notification they tapped, the task
// they just added) — it should appear the moment the screen is free, not two
// seconds after their last tap.
export function waitForClear() {
  return new Promise((resolve) => {
    const check = () => {
      if (!isOnboardingSurfaceOpen() && !isTourActive() && !anyPopupOpen() && Date.now() >= claimedUntil) {
        claimedUntil = Date.now() + CLAIM_GRACE_MS;
        resolve();
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

// One popup at a time, for every popup that opens on its own. The popup keeps
// its own "I'd like to be up" state and renders with what this returns
// instead: it waits its turn — nothing else on screen — then holds the screen
// until it closes, so nothing can stack on top of it. Popups a user opens by
// tapping something don't use this; opening one from inside another is by
// design.
export function usePopupTurn(wanted, { reactive = false } = {}) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!wanted) {
      setGranted(false);
      return undefined;
    }
    let cancelled = false;
    (reactive ? waitForClear() : waitForCalm()).then(() => {
      if (!cancelled) setGranted(true);
    });
    return () => { cancelled = true; };
  }, [wanted, reactive]);

  const shown = !!wanted && granted;

  useEffect(() => {
    if (!shown) return undefined;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [shown]);

  return shown;
}