import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

Deno.serve(async (req) => {
  await createClientFromRequest(req);
  const { prompt } = await req.json();
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a task parsing assistant for an ADHD productivity app. Always respond with valid JSON and populate all required fields including reminder_interval, urgency, and energy_required. Never omit fields."
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});