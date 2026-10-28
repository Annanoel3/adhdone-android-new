import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";
import { lean } from '../../shared/aiCost.ts';

Deno.serve(async (req) => {
  await createClientFromRequest(req);
  const { prompt } = await req.json();
  const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'checkPredatoryBehavior' });
  // gpt-6-astra (was gpt-4o-mini, Base44's AI, May 12 2026). Anna, Oct 17 2026: "Move them to astra like I already asked weeks ago" (she asked for the newest model everywhere on Sept 17 2026).
  const completion = await openai.chat.completions.create({
    model: "gpt-6-astra",
    reasoning_effort: "low",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});