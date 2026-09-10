// Lets a specific account re-run the fresh-install sequence. The first-run
// flags all live in localStorage on the device, so the server can't clear them
// directly — instead the profile carries `onboarding_replay_token`; when the
// device sees a token it hasn't applied yet, it wipes the first-run flags once.
const APPLIED_KEY = 'onboarding_replay_applied';
const FIRST_RUN_KEYS = ['quick_capture_prompt_seen', 'home_zip_prompt_seen_v2', 'spicybrains_explanation_seen'];

export function applyOnboardingReplay(user) {
  const token = user?.onboarding_replay_token;
  if (!token || localStorage.getItem(APPLIED_KEY) === token) return false;
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('onboarding_') || k.startsWith('tour_seen_') || FIRST_RUN_KEYS.includes(k)) {
      localStorage.removeItem(k);
    }
  });
  localStorage.setItem(APPLIED_KEY, token);
  return true;
}