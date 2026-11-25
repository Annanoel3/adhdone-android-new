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
//    eased plan, a tracker fold.
// 2. asPerson(email, fn): everything fn does, and nothing after it.
// 3. setAiPerson(email): from that line on, for the rest of this request.
//    Deno carries it across awaits, and also back out of the function that
//    set it (checked Nov 24 2026 on Deno 2.9), so it is used only at the top
//    of each turn of a loop over people (each turn sets its own) or in a
//    request that is about one person only.
// 4. The person signed in to the app who made the request: read from the
//    request's sign-in token. Every function that imports this file has its
//    Deno.serve handler wrapped (below); Base44 is only asked who the token
//    belongs to when an AI call actually needs to know.
// Nobody known: OpenAI, exactly as before. Every request runs in its own,
// fresh context, so one person's request can never see another's (checked
// with four requests at once, Nov 24 2026).
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

export function setAiPerson(email: any): void {
  try {
    const base = aiWho.getStore() || {};
    aiWho.enterWith({ provider: base.provider, model: base.model, email: norm(email) });
  } catch (_) { /* not knowing whose it is only means OpenAI */ }
}

// Owner tests only: send the rest of this request's AI calls to one side
// (provider), and on Claude to one model. Who each call is for still decides
// nothing else.
export function setAiTest(t: { provider?: 'claude' | 'openai'; model?: string }): void {
  try {
    const base = aiWho.getStore() || {};
    aiWho.enterWith({ ...base, ...t });
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

// Wrap Deno.serve once, for every function that imports this file (directly
// or through shared/aiCost.ts): each request runs inside its own context,
// holding who it is for. If the wrap can't be made, nothing changes (every
// call goes to OpenAI as before).
let servePatched = false;
try {
  const D: any = (globalThis as any).Deno;
  if (D && typeof D.serve === 'function' && !D.serve.__aiWho) {
    const original = D.serve;
    const wrapHandler = (h: any) => (req: Request, info: any) => aiWho.run(whoFromRequest(req), () => h(req, info));
    const wrapped: any = function (...args: any[]) {
      const i = args.findIndex((a) => typeof a === 'function');
      if (i >= 0) args[i] = wrapHandler(args[i]);
      else if (args[0] && typeof args[0] === 'object' && typeof args[0].handler === 'function') {
        args[0] = { ...args[0], handler: wrapHandler(args[0].handler) };
      }
      return original.apply(D, args);
    };
    wrapped.__aiWho = true;
    D.serve = wrapped;
    servePatched = true;
  }
} catch (_) {
  servePatched = false;
}

export function aiRouteStatus() {
  return { servePatched, inRequestContext: !!aiWho.getStore() };
}
