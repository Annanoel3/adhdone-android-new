import { base44 } from '@/api/base44Client';

// First-run flags are read synchronously all over the onboarding code, so they
// live in localStorage — but localStorage is per-device/per-session, which meant
// a fresh sign-in replayed the welcome note and every page tour. The account's
// profile is now the source of truth: it's copied down on login and every new
// flag is pushed back up.
let knownFlags = [];

export function hydrateOnboardingFlags(user) {
  knownFlags = Array.isArray(user?.onboarding_flags) ? [...user.onboarding_flags] : [];
  knownFlags.forEach((key) => {
    try { localStorage.setItem(key, '1'); } catch (e) {}
  });
}

export function clearOnboardingFlags() {
  knownFlags = [];
  base44.auth.updateMe({ onboarding_flags: [] }).catch(() => {});
}

export function persistOnboardingFlag(key) {
  if (knownFlags.includes(key)) return;
  knownFlags.push(key);
  base44.auth.updateMe({ onboarding_flags: [...knownFlags] }).catch(() => {});
}