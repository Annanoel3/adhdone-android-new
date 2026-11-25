// THE CLAUDE SIDE OF EVERY AI CALL (Nov 24 2026).
//
// Anna, Nov 24 2026: "Can we change everything over to claude only on mt
// account, run tests, and then make it live for everyone". Her Claude plan
// includes $200 a month of Claude API credits (claimed that evening for
// "Anna's Individual Org"); OpenAI had cost about $58 that month by Nov 24.
//
// Every call the app makes goes through lean() (shared/aiCost.ts) in OpenAI's
// shape. For a person who is on Claude (CLAUDE_FOR, or everyone once
// CLAUDE_EVERYONE is on), lean() hands the same request to claudeChat /
// claudeResponses here, which send it to Claude and give the answer back in
// OpenAI's shape, so no caller changes. If Claude can't answer (no key, an
// error, an answer that isn't the JSON asked for), the call goes to OpenAI
// exactly as before: nothing can break because of this file. A call that ran
// out of its time is not sent again.
//
// Not on Claude, and staying on OpenAI: speech to text for recordings (Claude
// has no speech-to-text) and the free safety check on Support Space messages
// (OpenAI's moderation endpoint).
//
// Facts used (Claude Platform docs, read Nov 24 2026): POST
// https://api.anthropic.com/v1/messages with headers x-api-key,
// anthropic-version (2026-10-21, the newest listed) and content-type;
// `system` is a string or text blocks (blocks can carry cache_control
// {type:"ephemeral"}, 5 minutes by default); max_tokens is required and counts
// thinking too; temperature/top_p/top_k are removed in 2026-10-21 (sending one
// is a 400); output_config.effort is low/medium/high/xhigh/max;
// output_config.format {type:"json_schema", schema} forces a JSON answer
// (there is no "any JSON object" mode); images are {type:"image", source:
// {type:"base64"|"url", ...}}; the web search tool is
// {type:"web_search_20250305", name:"web_search", max_uses}, $10 per 1,000
// searches; "pause_turn" means send the answer back as it is to continue.
// Prices per million tokens: Fable 5.2 $8 in / $40 out (cache write 5 min
// $10, read $0.20); Haiku 5.5 $0.10 / $0.50 (write $0.125, read $0.01).
import { currentAiWho } from './aiPerson.ts';

// Who is on Claude. Anna's two accounts while it is tested; CLAUDE_EVERYONE
// is turned on only on Anna's word, after the tests.
export const CLAUDE_FOR = new Set<string>(['s2kap2chick@gmail.com', 'annanoelwenballew@gmail.com']);
export const CLAUDE_EVERYONE = false;

// Which Claude model answers. gpt-6-astra (everything that judges or writes
// for people) -> Claude Fable 5.2, Anthropic's most capable model on general
// release. gpt-6-luna (the few small jobs Anna moved to the cheaper model on
// Oct 18 2026: "switch whatever wont be negatively affected to the cheaper
// one") -> Claude Haiku 5.5.
export const CLAUDE_MODELS = { big: 'claude-fable-5-2', small: 'claude-haiku-5-5' };

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const MIN_MAX_TOKENS = 16000;
const CACHE_MIN_CHARS = 2000; // Claude caches from 512 tokens on these models

export function claudeKey(): string {
  try { return (Deno.env.get('ANTHROPIC_API_KEY') || '').trim(); } catch (_) { return ''; }
}

export function claudeModelFor(openaiModel: any): string {
  const w = currentAiWho();
  const m = String(openaiModel || '').toLowerCase();
  const small = /luna|mini|nano/.test(m);
  if (w.model) return w.model; // owner tests only
  return small ? CLAUDE_MODELS.small : CLAUDE_MODELS.big;
}

// Could any call go to Claude right now? (No key, or a test that forces
// OpenAI: no. Checked first, so nobody is looked up for nothing.)
export function claudeMaybe(): boolean {
  return currentAiWho().provider !== 'openai' && !!claudeKey();
}

// Should this call go to Claude?
export function claudeFor(person: string): boolean {
  const w = currentAiWho();
  if (w.provider === 'openai') return false;
  if (!claudeKey()) return false;
  if (w.provider === 'claude') return true;
  return CLAUDE_EVERYONE || (!!person && CLAUDE_FOR.has(String(person).toLowerCase()));
}

export class ClaudeError extends Error {
  status: number;
  timedOut: boolean;
  constructor(message: string, status = 0, timedOut = false) {
    super(message);
    this.status = status;
    this.timedOut = timedOut;
  }
}

function effortOf(reasoning: any): string {
  const r = String(reasoning || '').toLowerCase();
  if (r === 'high' || r === 'xhigh') return 'high';
  if (r === 'medium') return 'medium';
  if (r === 'low' || r === 'minimal' || r === 'none') return 'low';
  return 'medium';
}

function partsText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p: any) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('');
  return String(content ?? '');
}

// The system prompt as text blocks. A part the caller marked for caching
// (cachePart in aiCost.ts) keeps its mark; otherwise a long system prompt is
// cached up to its end. Claude allows 4 marks at most.
function systemBlocks(messages: any[], extra: string[]): any[] {
  const blocks: any[] = [];
  for (const m of messages) {
    if (!m || (m.role !== 'system' && m.role !== 'developer')) continue;
    if (Array.isArray(m.content)) {
      for (const p of m.content) {
        const text = typeof p === 'string' ? p : String(p?.text ?? '');
        if (!text) continue;
        const b: any = { type: 'text', text };
        if (p && typeof p === 'object' && p.prompt_cache_breakpoint) b.cache_control = { type: 'ephemeral' };
        blocks.push(b);
      }
    } else {
      const text = partsText(m.content);
      if (text) blocks.push({ type: 'text', text });
    }
  }
  if (blocks.length && !blocks.some((b) => b.cache_control)) {
    const total = blocks.reduce((n, b) => n + b.text.length, 0);
    if (total >= CACHE_MIN_CHARS) blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  }
  let marks = 0;
  for (const b of blocks) if (b.cache_control && ++marks > 4) delete b.cache_control;
  for (const t of extra) if (t) blocks.push({ type: 'text', text: t });
  return blocks;
}

function dataUrlParts(url: string): { media: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(url || ''));
  return m ? { media: m[1], data: m[2] } : null;
}

function contentPart(p: any): any {
  if (typeof p === 'string') return { type: 'text', text: p };
  const t = p?.type;
  if (t === 'text' || t === 'input_text' || t === 'output_text') return { type: 'text', text: String(p.text ?? '') };
  if (t === 'image_url' || t === 'input_image') {
    const url = typeof p.image_url === 'string' ? p.image_url : String(p.image_url?.url || p.url || '');
    const d = dataUrlParts(url);
    if (d) return { type: 'image', source: { type: 'base64', media_type: d.media, data: d.data } };
    if (/^https?:\/\//.test(url)) return { type: 'image', source: { type: 'url', url } };
    throw new ClaudeError('image the Claude side cannot send');
  }
  if (t === 'file' || t === 'input_file') {
    const raw = String(p.file?.file_data || p.file_data || '');
    const d = dataUrlParts(raw);
    const media = d?.media || 'application/pdf';
    if (media !== 'application/pdf') throw new ClaudeError('file the Claude side cannot send');
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d ? d.data : raw } };
  }
  throw new ClaudeError(`message part the Claude side cannot send: ${t}`);
}

function turnContent(content: any): any {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(contentPart);
  return String(content ?? '');
}

// Claude takes user and assistant turns only, starting with the person.
function turns(messages: any[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = turnContent(m.content);
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      const a = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
      const b = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
      last.content = [...a, ...b];
    } else {
      out.push({ role: m.role, content });
    }
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '(The conversation so far follows.)' });
  if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: 'Continue.' });
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(body: any, timeoutMs: number): Promise<any> {
  const key = claudeKey();
  if (!key) throw new ClaudeError('no ANTHROPIC_API_KEY');
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = timeoutMs - (Date.now() - started);
    if (left <= 1000) throw new ClaudeError('out of time', 0, true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (ctrl.signal.aborted) throw new ClaudeError('out of time', 0, true);
      if (attempt === 0) { await sleep(800); continue; }
      throw new ClaudeError(`network: ${(e as any)?.message || e}`);
    }
    clearTimeout(timer);
    if (res.ok) return await res.json();
    const text = await res.text().catch(() => '');
    // Busy or a passing fault: one more try if there is time for it.
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt === 0) {
      const after = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 1500, 4000));
      continue;
    }
    throw new ClaudeError(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  throw new ClaudeError('no answer');
}

function textOfAnswer(res: any): string {
  return (Array.isArray(res?.content) ? res.content : [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => String(b.text || ''))
    .join('');
}

// The one JSON object in an answer (a stray code fence or line around it is
// dropped). Throws when there is none, so the call goes to OpenAI instead.
function jsonOnly(text: string): string {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new ClaudeError('answer had no JSON object');
  t = t.slice(a, b + 1);
  JSON.parse(t);
  return t;
}

function usageOf(res: any) {
  const u = res?.usage || {};
  const read = Number(u.cache_read_input_tokens) || 0;
  const write = Number(u.cache_creation_input_tokens) || 0;
  const inp = Number(u.input_tokens) || 0;
  const out = Number(u.output_tokens) || 0;
  return { read, write, inp, out, thinking: Number(u.output_tokens_details?.thinking_tokens) || 0, searches: Number(u.server_tool_use?.web_search_requests) || 0 };
}

const JSON_ONLY = 'Answer with one JSON object and nothing else: no words before or after it and no code fences.';

// chat.completions.create, answered by Claude, returned in OpenAI's shape.
export async function claudeChat(params: any, options: any = {}): Promise<any> {
  if (Array.isArray(params?.tools) && params.tools.length) throw new ClaudeError('chat tools stay on OpenAI');
  const messages = Array.isArray(params?.messages) ? params.messages : [];
  const rf = params?.response_format;
  const wantsJson = rf?.type === 'json_object' || rf?.type === 'json_schema';
  const schema = rf?.type === 'json_schema' ? rf?.json_schema?.schema : null;
  const model = claudeModelFor(params?.model);
  const asked = Number(params?.max_completion_tokens || params?.max_tokens) || 0;
  const timeoutMs = Number(options?.timeout) > 0 ? Number(options.timeout) : 120000;
  const base: any = {
    model,
    max_tokens: Math.min(Math.max(asked, MIN_MAX_TOKENS), 64000),
    messages: turns(messages),
    output_config: { effort: effortOf(params?.reasoning_effort) },
  };
  const stop = params?.stop;
  if (stop) base.stop_sequences = Array.isArray(stop) ? stop : [String(stop)];

  let res: any;
  if (schema) {
    try {
      res = await post({ ...base, system: systemBlocks(messages, []), output_config: { ...base.output_config, format: { type: 'json_schema', schema } } }, timeoutMs);
    } catch (e) {
      // A schema Claude can't compile: ask for the same shape in words instead.
      if (!(e instanceof ClaudeError) || e.status !== 400) throw e;
      res = await post({ ...base, system: systemBlocks(messages, [`${JSON_ONLY} It must match this JSON Schema exactly:\n${JSON.stringify(schema)}`]) }, timeoutMs);
    }
  } else {
    res = await post({ ...base, system: systemBlocks(messages, wantsJson ? [JSON_ONLY] : []) }, timeoutMs);
  }

  const stopReason = String(res?.stop_reason || '');
  if (stopReason === 'refusal') throw new ClaudeError('Claude declined');
  let text = textOfAnswer(res);
  if (!text.trim()) throw new ClaudeError(`empty answer (${stopReason})`);
  if (wantsJson) text = jsonOnly(text);
  const u = usageOf(res);
  return {
    id: res?.id,
    object: 'chat.completion',
    model: String(res?.model || model),
    provider: 'claude',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: stopReason === 'max_tokens' ? 'length' : 'stop',
    }],
    usage: {
      prompt_tokens: u.inp + u.read + u.write,
      completion_tokens: u.out,
      total_tokens: u.inp + u.read + u.write + u.out,
      prompt_tokens_details: { cached_tokens: u.read, cache_write_tokens: u.write },
      completion_tokens_details: { reasoning_tokens: u.thinking },
    },
  };
}

// responses.create (Goals chat and Support Space, both with web search),
// answered by Claude, returned in the shape those callers read: output_text,
// plus usage and one web_search_call per search for the usage count.
export async function claudeResponses(params: any, options: any = {}): Promise<any> {
  const input = params?.input;
  const msgs: any[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : (Array.isArray(input) ? input : []).map((m: any) => ({ role: m?.role === 'assistant' ? 'assistant' : (m?.role === 'system' || m?.role === 'developer' ? 'system' : 'user'), content: m?.content }));
  const sys = [params?.instructions ? { role: 'system', content: String(params.instructions) } : null, ...msgs.filter((m) => m.role === 'system')].filter(Boolean);
  const tools = (Array.isArray(params?.tools) ? params.tools : [])
    .filter((t: any) => /^web_search/.test(String(t?.type || '')))
    .slice(0, 1)
    .map(() => ({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }));
  if ((params?.tools || []).length && !tools.length) throw new ClaudeError('tools stay on OpenAI');
  const model = claudeModelFor(params?.model);
  const asked = Number(params?.max_output_tokens) || 0;
  const timeoutMs = Number(options?.timeout) > 0 ? Number(options.timeout) : 120000;
  const body: any = {
    model,
    max_tokens: Math.min(Math.max(asked, MIN_MAX_TOKENS), 64000),
    system: systemBlocks(sys, []),
    messages: turns(msgs.filter((m) => m.role !== 'system')),
    output_config: { effort: effortOf(params?.reasoning?.effort) },
  };
  if (tools.length) body.tools = tools;
  const started = Date.now();
  let res: any = null;
  const pieces: string[] = [];
  let read = 0, write = 0, inp = 0, out = 0, searches = 0;
  // A long search can stop part-way ("pause_turn"): its answer so far is sent
  // back as it is and Claude carries on, three times at most.
  for (let round = 0; round < 3; round++) {
    res = await post(body, Math.max(1000, timeoutMs - (Date.now() - started)));
    const u = usageOf(res);
    read += u.read; write += u.write; inp += u.inp; out += u.out; searches += u.searches;
    pieces.push(textOfAnswer(res));
    if (res?.stop_reason !== 'pause_turn') break;
    body.messages = [...body.messages, { role: 'assistant', content: res.content }];
  }
  if (String(res?.stop_reason || '') === 'refusal') throw new ClaudeError('Claude declined');
  const text = pieces.join('');
  if (!text.trim()) throw new ClaudeError('empty answer');
  return {
    id: res?.id,
    object: 'response',
    model: String(res?.model || model),
    provider: 'claude',
    output_text: text,
    output: Array.from({ length: searches }, () => ({ type: 'web_search_call' })),
    usage: {
      input_tokens: inp + read + write,
      output_tokens: out,
      input_tokens_details: { cached_tokens: read, cache_write_tokens: write },
    },
  };
}
