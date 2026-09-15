import { base44 } from '@/api/base44Client';

// First-run flags are read synchronously all over the onboarding code, so they
// live in localStorage — but localStorage is per-device/per-session, which meant
// a fresh sign-in replayed the welcome note and every page tour. The account's
// profile is now the source of truth: it's copied down on login and every new
// flag is pushed back up.
//
// Writes are queued and merged against the CURRENT server list before saving.
// Several surfaces finish within milliseconds of each other (and the layout
// writes its own profile fields at the same time), so a naive
// "overwrite with what this device happens to remember" lost flags — and a
// lost flag means onboarding replays for someone who already finished it.
let knownFlags = [];
let pending = new Set();
let queue = Promise.resolve();

export function hydrateOnboardingFlags(user) {
  knownFlags = Array.isArray(user?.onboarding_flags) ? [...user.onboarding_flags] : [];
  knownFlags.forEach((key) => {
    try { localStorage.setItem(key, '1'); } catch (e) {}
  });
}

export function clearOnboardingFlags() {
  knownFlags = [];
  pending = new Set();
  queue = queue.then(() => base44.auth.updateMe({ onboarding_flags: [] })).catch(() => {});
}

async function flush() {
  if (pending.size === 0) return;
  const batch = Array.from(pending);
  pending.clear();

  let serverFlags = knownFlags;
  try {
    const me = await base44.auth.me();
    if (Array.isArray(me?.onboarding_flags)) serverFlags = me.onboarding_flags;
  } catch (e) {
    // Offline / not signed in — fall back to what this device knows.
  }

  const merged = Array.from(new Set([...serverFlags, ...knownFlags, ...batch]));
  knownFlags = merged;
  await base44.auth.updateMe({ onboarding_flags: merged });
}

export function persistOnboardingFlag(key) {
  if (knownFlags.includes(key) || pending.has(key)) return;
  pending.add(key);
  queue = queue.then(flush).catch(() => {});
}