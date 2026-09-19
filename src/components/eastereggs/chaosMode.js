// "Chaos mode" — a deliberately, gloriously ugly skin hidden behind tapping the
// version number in Settings seven times.
//
// Two rules, both deliberate:
//  1. Session only. It lives in sessionStorage and is NEVER written to the
//     profile, so closing the app always gets you out of it.
//  2. Completely static. No flashing, no motion, no strobing — ugly, not unsafe.
//
// A profile flag (chaos_mode) exists purely so it can be switched on for a
// specific account to look at; tapping seven times clears that too.
const KEY = 'chaos_mode_session';

export function isChaosOn(user) {
  return sessionStorage.getItem(KEY) === '1' || user?.chaos_mode === true;
}

export function setChaos(on) {
  if (on) sessionStorage.setItem(KEY, '1');
  else sessionStorage.setItem(KEY, '0');
  window.dispatchEvent(new CustomEvent('chaos-mode-changed'));
}

export function isSessionOverrideOff() {
  return sessionStorage.getItem(KEY) === '0';
}