// Cheaper OpenAI calls with the same model, the same reasoning effort, the same
// words and the same answers. Added Oct 28 2026 after Anna's October OpenAI bill
// hit $49.71 while the apps make about $5 a month ("we can't be spending this
// much. But we also don't want a dumb app").
//
// What it fixes (developers.openai.com/api/docs/guides/prompt-caching, read Oct 28 2026):
// On GPT-6 models OpenAI's default caching writes the WHOLE prompt to its cache
// on every call, at 1.25x the normal input price, ending after the last user
// message. Every prompt in this app is a long fixed instruction block followed
// by this call's own facts, so that write is never reused: every call paid 25%
// extra on its input and got nothing back. Explicit mode caches only the fixed
// system message: the first call in a 30-minute window writes it (1.25x), every
// call after that reads it at 0.1x, and this call's own facts are billed at the
// plain 1x with no write.
//
// lean(openai) — wrap a client once; every chat.completions.create through it
//   gets explicit caching on gpt-6 models. A system message given as a string of
//   CACHE_MIN_CHARS or more gets one cache mark at its end. A caller that splits
//   its system message into parts (fixed part first, marked by cachePart) keeps
//   its own marks.
// No flex tier, anywhere (Anna, Oct 28 2026: its slower answers worry her, and
//   Smart Reminders is not to be touched). Every call keeps the normal speed.
//
// Fail-safe: if OpenAI ever rejects these settings, the call is re-sent exactly
// as the caller wrote it, so nothing can break because of this file.

//
// CLAUDE (Nov 24 2026; Anna: "Can we change everything over to claude only on
// mt account, run tests, and then make it live for everyone"): every call
// through lean() first asks whose it is (shared/aiPerson.ts) and, for someone
// on Claude (shared/claudeAi.ts: CLAUDE_FOR, CLAUDE_EVERYONE), is answered by
// Claude in OpenAI's shape. If Claude can't answer, the call goes to OpenAI
// as before. A call can name its person with `ai_person` on the request; it
// is taken off before anything is sent.
import { currentPerson } from './aiPerson.ts';
import { claudeMaybe, claudeFor, claudeChat, claudeResponses, ClaudeError } from './claudeAi.ts';

// OpenAI only caches a prefix of 1,024 tokens or more (about 4 characters each).
const CACHE_MIN_CHARS = 3500;

export function cachePart(text: string) {
  return { type: 'text', text, prompt_cache_breakpoint: { mode: 'explicit' } };
}

function withCaching(params: any) {
  const model = String(params?.model || '');
  if (!/^gpt-6/.test(model) || params?.prompt_cache_options || !Array.isArray(params?.messages)) return params;
  const messages = params.messages.map((m: any, i: number) => {
    if (i === 0 && m && (m.role === 'system' || m.role === 'developer') && typeof m.content === 'string' && m.content.length >= CACHE_MIN_CHARS) {
      return { ...m, content: [cachePart(m.content)] };
    }
    return m;
  });
  return { ...params, messages, prompt_cache_options: { mode: 'explicit' } };
}

// Any "bad request" answer to a call this file changed is treated as OpenAI
// refusing the settings: the caller's own version is sent instead. A request
// that was bad to begin with fails again the same way it always would have
// (OpenAI doesn't bill a refused request).
function rejectedSettings(e: any) {
  return e?.status === 400 || e?.status === 422;
}

function logUsage(fn: string, res: any) {
  try {
    const u = res?.usage || {};
    const d = u.prompt_tokens_details || {};
    console.log(`[ai] ${fn} ${res?.model || ''} tier=${res?.service_tier || 'default'} in=${u.prompt_tokens ?? '?'} read=${d.cached_tokens ?? 0} write=${d.cache_write_tokens ?? 0} out=${u.completion_tokens ?? '?'}`);
  } catch (_) { /* logging never matters more than the answer */ }
}

// ── Per-feature AI usage (Nov 6 2026) ──
// One AppEvent { event: "ai_usage" } per AI call: which function, model and
// OpenAI project (shared or private), and token counts. Never anything the
// person wrote. Anna wants to know what turning OpenAI's data sharing off
// would cost, feature by feature, before deciding (the shared project's free
// daily tokens need sharing on). Base44's function-log API came back empty, so
// the counts are kept here instead.
// Safe by design: it runs only AFTER the answer is back, is never awaited (the
// answer is never held up), and any failure is ignored. Plain fetch, the same
// anonymous AppEvent write the app itself uses (AppEvent rls create: {}).
const APP_ID = '68dd79726fce6eca73056b9b';
const EVENTS_URL = `https://base44.app/api/apps/${APP_ID}/entities/AppEvent`;

function projectOf(openai: any): string {
  try {
    const priv = (Deno.env.get('OPENAI_API_KEY_PRIVATE') || '').trim();
    return priv && String(openai?.apiKey || '').trim() === priv ? 'private' : 'shared';
  } catch (_) {
    return 'shared';
  }
}

function recordUsage(fn: string, project: string, kind: 'chat' | 'responses', res: any) {
  try {
    const u = res?.usage;
    if (!u) return;
    const chat = kind === 'chat';
    const d = (chat ? u.prompt_tokens_details : u.input_tokens_details) || {};
    const props = {
      fn, kind, project: res?.provider === 'claude' ? 'claude' : project,
      model: String(res?.model || ''),
      input: Number(chat ? u.prompt_tokens : u.input_tokens) || 0,
      cached: Number(d.cached_tokens) || 0,
      write: Number(d.cache_write_tokens) || 0,
      output: Number(chat ? u.completion_tokens : u.output_tokens) || 0,
      searches: chat ? 0 : (Array.isArray(res?.output) ? res.output.filter((o: any) => o?.type === 'web_search_call').length : 0),
    };
    fetch(EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Id': APP_ID },
      body: JSON.stringify({ event: 'ai_usage', props }),
    }).catch(() => {});
  } catch (_) { /* counting never matters more than the answer */ }
}

// Whose call this is, and the request without our own field on it.
function splitPerson(params: any): { person: any; clean: any } {
  if (!params || typeof params !== 'object' || !('ai_person' in params)) return { person: undefined, clean: params };
  const { ai_person, ...clean } = params;
  return { person: ai_person, clean };
}

async function onClaude(person: any, fn = ''): Promise<boolean> {
  try {
    if (!claudeMaybe()) return false;
    // Everyone on Claude, a job that is on Claude for everyone
    // (CLAUDE_JOBS_FOR_EVERYONE), or a test that asks for it: no need to know who.
    if (claudeFor('', fn)) return true;
    const who = person !== undefined && person !== null && person !== '' ? String(person).toLowerCase() : await currentPerson();
    return claudeFor(who);
  } catch (_) {
    return false;
  }
}

// A Claude call that failed goes to OpenAI instead, unless it ran out of the
// caller's time (then it fails, as an OpenAI call that ran out would have).
function claudeGaveUp(fn: string, e: any) {
  const timedOut = e instanceof ClaudeError && e.timedOut;
  console.error(`[ai] ${fn}: Claude ${timedOut ? 'ran out of time' : 'could not answer, sent to OpenAI'}:`, (e as any)?.message || e);
  try {
    fetch(EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Id': APP_ID },
      body: JSON.stringify({ event: 'ai_claude_failed', props: { fn, status: Number((e as any)?.status) || 0, timed_out: timedOut, why: String((e as any)?.message || e).slice(0, 160) } }),
    }).catch(() => {});
  } catch (_) { /* never matters */ }
  if (timedOut) throw e;
}

// Counting only: the calls go out exactly as written (no caching changes).
function countResponses(openai: any, fn: string, project: string) {
  const responses = openai?.responses;
  if (!responses || typeof responses.create !== 'function' || responses.__counted) return;
  const original = responses.create.bind(responses);
  responses.create = async (params: any, options?: any) => {
    const { person, clean } = splitPerson(params);
    if (await onClaude(person, fn)) {
      try {
        const res = await claudeResponses(clean, options);
        recordUsage(fn, project, 'responses', res);
        return res;
      } catch (e) {
        claudeGaveUp(fn, e);
      }
    }
    const res = await original(clean, options);
    recordUsage(fn, project, 'responses', res);
    return res;
  };
  responses.__counted = true;
}

export function countUsage(openai: any, opts: { name?: string } = {}) {
  try {
    const fn = opts.name || 'ai';
    const project = projectOf(openai);
    countResponses(openai, fn, project);
    const completions = openai?.chat?.completions;
    if (completions && typeof completions.create === 'function' && !completions.__counted && !completions.__lean) {
      const original = completions.create.bind(completions);
      completions.create = async (params: any, options?: any) => {
        const { person, clean } = splitPerson(params);
        if (await onClaude(person, fn)) {
          try {
            const res = await claudeChat(clean, options);
            recordUsage(fn, project, 'chat', res);
            return res;
          } catch (e) {
            claudeGaveUp(fn, e);
          }
        }
        const res = await original(clean, options);
        recordUsage(fn, project, 'chat', res);
        return res;
      };
      completions.__counted = true;
    }
  } catch (_) { /* counting never matters more than the answer */ }
  return openai;
}

export function lean(openai: any, opts: { name?: string } = {}) {
  const completions = openai?.chat?.completions;
  if (!completions || completions.__lean) return openai;
  const original = completions.create.bind(completions);
  const fn = opts.name || 'ai';
  const project = projectOf(openai);
  try { countResponses(openai, fn, project); } catch (_) { /* never matters */ }
  completions.create = async (rawParams: any, options?: any) => {
    const { person, clean: params } = splitPerson(rawParams);
    if (await onClaude(person, fn)) {
      try {
        const res = await claudeChat(params, options);
        logUsage(fn, res);
        recordUsage(fn, project, 'chat', res);
        return res;
      } catch (e) {
        claudeGaveUp(fn, e);
      }
    }
    const cached = withCaching(params);
    const sendAt = async (p: any, o?: any) => {
      try {
        return await original(p, o);
      } catch (e) {
        if (p !== params && rejectedSettings(e)) {
          console.error(`[ai] ${fn}: OpenAI refused the cost settings, sent as written:`, (e as any)?.message || e);
          return await original(params, options);
        }
        throw e;
      }
    };
    const res = await sendAt(cached, options);
    logUsage(fn, res);
    recordUsage(fn, project, 'chat', res);
    return res;
  };
  completions.__lean = true;
  return openai;
}
