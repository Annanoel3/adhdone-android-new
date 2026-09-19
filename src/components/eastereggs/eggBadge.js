// Tiny pub/sub for easter-egg badge cards. Anything anywhere in the app can
// call showEggBadge(); the single <EggBadge /> mounted in the layout renders it.
export function showEggBadge({ emoji, title, body }) {
  window.dispatchEvent(
    new CustomEvent('egg-badge', { detail: { emoji, title, body } })
  );
}