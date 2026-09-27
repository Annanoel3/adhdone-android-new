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
  const { prompt } = await req.json();
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });
  const message = completion.choices[0].message.content;
  return Response.json({ message });
});