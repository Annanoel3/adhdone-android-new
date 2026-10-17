import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI from "npm:openai";

// The platform's calls occasionally fail once and pass a moment later.
async function whoIsAsking(base44: any) {
  for (let i = 0; i < 3; i++) {
    try {
      return await base44.auth.me();
    } catch (_) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  // Only signed-in people may use this: it runs whatever prompt it's handed
  // on the app's OpenAI account.
  const base44 = await createClientFromRequest(req);
  if (!(await whoIsAsking(base44))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { prompt, judge } = await req.json();
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  // The Parking Lot's tracker look ({ judge: 'tracker' }: "is this a reading
  // for something they track?") runs on the parser's model, with a little
  // thinking. On gpt-4o-mini it logged Anna's "this is an idea" as a heart
  // rate reading, and made a new user's "supplies to buy" a tracker with an
  // entry of "null" (Oct 16 2026). Everything else here stays as it was.
  const tracker = judge === 'tracker';
  const completion = await openai.chat.completions.create({
    model: tracker ? "gpt-5.4" : "gpt-4o-mini",
    ...(tracker ? { reasoning_effort: "low" } : {}),
    messages: [{ role: "user", content: prompt }]
  });
  const message = completion.choices[0].message.content;
  return Response.json({ message });
});