import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { personName, instructions, formal, relationship } = await req.json();
    if (!personName) return Response.json({ error: 'personName is required' }, { status: 400 });

    const tone = formal
      ? 'The recipient is someone formal like a boss, coworker, or professional contact. Keep it warm but professional and respectful.'
      : 'The recipient is someone the sender knows well — a close friend or family member. Keep it casual, warm, and genuine.';

    const userGuidance = instructions?.trim()
      ? `The sender wants to include this idea: "${instructions.trim()}". Incorporate it naturally into the message.`
      : '';

    const relationshipContext = relationship?.trim()
      ? `This person is the sender's ${relationship.trim()}. Let that relationship shape the warmth, wording, and what's appropriate to say — do NOT literally state the relationship label in the message unless it sounds natural.`
      : '';

    const prompt = `Write a short birthday text message for ${personName}.

${relationshipContext}
${tone}
${userGuidance}

Rules:
- Start with "Happy Birthday" and the person's name.
- Keep it to 1-3 sentences. Short enough to be a text message.
- No jargon, no fluff, no needless words or punctuation. Write like a real person texting.
- You may include 1-2 festive emojis (🎂🎉🎈) if they fit naturally. Don't overdo it.
- Do NOT include quotes, labels, or explanations — return ONLY the message text.`;

    const openai = new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You write short, natural birthday text messages. You never use jargon, fluff, or unnecessary punctuation. You respond with only the message text, no quotes or labels.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    });

    const message = completion.choices[0].message.content.trim();
    return Response.json({ message });
  } catch (error) {
    console.error('[draftBirthdayText] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}