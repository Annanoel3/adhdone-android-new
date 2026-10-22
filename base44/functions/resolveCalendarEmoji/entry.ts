import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { title } = await req.json();
    if (!title) return Response.json({ error: 'title is required' }, { status: 400 });

    const prompt = `Research this calendar item title and return a single emoji that best represents its subject.

Title: "${title}"

Rules:
- Figure out what the title refers to — brand names, company names, venue names, club names, studio names, place names, event names, or hobby-specific terms.
- Figure out what that thing is about (what they sell, what activity they host, what hobby they represent, etc.) and pick the single emoji that best captures that subject.
- Examples across different hobbies:
  Honda → 🚗 (automotive), CycleGear → 🏍 (motorcycle gear), a dance studio → 💃, a pottery studio → 🏺,
  Nike → 🏃 (running/fitness), Starbucks → ☕ (coffee), a book club → 📚, a gardening club → 🌱,
  a chess club → ♟, a skateboarding club → 🚴, a piano studio → 🎵, a fishing club →🎣
- For anything related to finance, money, payments, loans, taxes, bills, banking, or purchases — return 💲
- For common activities without a proper name, use the matching emoji: call → 📞, gym → 🏃, email → 📧, doctor → 🩺, grocery → 🛒
- Return ONLY a single emoji character.`;

    const openai = new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that picks the best emoji for a given title. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const result = JSON.parse(completion.choices[0].message.content);
    let emoji = result?.emoji || '📌';
    const match = emoji.match(/\p{Extended_Pictographic}/u);
    if (match) emoji = match[0];
    return Response.json({ emoji });
  } catch (error) {
    console.error('[resolveCalendarEmoji] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}