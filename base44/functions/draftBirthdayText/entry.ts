import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { personName, instructions, formal, relationship, askIfAnimal } = await req.json();
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

    const openai = lean(new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') }), { name: 'draftBirthdayText' });

    // What they typed in "Who is X to you?" may say X is an animal ("my
    // hamster", "our horse"). A pet's birthday gets no text (Anna, Oct 12
    // 2026), so that is decided first, by judgment, before any drafting.
    if (askIfAnimal === true && relationship?.trim()) {
      const judged = await openai.chat.completions.create({
        model: 'gpt-6-astra',
        messages: [
          { role: 'system', content: 'You write short, natural birthday text messages. You never use jargon, fluff, or unnecessary punctuation. Answer with JSON only.' },
          { role: 'user', content: `Someone added a birthday for "${personName}". Asked who ${personName} is to them, they typed: "${relationship.trim()}".

First decide: does that answer mean ${personName} is an animal (a pet or any other animal) rather than a person?
- If an animal: {"animal": "<what kind, lowercase, one or two words>", "message": null}
- If a person: write the text by the rules below and answer {"animal": null, "message": "<the text>"}

${prompt}` },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        max_completion_tokens: 2000,
      });
      let out: any = {};
      try { out = JSON.parse(judged.choices[0].message.content || '{}'); } catch (_) { out = {}; }
      const animal = typeof out.animal === 'string' ? out.animal.trim().toLowerCase().slice(0, 40) : '';
      if (animal) return Response.json({ animal });
      if (typeof out.message === 'string' && out.message.trim()) return Response.json({ message: out.message.trim() });
      // No usable answer: fall through and draft as for a person.
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        { role: 'system', content: 'You write short, natural birthday text messages. You never use jargon, fluff, or unnecessary punctuation. You respond with only the message text, no quotes or labels.' },
        { role: 'user', content: prompt }
      ],
      reasoning_effort: 'low',
      max_completion_tokens: 2000
    });

    const message = completion.choices[0].message.content.trim();
    return Response.json({ message });
  } catch (error) {
    console.error('[draftBirthdayText] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}