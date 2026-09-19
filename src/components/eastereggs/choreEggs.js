import { showEggBadge } from './eggBadge';

// Hidden housework rewards. Chores are the tasks that get done and never
// celebrated, so finishing one quietly earns a little animated applause —
// escalating the more of them you clear in one day.

const CHORE_WORDS = [
  'vacuum', 'clean', 'sweep', 'mop', 'dust', 'laundry', 'dishes', 'dishwasher',
  'trash', 'garbage', 'recycling', 'tidy', 'declutter', 'scrub', 'bathroom',
  'kitchen', 'litter box', 'fold', 'wash', 'bed sheets', 'sheets', 'organize',
];

const STAGES = [
  {
    gif: 'https://media.base44.com/images/public/68dd79726fce6eca73056b9b/6ae4cb241_TuxedoCatStickerbymydoodlesateme.gif',
    title: 'One chore down.',
    body: 'Somebody around here is riding the vacuum. It is not you.',
  },
  {
    gif: 'https://media.base44.com/images/public/68dd79726fce6eca73056b9b/5c2115937_HappyVacuumCleanerStickerbyBasSmit.gif',
    title: "Two chores. You're on a cleaning bender.",
    body: 'This is the most dangerous kind of momentum.',
  },
];

const isChore = (title = '') => {
  const t = title.toLowerCase();
  return CHORE_WORDS.some((w) => t.includes(w));
};

const todayKey = () => new Date().toLocaleDateString('en-CA');

// Returns true when a badge was shown, so the caller can skip its other eggs.
export function checkChoreEgg(task) {
  if (!task || !isChore(task.title)) return false;

  let count = 0;
  try {
    const raw = JSON.parse(localStorage.getItem('chore_egg_day') || '{}');
    if (raw.day === todayKey()) count = raw.count || 0;
    count += 1;
    localStorage.setItem('chore_egg_day', JSON.stringify({ day: todayKey(), count }));
  } catch {
    count = 1;
  }

  // Past three, stop congratulating — it stops being a surprise.
  if (count > STAGES.length) return false;

  const stage = STAGES[count - 1];
  showEggBadge({ gif: stage.gif, emoji: '🧼', title: stage.title, body: stage.body });
  return true;
}