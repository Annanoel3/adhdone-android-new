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

// Which account this phone's first-run flags belong to. A different account
// signing in here must not inherit the previous one's "already seen" marks —
// that is how a brand-new account on a used phone got no welcome at all.
const ACCOUNT_KEY = 'adhd_onboarding_account';
const FIRST_RUN_KEYS = ['quick_capture_prompt_seen', 'home_zip_prompt_seen_v2', 'spicybrains_explanation_seen'];

function clearLocalFirstRunFlags() {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('onboarding_') || k.startsWith('tour_seen_') || FIRST_RUN_KEYS.includes(k)) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {}
}

export function hydrateOnboardingFlags(user) {
  const serverFlags = Array.isArray(user?.onboarding_flags) ? [...user.onboarding_flags] : [];
  const email = String(user?.email || '').toLowerCase();
  let lastAccount = '';
  try { lastAccount = localStorage.getItem(ACCOUNT_KEY) || ''; } catch (e) {}
  // A profile with nothing on it yet (no flags, no name, no about-me) is a
  // fresh start whatever this phone remembers — including a profile that was
  // wiped and recreated under the same email.
  const freshProfile = serverFlags.length === 0 && !user?.preferred_name && !user?.about_me;
  if (email && (email !== lastAccount || freshProfile)) {
    clearLocalFirstRunFlags();
    try { localStorage.setItem(ACCOUNT_KEY, email); } catch (e) {}
  }
  knownFlags = serverFlags;
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