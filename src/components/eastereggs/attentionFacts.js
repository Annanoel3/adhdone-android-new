// Real(ish) facts about attention, shown when someone long-presses the app
// title. Warm and interesting — never a productivity lecture.
export const ATTENTION_FACTS = [
  "Your brain can't actually multitask. It task-switches, and each switch costs about 20 minutes of full focus to recover.",
  "ADHD brains often have a weaker sense of time passing. It's called time blindness, and it's neurological, not a character flaw.",
  "Interest, novelty, challenge, urgency and passion drive attention far more reliably than importance does. Importance alone is a terrible motivator for a spicy brain.",
  "Body doubling works because a second nervous system in the room borrows you some regulation. You're not being dramatic.",
  "Starting a task is a separate brain function from doing it. That's why you can be great at the work and still frozen at the start line.",
  "Dopamine isn't the 'pleasure' chemical — it's the 'pursuit' chemical. It's what makes starting feel possible at all.",
  "Fidgeting genuinely improves focus for some brains. Movement raises arousal, which raises attention.",
  "Putting something in writing outsources it from working memory, which has room for about four things at once. Four.",
  "Hyperfocus and distractibility are the same trait. It's not attention deficit so much as attention direction.",
  "The urge to clean your whole kitchen right before a deadline has a name: productive procrastination. Your brain is chasing an easier win.",
];

export function randomFact(previous) {
  const pool = ATTENTION_FACTS.filter((f) => f !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}