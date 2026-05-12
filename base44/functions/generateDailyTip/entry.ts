import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt } = await req.json();

    // Generate tip text
    const tipResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const tipText = tipResponse.choices[0].message.content.trim();

    // Categorize the tip
    const categoryPrompt = `Categorize this tip into ONE category: "${tipText}"\n\nCategories: focus, motivation, organization, self_care, time_management\n\nReturn ONLY the category name.`;
    const categoryResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: categoryPrompt
        }
      ]
    });

    const category = categoryResponse.choices[0].message.content.trim().toLowerCase();

    return Response.json({
      tipText,
      category
    });
  } catch (error) {
    console.error('Error generating daily tip:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});