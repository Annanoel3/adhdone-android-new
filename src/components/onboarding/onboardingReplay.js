// Lets a specific account re-run the fresh-install sequence. The first-run
// flags all live in localStorage on the device, so the server can't clear them
// directly — instead the profile carries `onboarding_replay_token`; when the
// device sees a token it hasn't applied yet, it wipes the first-run flags once.
const APPLIED_KEY = 'onboarding_replay_applied';
const REPLAYED_SESSION_KEY = 'onboarding_replayed_this_session';

export function wasReplayedThisSession() {
  try { return sessionStorage.getItem(REPLAYED_SESSION_KEY) === '1'; } catch (e) { return false; }
}
const FIRST_RUN_KEYS = ['quick_capture_prompt_seen', 'home_zip_prompt_seen_v2', 'spicybrains_explanation_seen', 'seasonal_popup_shown', 'kawaii_popup_shown'];

export function applyOnboardingReplay(user) {
  const token = user?.onboarding_replay_token;
  if (!token || localStorage.getItem(APPLIED_KEY) === token) return false;
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('onboarding_') || k.startsWith('tour_seen_') || FIRST_RUN_KEYS.includes(k)) {
      localStorage.removeItem(k);
    }
  });
  localStorage.setItem(APPLIED_KEY, token);
  // Remembered for this visit so the welcome runs as a first run even on an
  // account that already has tasks — that is the whole point of a replay.
  try { sessionStorage.setItem(REPLAYED_SESSION_KEY, '1'); } catch (e) {}
  return true;
}