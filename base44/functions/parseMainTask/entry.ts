import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";
import { TASK_PARSE_SYSTEM_PROMPT } from "../../shared/taskParsePrompt.ts";
import { fixParsedTaskTitles } from "../../shared/fixMisheardVerbs.ts";

Deno.serve(async (req) => {
  await createClientFromRequest(req);
  const { prompt } = await req.json();
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: TASK_PARSE_SYSTEM_PROMPT
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1
  });
  const response = fixParsedTaskTitles(JSON.parse(completion.choices[0].message.content));
  return Response.json({ response });
});