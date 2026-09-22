import { persistOnboardingFlag } from './onboardingSync';
import { seenKey } from './tourVersion';

// First-run sequencing. Everything on a fresh install happens in order:
// welcome note → page tours → notification permission → pinned quick capture.
// Each step marks itself done and later steps wait on it.
export const ONBOARDING_STEPS = {
  welcome: 'onboarding_welcome_done',
  homeTour: 'onboarding_home_tour_done',
  // The permissions card (notifications + pinned shortcut) right after the
  // Home tour. Answered either way counts — the OS prompt waits on this.
  // Kept on the account only: every account sees the card once, including
  // ones that answered the older stand-alone pinned-shortcut offer. The key is
  // versioned because a first cut of the card marked itself done without ever
  // appearing on accounts that already had the shortcut pinned.
  permissions: 'onboarding_permissions_done_v2',
  // Not part of the first-run sequence: the one-off catch-up for accounts that
  // onboarded before the name + about-me questions existed.
  catchUp: 'onboarding_catchup_done',
};

const EVENT = 'adhd_onboarding_step';

// A step is done when THAT step's own flag is set — never because some other
// tour finished. The one exception is precise: users who completed the
// CURRENT-version Home tour before these flags existed already sat through the
// welcome note and the tour, so those two specific steps count as done. A
// stale older-version tour key means nothing here.
const legacyDone = (key) => {
  if (key !== ONBOARDING_STEPS.welcome && key !== ONBOARDING_STEPS.homeTour) return false;
  try {
    return localStorage.getItem(seenKey('Home')) === '1';
  } catch (e) {
    return false;
  }
};

export const isStepDone = (key) => {
  try {
    if (localStorage.getItem(key) === '1') return true;
  } catch (e) {
    return false;
  }
  return legacyDone(key);
};

export const markStepDone = (key) => {
  localStorage.setItem(key, '1');
  persistOnboardingFlag(key);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
};

export function waitForStep(key) {
  if (isStepDone(key)) return Promise.resolve();
  return new Promise((resolve) => {
    const onStep = (e) => {
      if (e.detail === key) {
        window.removeEventListener(EVENT, onStep);
        resolve();
      }
    };
    window.addEventListener(EVENT, onStep);
  });
}