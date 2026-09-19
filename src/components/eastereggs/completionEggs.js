import { showEggBadge } from './eggBadge';

// Hidden badges that fire off a real completion. Called from the pages that
// complete tasks — never changes what completing a task actually does.

const localDay = (d) => new Date(d).toLocaleDateString('en-CA');

// A task the USER made and carried, not something a calendar handed them.
function isCarriedTask(task) {
  if (task.parent_task_id) return false;
  if (task.birthday_person || task.is_own_birthday) return false;
  if (task.google_event_id) return false; // imported from Google Calendar
  if (task.classification === 'event' || task.classification === 'birthday') return false;
  return true;
}

export function checkCompletionEggs(task) {
  if (!task || task.parent_task_id) return;

  // 1) Archaeology — you carried this one for a month and then just did it.
  if (isCarriedTask(task) && task.created_date) {
    const days = Math.floor((Date.now() - new Date(task.created_date).getTime()) / 86400000);
    if (days >= 30) {
      showEggBadge({
        emoji: '🏺',
        title: `${days} days. And then you just did it.`,
        body: "You carried that one a long way. That counts extra.",
      });
      return;
    }
  }

  // 2) Goblin hours — anything finished between 1 and 4 AM. Once per night.
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 1 && hour < 4) {
    // Key on the "night" rather than the date so 1 AM and 3:50 AM are one night.
    const nightKey = localDay(now);
    if (localStorage.getItem('goblin_hours_night') !== nightKey) {
      localStorage.setItem('goblin_hours_night', nightKey);
      showEggBadge({
        emoji: '🌘',
        title: 'The goblin hours. Logged.',
        body: "Nobody else is awake. You did a thing anyway.",
      });
    }
  }
}