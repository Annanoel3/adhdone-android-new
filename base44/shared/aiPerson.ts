// WHO AN AI CALL IS FOR (Nov 24 2026), so it can go to the right AI.
//
// Anna, Nov 24 2026: "Can we change everything over to claude only on mt
// account, run tests, and then make it live for everyone". Every AI call in
// the app goes through lean() (shared/aiCost.ts). lean() asks this file whose
// call it is, and shared/claudeAi.ts decides from that whether it goes to
// Claude (the people in CLAUDE_FOR, or everyone once CLAUDE_EVERYONE is on)
// or to OpenAI as before.
//
// How a call knows whose it is, most precise first:
// 1. The call names them: `ai_person` on the request (lean() takes it off
//    before anything is sent anywhere). Used where the code has the task or
//    the person in hand: a task's own reminder words, the Later break, the
//    eased plan, the planner's look.
// 2. asPerson(email, fn): everything fn does, and nothing after it. Used in
//    loops over people (each person's part runs inside its own).
// 3. setAiPerson(email): the rest of THIS request is that person's. Only in a
//    request that is about one person (one task's completion, one owner's
//    reminder plan).
// 4. The person signed in to the app who made the request, read from the
//    request's sign-in token by aiServe(), which wraps the function's
//    Deno.serve handler. Base44 is only asked who the token belongs to when
//    an AI call actually needs to know.
// Nobody known: OpenAI, exactly as before.
//
// Checked on the platform's own runtime (Deno 1.40.2, aiSwitchCheck probe,
// Nov 24 2026): AsyncLocalStorage.run keeps two requests at once apart;
// enterWith does NOT work there, and Deno.serve can't be replaced (it is
// read-only), so neither is used. Each request gets its own context object
// from aiServe(); setAiPerson writes into that object, so it can never reach
// another request.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

export type AiWho = {
  email?: string;
  resolve?: () => Promise<string>;
  // Owner tests only (aiSwitchCheck): force one side, or one Claude model.
  provider?: 'claude' | 'openai';
  model?: string;
};

export const aiWho = new AsyncLocalStorage<AiWho>();

const norm = (e: any) => String(e || '').trim().toLowerCase();

export function asPerson<T>(email: any, fn: () => T, extra: Partial<AiWho> = {}): T {
  const base = aiWho.getStore() || {};
  return aiWho.run({ provider: base.provider, model: base.model, ...extra, email: norm(email) }, fn);
}

// The rest of this request (or of the asPerson block it is in) is this
// person's. Writes into the request's own context object (from aiServe or
// asPerson); outside one, it does nothing and calls go to OpenAI.
export function setAiPerson(email: any): void {
  try {
    const w = aiWho.getStore();
    if (w) { w.email = norm(email); delete w.resolve; }
  } catch (_) { /* not knowing whose it is only means OpenAI */ }
}

// Owner tests only: send the rest of this request's AI calls to one side
// (provider), and on Claude to one model. Who each call is for still decides
// nothing else.
export function setAiTest(t: { provider?: 'claude' | 'openai'; model?: string }): void {
  try {
    const w = aiWho.getStore();
    if (!w) return;
    if (t.provider) w.provider = t.provider;
    if (t.model) w.model = t.model;
  } catch (_) { /* test settings are only for tests */ }
}

export async function currentPerson(): Promise<string> {
  try {
    const w = aiWho.getStore();
    if (!w) return '';
    if (typeof w.email === 'string') return w.email;
    if (w.resolve) return norm(await w.resolve());
  } catch (_) { /* unknown: OpenAI */ }
  return '';
}

export function currentAiWho(): AiWho {
  return aiWho.getStore() || {};
}

// The email inside a sign-in token, when the token carries one (no Base44
// call needed). The token is not checked here: this only picks which AI
// answers, never who may do what (Base44 checks the token itself).
function emailFromToken(token: string): string {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    for (const k of ['email', 'user_email', 'sub']) {
      const v = norm(json?.[k]);
      if (v.includes('@')) return v;
    }
  } catch (_) { /* not a token we can read */ }
  return '';
}

function whoFromRequest(req: Request): AiWho {
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return {};
    const token = auth.slice(7).trim();
    const email = emailFromToken(token);
    if (email) return { email };
    let asked: Promise<string> | null = null;
    return {
      resolve: () => (asked ||= Promise.resolve()
        .then(() => createClientFromRequest(req))
        .then((c: any) => c.auth.me())
        .then((u: any) => norm(u?.email))
        .catch(() => '')),
    };
  } catch (_) {
    return {};
  }
}

// Wraps a function's Deno.serve handler: each request runs in its own fresh
// context, holding who it is for (from its sign-in token, if it has one).
//   Deno.serve(aiServe(async (req) => { ... }));
export function aiServe<H extends (req: Request, info?: any) => any>(handler: H): H {
  return ((req: Request, info?: any) => aiWho.run(whoFromRequest(req), () => handler(req, info))) as H;
}

export function aiRouteStatus() {
  return { inRequestContext: !!aiWho.getStore() };
}
