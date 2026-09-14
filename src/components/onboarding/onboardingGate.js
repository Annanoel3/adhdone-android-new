import { persistOnboardingFlag } from './onboardingSync';

// First-run sequencing. Everything on a fresh install happens in order:
// welcome note → page tours → notification permission → pinned quick capture.
// Each step marks itself done and later steps wait on it.
export const ONBOARDING_STEPS = {
  welcome: 'onboarding_welcome_done',
  homeTour: 'onboarding_home_tour_done',
};

const EVENT = 'adhd_onboarding_step';

// Existing users already went through the tours — they must never be stuck
// waiting on a step flag that was introduced after they installed.
const isReturningUser = () => {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('tour_seen_'));
  } catch (e) {
    return false;
  }
};

export const isStepDone = (key) =>
  localStorage.getItem(key) === '1' || isReturningUser();

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