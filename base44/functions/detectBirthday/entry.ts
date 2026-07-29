import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { inputText } = await req.json();
    if (!inputText) return Response.json({ error: 'inputText is required' }, { status: 400 });

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const prompt = `Analyze this input from a user: "${inputText}"

TODAY IS: ${today}

Determine if the user is asking to be reminded of someone's BIRTHDAY — a yearly recurring celebration of a specific person. Strong signals: the word "birthday", "bday", "b-day", "cake", or naming a person together with a date that is clearly their birthday (e.g. "Mom's birthday is July 4", "remind me that Alex's birthday is this wednesday", "don't forget grandma's bday on the 12th").

If it IS a birthday:
- "person": the name of the person whose birthday it is (just the name, e.g. "Mom", "Alex", "Grandma"). If no name is given, use "Birthday".
- "date": resolve the birthday to a concrete YYYY-MM-DD. Use relative language relative to TODAY:
  - "this wednesday" → the Wednesday in the current week (today if today is Wednesday, otherwise the upcoming Wednesday this week; if that day already passed this week, use next week's Wednesday).
  - "next friday" → the next Friday strictly after today.
  - "tomorrow" → today + 1 day.
  - "july 4" / "July 4th" / "7/4" → that month/day in the current year.
  - "the 12th" / "on the 12th" → the 12th of the current month (or next month if already passed).
  The DATE must be the actual birthday (the "day of"), never a reminder offset.

Only return "is_birthday": true when you are confident this is a birthday reminder. If it is a regular task that merely mentions baking a cake or a party, return false.

Return JSON: { "is_birthday": boolean, "person": string|null, "date": "YYYY-MM-DD"|"null" }`;

    const openai = new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that detects birthday reminders. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    const detected = JSON.parse(completion.choices[0].message.content);
    return Response.json(detected);
  } catch (error) {
    console.error('[detectBirthday] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}