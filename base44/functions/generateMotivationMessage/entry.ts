// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';

const openai = lean(new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
}), { name: 'generateMotivationMessage' });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt } = await req.json();

    const response = await openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const message = response.choices[0].message.content.trim();

    return Response.json({
      message
    });
  } catch (error) {
    console.error('Error generating motivation message:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});