// Sorts what a person finished (and the events and birthdays that happened)
// into areas of life, for the "areas of life" bubbles on the Insights page
// (src/components/progress/LifeAreasCard.jsx). The answer is saved on each
// task as Task.life_category.
//
// The model judges, the way a human assistant who knows the person would: no
// keyword lists (Anna's rule for every prompt in this app), on gpt-6-astra like
// every judgment made for users. What the person wrote about themselves
// (User.about_me) goes with every call, so a nurse's "chart notes" is work.
//
// Which tasks count ("happened" in the last `days` days), the same rule as the
// card: finished tasks (completed_at in range, steps included), events whose
// time is in range and already past (not cancelled), and birthdays whose day
// fell in range (Task.next_reminder is the birthday; once it has rolled over
// to next year, a year back is this year's). Only ones with no life_category
// yet: running it twice never re-sorts anything.
//
// Writes ONLY life_category, one task at a time. That field is not in the
// "Reschedule OneSignal on Task Edit" trigger list, so these writes set off no
// reminder work (onTaskUpdate never runs for them). Keep it out of that list.
//
// Body:
//   { days?: 1..90 (default 30) }                → sorts the caller's tasks
//                                                   → { sorted, remaining }
//   { days?, dry_run: true }                      → same model call, nothing
//                                                   written; the would-be
//                                                   changes with titles
//   { dry_run: true, samples: ["title", ...] }    → admin only: sorts the
//                                                   strings as task titles
//                                                   (self-test), max 80
//   { all_users: true, days?, skip?, dry_run? }   → admin only: everyone active
//                                                   in the last `days` days, one
//                                                   person at a time, stops after
//                                                   ~4 minutes → { done: false,
//                                                   users_done, next_skip }; call
//                                                   again with skip: next_skip
//
// Logs counts only, never titles.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import OpenAI from "npm:openai";
import { lean } from '../../shared/aiCost.ts';
import { secrets } from "base44:runtime";

const AREAS = ['work', 'home', 'health', 'family_friends', 'money', 'errands', 'self_care', 'pets'];
const AREA_SET = new Set<string>(AREAS);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const BATCH = 80;                // items per model call
const MODEL_CALLS_AT_ONCE = 4;
const CAP_PER_CALL = 300;        // tasks sorted per person on a normal call
const CAP_PER_PERSON_ALL = 2000; // per person on an all_users run (time-bounded)
const WRITES_AT_ONCE = 5;
// all_users: no new person or model call starts after this, so a run that
// started one just before it still wraps up at about 4 minutes.
const ALL_USERS_BUDGET_MS = 200 * 1000;
const MAX_SAMPLES = 80;
const DRY_RUN_ROWS_PER_PERSON = 200;

const SYSTEM = `You help an ADHD planner app show a person which areas of their life their time went to. You get things from their list that they finished or that happened (tasks, events, birthdays). Sort each one into the area of life it belonged to, the way a thoughtful personal assistant who knows this person would: think about what the thing really was in their life and pick the one area it fits best. Use judgment, not word matching.

The areas, by key:
- work: paid work, their job, career or business, and school or studying
- home: cleaning, chores, repairs, the house or yard, cooking for the home
- health: doctors, medications, therapy, exercise, sleep, caring for their body and mind
- family_friends: the people in their life: kids, partner, family, friends, birthdays, social plans, calls and texts to people
- money: bills, banking, taxes, insurance, budgeting, and shopping decisions that are about money
- errands: going places to pick up, drop off or buy things, and appointments that are only logistics
- self_care: rest, hobbies, fun, personal growth, things just for them
- pets: animals they care for

Lean on what you know about this particular person. What they told the app about themselves can change what an item means: for a nurse, "chart notes" is work. The app's own work/personal label on an item, when there is one, came from the same kind of context and is a useful hint, not a rule. When an item could fit more than one area, choose the one this person would most likely say it was about. Every item gets exactly one area, even when you are unsure.

Each item comes as one JSON object per line: "id" (answer with it exactly), "title", sometimes "said" (their own words when they added it), "label" (the app's work/personal label) and "kind" (event, birthday, a pet's birthday, or bill).

Answer with JSON only, in this shape: {"areas": {"<id>": "<area key>"}}, one entry for every item, using only the eight area keys above.`;

const clip = (s: any, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const ms = (iso: any) => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
};

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const x = items[i++];
      await fn(x);
    }
  });
  await Promise.all(workers);
}

function clampDays(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.min(Math.max(1, Math.round(n)), MAX_DAYS);
}

// When a birthday's day was, for the year it last came round: next_reminder is
// the birthday itself, and it rolls over to next year once the day is past.
function birthdayDayMs(t: any, nowMs: number): number {
  const at = ms(t?.next_reminder || t?.due_date || t?.event_time);
  if (!Number.isFinite(at)) return NaN;
  const d = new Date(at);
  for (let i = 0; i < 3 && d.getTime() > nowMs; i++) d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.getTime();
}

// When the task "happened" inside [sinceMs, nowMs], or NaN when it didn't.
// The same rule as happenedAt in LifeAreasCard.jsx: change both together.
function happenedAt(t: any, sinceMs: number, nowMs: number): number {
  if (!t || t.status === 'cancelled') return NaN;
  const inRange = (x: number) => Number.isFinite(x) && x >= sinceMs && x <= nowMs;
  if (t.status === 'completed') {
    const done = ms(t.completed_at);
    if (inRange(done)) return done;
  }
  if (t.classification === 'event') {
    const at = ms(t.event_time);
    if (inRange(at)) return at;
  }
  if (t.birthday_person) {
    const day = birthdayDayMs(t, nowMs);
    if (inRange(day)) return day;
  }
  return NaN;
}

// Every task of this person's that happened in the window and isn't sorted
// yet, most recent first.
async function unsortedTasks(entity: any, email: string, sinceMs: number, nowMs: number): Promise<any[]> {
  const sinceIso = new Date(sinceMs).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const [done, events, birthdays] = await Promise.all([
    entity.filter({ created_by: email, status: 'completed', completed_at: { $gte: sinceIso } }, '-completed_at', 2000),
    entity.filter({ created_by: email, classification: 'event', event_time: { $gte: sinceIso, $lte: nowIso } }, '-event_time', 1000),
    entity.filter({ created_by: email, birthday_person: { $nin: [null, ''] } }, '-created_date', 1000),
  ]);
  const byId = new Map<string, any>();
  for (const t of [...(done || []), ...(events || []), ...(birthdays || [])]) {
    if (t?.id && !byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()]
    .map((t) => ({ t, at: happenedAt(t, sinceMs, nowMs) }))
    .filter(({ t, at }) => Number.isFinite(at) && !AREA_SET.has(String(t.life_category || '')))
    .sort((a, b) => b.at - a.at)
    .map(({ t }) => t);
}

// What the model sees about one task: facts only.
function itemFor(t: any) {
  const item: any = { title: clip(t.title, 200) };
  const said = clip(t.original_input, 200);
  if (said && said.toLowerCase() !== item.title.toLowerCase()) item.said = said;
  if (t.life_area === 'work' || t.life_area === 'personal') item.label = t.life_area;
  const kind = t.birthday_person
    ? (t.birthday_animal ? "a pet's birthday" : 'birthday')
    : t.classification === 'event' ? 'event'
    : t.classification === 'payment' ? 'bill'
    : '';
  if (kind) item.kind = kind;
  return item;
}

// One model call for up to BATCH items. Returns ref -> area, valid areas only.
async function sortBatch(openai: any, about: string, items: any[]): Promise<Record<string, string>> {
  const aboutLine = about
    ? `What this person told the app about themselves, in their own words: ${JSON.stringify(about)}`
    : "This person hasn't told the app anything about themselves.";
  const lines = items.map((it) => JSON.stringify(it)).join('\n');
  const completion = await openai.chat.completions.create({
    model: 'gpt-6-astra',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${aboutLine}\n\nItems:\n${lines}` },
    ],
    response_format: { type: 'json_object' },
    reasoning_effort: 'low',
    max_completion_tokens: 8000,
  });
  const out = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
  const areas = out?.areas && typeof out.areas === 'object' ? out.areas : {};
  const result: Record<string, string> = {};
  for (const it of items) {
    const v = String(areas[it.id] ?? '').trim().toLowerCase();
    if (AREA_SET.has(v)) result[it.id] = v;
  }
  return result;
}

// Sorts the given tasks with the model, BATCH at a time, a few calls at once.
// Stops starting new calls after `deadline`. Returns task id -> area.
async function judge(openai: any, about: string, tasks: any[], deadline: number): Promise<{ picked: Map<string, string>; cut: boolean }> {
  const picked = new Map<string, string>();
  const batches = chunk(tasks, BATCH);
  let cut = false;
  for (let i = 0; i < batches.length; i += MODEL_CALLS_AT_ONCE) {
    if (Date.now() > deadline) { cut = true; break; }
    const group = batches.slice(i, i + MODEL_CALLS_AT_ONCE);
    const results = await Promise.all(group.map(async (batch) => {
      const items = batch.map((t, j) => ({ id: `t${j + 1}`, ...itemFor(t) }));
      try {
        const got = await sortBatch(openai, about, items);
        return batch.map((t, j) => [t.id, got[`t${j + 1}`]] as [string, string | undefined]);
      } catch (e) {
        console.error(`[sortLifeAreas] model call failed for a batch of ${batch.length}:`, (e as any)?.message || e);
        return [] as [string, string | undefined][];
      }
    }));
    for (const rows of results) for (const [id, area] of rows) if (area) picked.set(id, area);
  }
  return { picked, cut };
}

// The whole job for one person. Writes through `entity` (the caller's own
// client, or the service role on an all_users run).
async function sortPerson(openai: any, entity: any, email: string, about: string, opts: {
  sinceMs: number; nowMs: number; dryRun: boolean; cap: number; deadline: number;
}) {
  const unsorted = await unsortedTasks(entity, email, opts.sinceMs, opts.nowMs);
  const todo = unsorted.slice(0, opts.cap);
  const { picked, cut } = todo.length ? await judge(openai, about, todo, opts.deadline) : { picked: new Map<string, string>(), cut: false };

  let written = 0;
  let failed = 0;
  if (!opts.dryRun && picked.size) {
    await pool([...picked.entries()], WRITES_AT_ONCE, async ([id, area]) => {
      try {
        await entity.update(id, { life_category: area });
        written++;
      } catch (e) {
        failed++;
        console.error('[sortLifeAreas] write failed:', (e as any)?.message || e);
      }
    });
  }
  const sorted = opts.dryRun ? picked.size : written;
  const changes = opts.dryRun
    ? todo.filter((t) => picked.has(t.id)).map((t) => ({
      id: t.id,
      title: t.title || '',
      field: 'life_category',
      from: t.life_category ?? null,
      to: picked.get(t.id),
    }))
    : [];
  return {
    found: unsorted.length,
    sorted,
    failed,
    remaining: Math.max(0, unsorted.length - sorted),
    cut: cut || unsorted.length > opts.cap,
    changes,
  };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (_) {
      user = null;
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body: any = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const days = clampDays(body?.days);
    const nowMs = Date.now();
    const sinceMs = nowMs - days * DAY_MS;
    const isAdmin = user.role === 'admin';
    const openai = lean(new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') }), { name: 'sortLifeAreas' });

    // Self-test: strings sorted as if they were task titles. Nothing is read or written.
    if (body?.samples !== undefined) {
      if (!dryRun) return Response.json({ error: 'samples only work with dry_run: true' }, { status: 400 });
      if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const samples = Array.isArray(body.samples) ? body.samples.map((s: any) => clip(s, 200)).filter(Boolean) : [];
      if (samples.length === 0) return Response.json({ error: 'samples must be a list of strings' }, { status: 400 });
      if (samples.length > MAX_SAMPLES) return Response.json({ error: `at most ${MAX_SAMPLES} samples` }, { status: 400 });
      const about = typeof body.about === 'string' ? clip(body.about, 600) : '';
      const items = samples.map((title: string, j: number) => ({ id: `t${j + 1}`, title }));
      const got = await sortBatch(openai, about, items);
      const pairs: Record<string, string | null> = {};
      items.forEach((it: any) => { pairs[it.title] = got[it.id] || null; });
      console.log(`[sortLifeAreas] samples: ${items.length} sent, ${Object.keys(got).length} sorted`);
      return Response.json({ dry_run: true, samples: pairs });
    }

    // Everyone active in the window, one person at a time.
    if (body?.all_users === true) {
      if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const started = Date.now();
      const deadline = started + ALL_USERS_BUDGET_MS;
      const skip = Math.max(0, Math.floor(Number(body?.skip) || 0));
      // Oldest account first: a stable order, so `skip` means the same people
      // from one call to the next.
      const active = (await base44.asServiceRole.entities.User.filter(
        { last_active_at: { $gte: new Date(sinceMs).toISOString() } }, 'created_date', 5000,
      )) || [];
      const people = active.filter((u: any) => u?.email);
      let usersDone = 0;
      let sorted = 0;
      let remaining = 0;
      let failed = 0;
      const perUser: any[] = [];
      let stopped = false;
      for (let i = skip; i < people.length; i++) {
        if (Date.now() > deadline) { stopped = true; break; }
        const u = people[i];
        const r = await sortPerson(openai, base44.asServiceRole.entities.Task, u.email, clip(u.about_me, 600), {
          sinceMs, nowMs, dryRun, cap: CAP_PER_PERSON_ALL, deadline,
        });
        sorted += r.sorted;
        failed += r.failed;
        if (dryRun && r.found > 0) {
          perUser.push({
            email: u.email,
            would_sort: r.sorted,
            remaining: r.remaining,
            changes: r.changes.slice(0, DRY_RUN_ROWS_PER_PERSON),
            changes_cut: r.changes.length > DRY_RUN_ROWS_PER_PERSON,
          });
        }
        // Cut off by the clock part-way through this person: they're picked up
        // again (only their unsorted tasks) on the next call.
        if (r.cut && Date.now() > deadline) { stopped = true; break; }
        remaining += r.remaining;
        usersDone++;
      }
      const nextSkip = skip + usersDone;
      const done = !stopped && nextSkip >= people.length;
      console.log(`[sortLifeAreas] all_users${dryRun ? ' (dry run)' : ''}: ${usersDone} people, ${sorted} sorted, ${remaining} left, ${failed} writes failed, ${done ? 'done' : `next_skip ${nextSkip}`}`);
      return Response.json({
        done,
        users_done: usersDone,
        next_skip: done ? null : nextSkip,
        users_total: people.length,
        sorted,
        remaining,
        ...(failed ? { write_failures: failed } : {}),
        ...(dryRun ? { dry_run: true, per_user: perUser } : {}),
      });
    }

    // The caller's own tasks.
    // CAP_PER_CALL is 4 batches, all sent at once, so no deadline is needed.
    const r = await sortPerson(openai, base44.entities.Task, user.email, clip(user.about_me, 600), {
      sinceMs, nowMs, dryRun, cap: CAP_PER_CALL, deadline: Infinity,
    });
    console.log(`[sortLifeAreas] ${dryRun ? 'dry run: ' : ''}${r.found} unsorted, ${r.sorted} sorted, ${r.remaining} left${r.failed ? `, ${r.failed} writes failed` : ''}`);
    if (dryRun) return Response.json({ dry_run: true, days, sorted: r.sorted, remaining: r.remaining, changes: r.changes });
    return Response.json({ sorted: r.sorted, remaining: r.remaining });
  } catch (error) {
    console.error('[sortLifeAreas] Error:', (error as any)?.message || error);
    return Response.json({ error: String((error as any)?.message || error) }, { status: 500 });
  }
}
