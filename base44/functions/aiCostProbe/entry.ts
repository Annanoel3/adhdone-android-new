// TEMPORARY (Oct 28 2026): proves OpenAI accepts the settings in shared/aiCost.ts
// and shows the real token counts before and after. Deleted once checked.
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { REMINDER_BRIEF } from '../../shared/reminderBrief.ts';

const KEY = 'probe-7f3c91e0b2d44a6e9c15d8b0a3e27f64';

Deno.serve(async (req) => {
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }
  if (body?.key !== KEY) return Response.json({ error: 'no' }, { status: 403 });
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const out: any = {};
  const pick = (r: any) => ({ model: r?.model, tier: r?.service_tier, usage: r?.usage });
  const user = (n: number) => `Task: "Call the pharmacy about the refill" (test ${n} at ${new Date().toISOString()}). Return JSON only: {"title": "<2-6 words>", "body": "<one sentence>"}`;

  // 1. Today's behaviour: plain client, no cost settings (the implicit write).
  try {
    const plain = new OpenAI({ apiKey });
    const r = await plain.chat.completions.create({
      model: body.model || 'gpt-6-luna', reasoning_effort: 'low', response_format: { type: 'json_object' }, max_completion_tokens: 1500,
      messages: [{ role: 'system', content: REMINDER_BRIEF }, { role: 'user', content: user(0) }],
    } as any);
    out.before = pick(r);
  } catch (e) { out.before = { error: (e as any)?.status, message: (e as any)?.message }; }

  // 2 and 3. Through lean(): the first call writes the brief, the second should read it.
  const client = lean(new OpenAI({ apiKey }), { name: 'aiCostProbe' });
  for (const n of [1, 2]) {
    try {
      const r = await client.chat.completions.create({
        model: body.model || 'gpt-6-luna', reasoning_effort: 'low', response_format: { type: 'json_object' }, max_completion_tokens: 1500,
        messages: [{ role: 'system', content: REMINDER_BRIEF }, { role: 'user', content: user(n) }],
      } as any);
      out[`lean_${n}`] = pick(r);
    } catch (e) { out[`lean_${n}`] = { error: (e as any)?.status, message: (e as any)?.message }; }
  }

  // 4. Flex: same call on the half-price tier.
  if (body.flex) {
    try {
      const flexClient = lean(new OpenAI({ apiKey }), { name: 'aiCostProbe-flex', flex: true });
      const started = Date.now();
      const r = await flexClient.chat.completions.create({
        model: body.model || 'gpt-6-luna', reasoning_effort: 'low', response_format: { type: 'json_object' }, max_completion_tokens: 1500,
        messages: [{ role: 'system', content: REMINDER_BRIEF }, { role: 'user', content: user(3) }],
      } as any);
      out.flex = { ...pick(r), ms: Date.now() - started };
    } catch (e) { out.flex = { error: (e as any)?.status, message: (e as any)?.message }; }
  }
  return Response.json(out);
});
