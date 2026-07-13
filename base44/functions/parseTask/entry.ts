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
        content: "You are a task parsing assistant for an ADHD productivity app. Always respond with valid JSON. Populate every field in the schema. If priority_uninferrable is true and is_flexible is true, set urgency=null and reminder_interval=null. Otherwise, never return null for reminder_interval. If no time is specified and the task is a chore, habit, or routine, choose a recurring interval (daily or every_other_day). ALWAYS infer urgency and reminder_interval yourself based on the nature of the task — the app advertises being smart enough to determine priority, so only set priority_uninferrable=true as an ABSOLUTE LAST RESORT if the task is so vague that importance genuinely cannot be determined (this should almost never happen). For general actionable tasks (selling, posting, errands, projects, organizing, fixing) with no date given, infer yourself: high urgency + 2hours ONLY for tasks with real consequences if delayed (deadlines, someone waiting, time-sensitive), medium urgency + 4hours for important-but-flexible tasks (selling items, errands, projects, organizing — these matter but have no deadline pressure), low urgency + daily for low-stakes nice-to-have tasks. When in doubt, default to medium. Only use needs_date_pick=true for genuine scheduled events like appointments, meetings, flights, or parties — never for general tasks that just need to get done. CRITICAL: NEVER infer, guess, or hallucinate a target_time. Only set target_time when the user EXPLICITLY states a time (e.g., 'at 5pm', 'at 3:30', 'by noon'). If the user did not mention a specific time, set target_time=null. Do not use domain knowledge to guess times (e.g., don't assume daycare pickup is 5pm, don't assume work starts at 9am)."
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});