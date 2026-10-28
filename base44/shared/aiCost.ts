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
// lean(openai, { flex: true }) — background jobs only (nobody is waiting on the
//   answer): same model at half price on OpenAI's flex tier, slower. If flex has
//   no room (429, which OpenAI doesn't charge for) or is slow, the call is sent
//   again at the normal tier.
//
// Fail-safe: if OpenAI ever rejects these settings, the call is re-sent exactly
// as the caller wrote it, so nothing can break because of this file.

// OpenAI only caches a prefix of 1,024 tokens or more (about 4 characters each).
const CACHE_MIN_CHARS = 3500;
const FLEX_TIMEOUT_MS = 120_000;

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

function rejectedSettings(e: any) {
  const msg = String(e?.message || e?.error?.message || '');
  return e?.status === 400 && /prompt_cache|cache_breakpoint|service_tier|flex/i.test(msg);
}

function logUsage(fn: string, res: any) {
  try {
    const u = res?.usage || {};
    const d = u.prompt_tokens_details || {};
    console.log(`[ai] ${fn} ${res?.model || ''} tier=${res?.service_tier || 'default'} in=${u.prompt_tokens ?? '?'} read=${d.cached_tokens ?? 0} write=${d.cache_write_tokens ?? 0} out=${u.completion_tokens ?? '?'}`);
  } catch (_) { /* logging never matters more than the answer */ }
}

export function lean(openai: any, opts: { flex?: boolean; name?: string } = {}) {
  const completions = openai?.chat?.completions;
  if (!completions || completions.__lean) return openai;
  const original = completions.create.bind(completions);
  const fn = opts.name || 'ai';
  completions.create = async (params: any, options?: any) => {
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
    let res: any;
    if (opts.flex && !params?.service_tier) {
      try {
        res = await sendAt({ ...cached, service_tier: 'flex' }, { ...(options || {}), timeout: FLEX_TIMEOUT_MS, maxRetries: 0 });
      } catch (e) {
        console.log(`[ai] ${fn}: flex unavailable (${(e as any)?.status || (e as any)?.name || 'error'}), sending at the normal tier`);
        res = await sendAt(cached, options);
      }
    } else {
      res = await sendAt(cached, options);
    }
    logUsage(fn, res);
    return res;
  };
  completions.__lean = true;
  return openai;
}
