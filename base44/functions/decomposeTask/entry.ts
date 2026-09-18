import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt } = await req.json();

    // The user's own note about their life (from onboarding) — steps for
    // "prep the set" look very different for a wedding musician than for a
    // generic office worker. Added as a system note so the caller's prompt
    // stays exactly as it was.
    const messages = [];
    if (user.about_me?.trim()) {
      messages.push({
        role: "system",
        content: `Context about this person, in their own words: ${user.about_me.trim()}\nUse it only to make the steps fit their real life. Never mention this note back to them.`,
      });
    }
    messages.push({ role: "user", content: prompt });

    const completion = await openai.chat.completions.create({
      model: "gpt-6-astra",
      response_format: { type: "json_object" },
      messages
    });

    const parsedObject = JSON.parse(completion.choices[0].message.content);

    return Response.json({ response: parsedObject });
  } catch (error) {
    console.error("Error decomposing task:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});