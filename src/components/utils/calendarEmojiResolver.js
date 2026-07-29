import { base44 } from "@/api/base44Client";

// Contextual emojis — keyword-based matching (fast, no API call).
const CONTEXT_EMOJIS = [
  { keys: ['coffee', 'cafe', 'latte', 'espresso', 'starbucks', 'cappuccino', 'tea'], emoji: '☕' },
  { keys: ['pizza'], emoji: '🍕' },
  { keys: ['lunch', 'brunch'], emoji: '🥗' },
  { keys: ['dinner', 'restaurant', 'reservation', 'dine'], emoji: '🍽️' },
  { keys: ['gym', 'workout', 'exercise', 'training', 'run', 'running', 'yoga'], emoji: '🏃' },
  { keys: ['call', 'phone', 'zoom', 'teams'], emoji: '📞' },
  { keys: ['meeting', 'meet', 'sync', 'standup', 'stand up', '1:1'], emoji: '👥' },
  { keys: ['doctor', 'dentist', 'appointment', 'therapy', 'therapist', 'medical'], emoji: '🩺' },
  { keys: ['flight', 'airport', 'travel', 'trip', 'vacation'], emoji: '✈️' },
  { keys: ['grocery', 'groceries', 'shopping', 'shop', 'store', 'errand', 'costco'], emoji: '🛒' },
  { keys: ['movie', 'cinema', 'film', 'theater', 'concert'], emoji: '🎬' },
  { keys: ['drink', 'bar', 'beer', 'wine', 'cocktail', 'happy hour'], emoji: '🥂' },
  { keys: ['walk', 'hike', 'park'], emoji: '🚶' },
  { keys: ['school', 'class', 'lecture', 'exam', 'study'], emoji: '🎓' },
  { keys: ['tax', 'taxes', 'bill', 'bills', 'bank', 'mortgage', 'rent'], emoji: '💳' },
  { keys: ['haircut', 'salon', 'barber', 'nails'], emoji: '💇' },
  { keys: ['drive', 'car', 'uber', 'lyft', 'commute'], emoji: '🚗' },
];

export function keywordEmojiForTitle(title) {
  if (!title) return null;
  const t = String(title).toLowerCase();
  for (const { keys, emoji } of CONTEXT_EMOJIS) {
    if (keys.some((k) => {
      // Match whole words only so "care" never matches the "car" key.
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`).test(t);
    })) return emoji;
  }
  return null;
}

// In-module cache — persists across re-renders and navigation so we don't
// re-query the LLM for the same title every time the calendar repaints.
const aiEmojiCache = new Map();
const pendingRequests = new Map();

export function getCachedAiEmoji(title) {
  return aiEmojiCache.get(title) || null;
}

/**
 * Uses InvokeLLM with web search to research what a title refers to (especially
 * brand/company names) and returns a single contextually-appropriate emoji.
 * Results are cached in-module so repeat lookups are instant.
 */
export function resolveEmojiWithAI(title) {
  if (!title) return Promise.resolve(null);
  if (aiEmojiCache.has(title)) return Promise.resolve(aiEmojiCache.get(title));
  if (pendingRequests.has(title)) return pendingRequests.get(title);

  const promise = (async () => {
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Research this calendar item title and return a single emoji that best represents its subject.

Title: "${title}"

Rules:
- If the title contains a brand, company, or proper name, research what they sell or what they're associated with and pick the matching emoji.
  Examples: Honda → 🚗 (cars), Tesla → 🚙 (car), Nike → 🏃 (running/fitness), Starbucks → ☕ (coffee), Apple → 🍎 (tech), Netflix → 🎬 (streaming), CycleGear → 🚴 (motorcycle gear)
- For activities, use the matching emoji: call → 📞, pay bill → 💳, gym → 🏃, email → 📧, doctor → 🩺, grocery → 🛒
- Return ONLY a single emoji character.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            emoji: { type: "string", description: "A single emoji character" }
          },
          required: ["emoji"]
        }
      });
      let emoji = result?.emoji || '📌';
      // Extract the first emoji character if the AI returned extra text
      const match = emoji.match(/\p{Extended_Pictographic}/u);
      if (match) emoji = match[0];
      aiEmojiCache.set(title, emoji);
      return emoji;
    } catch (e) {
      console.error('Error resolving emoji with AI:', e);
      aiEmojiCache.set(title, '📌');
      return '📌';
    }
  })();

  pendingRequests.set(title, promise);
  return promise;
}