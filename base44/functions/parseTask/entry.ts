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
        content: "You are a task parsing assistant for an ADHD productivity app. Always respond with valid JSON. Populate every field in the schema. CRITICAL REMINDER RULE: reminder_interval must ONLY be set to a recurring value (10min/20min/30min/1hour/2hours/4hours/daily/every_other_day) when the user EXPLICITLY uses recurring language ('every 10 minutes', 'every hour', 'daily', 'every day', 'every other day'). For ALL other tasks, set reminder_interval=null — the app's LLM smart-nudge system decides when/how often to remind based on urgency and due date. NEVER auto-assign a recurring interval based on urgency or task type. Use 'once' ONLY for one-time precise reminders tied to a specific moment ('in 10 minutes', 'at 3pm'). ALWAYS infer urgency yourself (low/medium/high/urgent) based on the nature of the task — the LLM uses urgency to decide when to surface the task. Only set priority_uninferrable=true as an ABSOLUTE LAST RESORT if the task is so vague that importance genuinely cannot be determined (this should almost never happen); otherwise default to urgency='medium', reminder_interval=null. Only use needs_date_pick=true for genuine scheduled events like appointments, meetings, flights, or parties — never for general tasks that just need to get done. CRITICAL: NEVER infer, guess, or hallucinate a target_time. Only set target_time when the user EXPLICITLY states a time (e.g., 'at 5pm', 'at 3:30', 'by noon'). If the user did not mention a specific time, set target_time=null. Do not use domain knowledge to guess times (e.g., don't assume daycare pickup is 5pm, don't assume work starts at 9am)."
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});