// Tiny pub/sub for easter-egg badge cards. Anything anywhere in the app can
// call showEggBadge(); the single <EggBadge /> mounted in the layout renders it.
// `gif` is optional — when given it replaces the emoji with a small animation.
import { trackFire } from '@/lib/appTrack';

export function showEggBadge({ emoji, title, body, gif }) {
  window.dispatchEvent(
    new CustomEvent('egg-badge', { detail: { emoji, title, body, gif } })
  );
  // Every reveal is counted (AppEvent easter_egg_found): the badge's own
  // title, which the app wrote — never anything the user typed.
  trackFire('easter_egg_found', { props: { egg: String(title || emoji || 'badge').slice(0, 60) } });
}