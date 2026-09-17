import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
  await createClientFromRequest(req);
  const { prompt } = await req.json();
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const completion = await openai.chat.completions.create({
    model: "gpt-6-astra",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    reasoning_effort: 'low',
    max_completion_tokens: 4000
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});