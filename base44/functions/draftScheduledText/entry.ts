import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { secrets } from 'base44:runtime';

// General-purpose text message drafter. Powers the "Schedule a Text" flow the
// same way draftBirthdayText powers birthdays. Always uses the user's OpenAI
// key (never the Base44 LLM integration) per the app's AI policy.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { recipientName, occasion, instructions, formal } = await req.json();
    if (!recipientName) return Response.json({ error: 'recipientName is required' }, { status: 400 });

    const tone = formal
      ? 'The recipient is someone formal like a boss, coworker, or professional contact. Keep it warm but professional and respectful.'
      : 'The recipient is someone the sender knows personally. Keep it casual, warm, and genuine.';

    const occasionLine = occasion?.trim()
      ? `Context for the message: ${occasion.trim()}.`
      : 'The sender wants to reach out to this person.';

    const userGuidance = instructions?.trim()
      ? `The sender wants to include this idea: "${instructions.trim()}". Incorporate it naturally into the message.`
      : '';

    const prompt = `Write a short text message to ${recipientName}.

${occasionLine}
${tone}
${userGuidance}

Rules:
- Keep it to 1-3 sentences. Short enough to be a text message.
- No jargon, no fluff, no needless words or punctuation. Write like a real person texting.
- You may include 1-2 emojis if they fit naturally. Don't overdo it.
- Do NOT include quotes, labels, or explanations — return ONLY the message text.`;

    const openai = new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You write short, natural text messages. You never use jargon, fluff, or unnecessary punctuation. You respond with only the message text, no quotes or labels.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    });

    const message = completion.choices[0].message.content.trim();
    return Response.json({ message });
  } catch (error) {
    console.error('[draftScheduledText] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}