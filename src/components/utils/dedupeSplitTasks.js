// The multi-task splitter occasionally echoes the same task twice with slightly
// different wording ("Do dishes" + "Do the dishes") from a single sentence.
// This collapses those near-duplicates so one spoken task = one created task.

const normalize = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|my|some|to|please|need|i|right|now|just|go|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export default function dedupeSplitTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length <= 1) return tasks;
  const seen = [];
  const kept = [];
  for (const task of tasks) {
    const key = normalize(task);
    if (!key) continue;
    // Treat as duplicate when the normalized text matches, or when one is
    // entirely contained in the other (the "do dishes" / "do the dishes" case).
    const isDupe = seen.some((s) => s === key || s.includes(key) || key.includes(s));
    if (isDupe) continue;
    seen.push(key);
    kept.push(task);
  }
  return kept.length > 0 ? kept : tasks;
}