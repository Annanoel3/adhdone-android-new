// Tiny pub/sub for easter-egg badge cards. Anything anywhere in the app can
// call showEggBadge(); the single <EggBadge /> mounted in the layout renders it.
// `gif` is optional — when given it replaces the emoji with a small animation.
export function showEggBadge({ emoji, title, body, gif }) {
  window.dispatchEvent(
    new CustomEvent('egg-badge', { detail: { emoji, title, body, gif } })
  );
}