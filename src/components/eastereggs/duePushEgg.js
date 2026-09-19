import { Task } from '@/entities/Task';
import { showEggBadge } from './eggBadge';

// Pushing a task's date out is the most quietly shameful thing in a to-do app.
// So on the 5th push (and every 5th after), the app makes the joke about itself:
// it's the one that's never gonna give the task up.
const RICK_GIF = 'https://media.base44.com/images/public/68dd79726fce6eca73056b9b/164eb488d_NeverGonnaGiveYouUpDancingStickerbyRickAstley.gif';

const EVERY = 5;

// Only counts a real push — moving the date LATER. Pulling it earlier, setting
// a first date, or clearing it never counts.
export function checkDuePushEgg(task, oldISO, newISO) {
  if (!task || !oldISO || !newISO) return;
  if (new Date(newISO).getTime() <= new Date(oldISO).getTime()) return;

  const count = (task.due_date_pushes || 0) + 1;
  Task.update(task.id, { due_date_pushes: count }).catch(() => {});

  if (count % EVERY !== 0) return;

  showEggBadge({
    gif: RICK_GIF,
    emoji: '🎤',
    title: `Pushed ${count} times. Still here.`,
    body: "Never gonna give you up. Never gonna let you down. This task isn't going anywhere, and neither am I.",
  });
}