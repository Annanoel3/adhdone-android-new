// Counts real (non-subtask) task completions and pops the celebration GIF on
// every 5th one. The count lives on the device so it survives app restarts.
const KEY = 'completion_gif_count';
const EVERY = 5;

export function countCompletionForGif() {
  let count = 0;
  try {
    count = parseInt(localStorage.getItem(KEY) || '0', 10) + 1;
    localStorage.setItem(KEY, String(count));
  } catch {
    return;
  }
  if (count % EVERY === 0) {
    // Let the confetti land first, then the GIF.
    setTimeout(() => window.triggerEasterEgg?.('awesome'), 1200);
  }
}