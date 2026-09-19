import { showEggBadge } from './eggBadge';

// Two hidden rewards that fire off real completions:
//  - any chore (laundry, dishes, cleaning…) → the cat riding the vacuum
//  - five completions in one day → the vacuum guy
// Neither changes what completing a task actually does.

const CAT_GIF = 'https://media.base44.com/images/public/68dd79726fce6eca73056b9b/6ae4cb241_TuxedoCatStickerbymydoodlesateme.gif';
const VACUUM_GIF = 'https://media.base44.com/images/public/68dd79726fce6eca73056b9b/5c2115937_HappyVacuumCleanerStickerbyBasSmit.gif';

const CHORE_WORDS = [
  'vacuum', 'clean', 'sweep', 'mop', 'dust', 'laundry', 'dishes', 'dishwasher',
  'trash', 'garbage', 'recycling', 'tidy', 'declutter', 'scrub', 'bathroom',
  'kitchen', 'litter box', 'fold', 'wash', 'sheets', 'organize',
];

const DAILY_MILESTONE = 5;

const todayKey = () => new Date().toLocaleDateString('en-CA');

const isChore = (title = '') => {
  const t = title.toLowerCase();
  return CHORE_WORDS.some((w) => t.includes(w));
};

// Counts completions for today and returns the new count.
function bumpDailyCount() {
  try {
    const raw = JSON.parse(localStorage.getItem('egg_daily_done') || '{}');
    const count = (raw.day === todayKey() ? raw.count || 0 : 0) + 1;
    localStorage.setItem('egg_daily_done', JSON.stringify({ day: todayKey(), count }));
    return count;
  } catch {
    return 1;
  }
}

// Returns true when a badge was shown, so the caller can skip its other eggs.
export function checkChoreEgg(task) {
  if (!task) return false;

  const count = bumpDailyCount();

  // Five things done in one day — that's a whole day of momentum.
  if (count === DAILY_MILESTONE) {
    showEggBadge({
      gif: VACUUM_GIF,
      emoji: '🧹',
      title: "Five done today. Five.",
      body: "Whatever this is, it's working. Nobody clean this up.",
    });
    return true;
  }

  if (isChore(task.title)) {
    showEggBadge({
      gif: CAT_GIF,
      emoji: '🧼',
      title: 'Chore: handled.',
      body: 'Somebody around here is riding the vacuum. It is not you.',
    });
    return true;
  }

  return false;
}