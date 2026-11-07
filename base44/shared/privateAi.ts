// The OpenAI key for the private features: Support Space, Record Notes (and
// Parking Lot voice typing) and the Parking Lot trackers.
//
// OPENAI_API_KEY_PRIVATE belongs to its own OpenAI project, which is NOT in
// the org's "Share inputs and outputs with OpenAI" list (Data controls >
// Sharing: "Enabled for selected projects", only "Default project"). So what
// these features send is never used to train OpenAI's models. It still goes
// to OpenAI to be answered, and OpenAI keeps API data up to 30 days for abuse
// monitoring. Everything else stays on OPENAI_API_KEY (the shared Default
// project), which gets the complimentary daily tokens (Anna, Nov 6 2026:
// sharing kept on there for the cost).
//
// Without the private key the feature still works on the shared key, and the
// log says so, loudly.
export function privateOpenAiKey(fn: string): string {
  const key = (Deno.env.get('OPENAI_API_KEY_PRIVATE') || '').trim();
  if (key) return key;
  console.error(`[ai] ${fn}: OPENAI_API_KEY_PRIVATE is missing — this ran on the shared key (OPENAI_API_KEY)`);
  return Deno.env.get('OPENAI_API_KEY') || '';
}
