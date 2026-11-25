// OWNER CHECK FOR THE SWITCH TO CLAUDE (Nov 24 2026; Anna: "Can we change
// everything over to claude only on mt account, run tests, and then make it
// live for everyone"). Run from the editor's Test Function as the owner.
//
//   {}                      where things stand: is the Claude key there (yes or
//                           no only, never the key), is the request wrap in
//                           place, who this request is, are they on Claude.
//   { "ping": true }        one tiny call through the app's own AI path, as the
//                           owner: which AI answered, how long it took, tokens.
//   { "parse": ["..."] }    the task parser on each sentence (generic test
//                           sentences only, never anyone's real words), once on
//                           Claude and once on OpenAI, side by side, with times.
//                           Booked on the test caps (shared/testBudget.ts):
//                           OpenAI's $1 a day, Claude credits' own limit.
//   { "words": { "title": "...", "at": "<ISO>", "timezone": "..." } }
//                           the words of the reminder at a task's own time,
//                           both ways, side by side (a made-up task only).
//
// Planner looks are compared with cronSmartTaskNudge's own owner preview:
// { "email": "...", "preview": true, "ai_provider": "claude" | "openai" }.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { aiRouteStatus, currentPerson, asPerson, setAiPerson, aiServe } from '../../shared/aiPerson.ts';
import { claudeKey, claudeFor, CLAUDE_FOR, CLAUDE_EVERYONE, CLAUDE_MODELS } from '../../shared/claudeAi.ts';
import { runTaskParse } from '../../shared/runTaskParse.ts';
import { atTimeWords } from '../../shared/reminderTitle.ts';
import { testGate } from '../../shared/testBudget.ts';

const timed = async <T>(fn: () => Promise<T>) => {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - t0, value };
  } catch (e) {
    return { ms: Date.now() - t0, error: String((e as any)?.message || e).slice(0, 300) };
  }
};

Deno.serve(aiServe(async (req) => {
  const base44 = createClientFromRequest(req);
  const me = await base44.auth.me().catch(() => null);
  if (me?.role !== 'admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const who = await currentPerson();
  const out: any = {
    claude_key_present: !!claudeKey(),
    request_wrap: aiRouteStatus(),
    this_request_is_for: who || null,
    on_claude: claudeFor(who),
    claude_for: [...CLAUDE_FOR],
    claude_everyone: CLAUDE_EVERYONE,
    models: CLAUDE_MODELS,
  };

  // { "probe": true }: does "whose call is this" carry across awaits here, and
  // stay apart between two at once? (Checked on Deno 2.9 locally; this checks
  // the platform's own runtime.)
  if (body?.probe === true) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const viaRun = await Promise.all(['a@probe.test', 'b@probe.test'].map((e, i) => asPerson(e, async () => {
      await sleep(20 - i * 10);
      await fetch('data:text/plain,x').then((r) => r.text()).catch(() => '');
      return (await currentPerson()) === e;
    })));
    const viaEnter = await Promise.all(['c@probe.test', 'd@probe.test'].map((e, i) => asPerson('', async () => {
      setAiPerson(e);
      await sleep(20 - i * 10);
      return (await currentPerson()) === e;
    })));
    const leaksBackOut = await asPerson('outer@probe.test', async () => {
      await (async () => { setAiPerson('inner@probe.test'); await sleep(5); })();
      return await currentPerson();
    });
    out.probe = { asPerson_keeps_each_apart: viaRun.every(Boolean), setAiPerson_keeps_each_apart: viaEnter.every(Boolean), after_inner_setAiPerson: leaksBackOut, deno: (globalThis as any).Deno?.version?.deno || null };
  }

  if (body?.ping === true) {
    const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'aiSwitchCheck' });
    out.ping = await timed(async () => {
      const r: any = await openai.chat.completions.create({
        model: 'gpt-6-astra',
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        max_completion_tokens: 2000,
        messages: [
          { role: 'system', content: 'You check that an app can reach you. Return JSON only.' },
          { role: 'user', content: 'Return {"ok": true, "word": "<one cheerful word>"}' },
        ],
      });
      return { provider: r?.provider || 'openai', model: r?.model, answer: r?.choices?.[0]?.message?.content, usage: r?.usage };
    });
  }

  if (Array.isArray(body?.parse) && body.parse.length) {
    const sentences = body.parse.slice(0, 5).map((s: any) => String(s || '').slice(0, 300));
    const gateOpenAI = await asPerson('', () => testGate(base44, 'parser', sentences.length, body), { provider: 'openai' });
    const gateClaude = await asPerson('', () => testGate(base44, 'parser', sentences.length, body), { provider: 'claude' });
    if (!gateOpenAI.ok || !gateClaude.ok) return Response.json({ ...out, refused: { openai: gateOpenAI, claude: gateClaude } });
    const tz = me?.timezone || 'America/Chicago';
    out.parse = [];
    for (const s of sentences) {
      const [claude, openai] = await Promise.all([
        asPerson(me.email, () => timed(() => runTaskParse(base44, s, tz)), { provider: 'claude' }),
        asPerson(me.email, () => timed(() => runTaskParse(base44, s, tz)), { provider: 'openai' }),
      ]);
      out.parse.push({ sentence: s, claude, openai });
    }
  }

  if (body?.words && typeof body.words === 'object') {
    const w = body.words;
    const task = { title: String(w.title || 'Water the plants').slice(0, 120), original_input: String(w.said || '').slice(0, 300), created_by: me.email };
    const at = Date.parse(String(w.at || '')) || Date.now() + 60 * 60 * 1000;
    const tz = String(w.timezone || me?.timezone || 'America/Chicago');
    const [claude, openai] = await Promise.all([
      asPerson(me.email, () => timed(() => atTimeWords(task, at, tz, 20000, { spoken: !!w.spoken })), { provider: 'claude' }),
      asPerson(me.email, () => timed(() => atTimeWords(task, at, tz, 20000, { spoken: !!w.spoken })), { provider: 'openai' }),
    ]);
    out.words = { task: task.title, claude, openai };
  }

  return Response.json(out);
}));
