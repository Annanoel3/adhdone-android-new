import { base44 } from '@/api/base44Client';

// Product analytics: silent, additive, and never allowed to affect the app.
//
// Rules this module enforces for everything that calls it:
//   - no user-written content (titles, notes, diary text, names, addresses);
//     only counts, flags, durations and error strings;
//   - every write is fire-and-forget and swallows its own failure, so a
//     tracking problem can never break a feature or surface to the user;
//   - nothing here renders anything.

const SESSION_KEY = 'adhd_session_id';

export function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch (e) {
    return 'unknown';
  }
}

let cachedEmail = null;

async function resolveEmail() {
  if (cachedEmail) return cachedEmail;
  try {
    const me = await base44.auth.me();
    cachedEmail = me?.email || null;
  } catch (e) {
    cachedEmail = null;
  }
  return cachedEmail;
}

export function setTrackedEmail(email) {
  if (email) cachedEmail = email;
}

export async function track(event, { seconds = null, props = {} } = {}) {
  try {
    const user_email = await resolveEmail();
    await base44.entities.AppEvent.create({
      event,
      user_email: user_email || '',
      session_id: getSessionId(),
      seconds: typeof seconds === 'number' ? Math.round(seconds) : null,
      page: typeof window !== 'undefined' ? window.location.pathname : '',
      props,
    });
  } catch (e) {
    // Intentionally silent.
  }
}

// Non-blocking form for use inside product code paths.
export function trackFire(event, payload) {
  try {
    track(event, payload);
  } catch (e) {}
}