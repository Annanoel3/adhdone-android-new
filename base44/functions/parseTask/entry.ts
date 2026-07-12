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
        content: "You are a task parsing assistant for an ADHD productivity app. Always respond with valid JSON. Populate every field in the schema. If priority_uninferrable is true and is_flexible is true, set urgency=null and reminder_interval=null. Otherwise, never return null for reminder_interval. If no time is specified and the task is a chore, habit, or routine, choose a recurring interval (daily or every_other_day). If it is a one-time obligation with no date given, use reminder_interval='2hours' so the user is reminded today."
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});