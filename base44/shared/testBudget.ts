// THE DAILY CAP ON WHAT TEST RUNS MAY SPEND (Anna, Nov 20 2026: "Cap it").
//
// Why it exists. OpenAI gives the app about 1 million free tokens a day (the
// "complimentary daily tokens" for the project that shares its traffic), and
// the app's own use takes nearly all of them. So every token a TEST uses is a
// token over the free line, billed at full list price. Nov 13 to 19 2026:
// about $27 of the week's $29.71 came from test runs by Claude sessions
// (parser self-tests, one sorter check). One of them, 221 sorter calls on
// Nov 18 that Anna had been told would be "about 15, under 10 cents", used
// half of the next day's free tokens; ordinary use was billed from then on
// and the prepaid balance ran out: every AI feature was down for everyone
// from about 1:10 PM to 4:00 PM CST on Nov 19. RULES.md already said to tell
// her the cost first. A rule did not stop it. This does.
//
// How it works. Every test mode that calls the model asks testGate() first
// with how many model calls the run will make. The run is priced at list
// price from what a call of that kind really uses (TEST_CENTS), added to
// what test runs have already booked today (Central time), and REFUSED when
// the day would pass TEST_DAILY_CAP_CENTS. An allowed run is written down
// before it starts (AppEvent "ai_test_run": tool, calls, cents; never any
// words), so the next ask sees it. { "ai": true } to ownerFirstDays shows
// each day's test runs.
//
// Going past the cap takes Anna's yes, in her own words, for that run:
// { "anna_approved_cents": N } lifts the day's ceiling to N cents for that
// one request and is written into its row. NEVER send it without her yes.
// The cap itself changes only when she says so.
//
// What it cannot see: a function run by hand from the editor's Test Function
// with an ordinary payload (one picture read, one task parse) looks like the
// app using it. Those are single calls; the modes that run many are all
// behind this gate.
//
// CLAUDE TESTS (Nov 24 2026, the switch to Claude; Anna: "run tests, and then
// make it live for everyone"). A test run that an owner sends to Claude on
// purpose (shared/aiPerson.ts setAiTest, provider "claude") is paid from the
// $200 a month of Claude API credits that come with Anna's plan, not from
// money: it is booked on its own count (props.provider "claude") against its
// own day's limit, CLAUDE_TEST_DAILY_CAP_CENTS, and does not use up the $1
// OpenAI cap. Priced at the same OpenAI list cents (Claude Fable 5.2 costs
// less per token than gpt-6-astra, so this over-counts).
import { filterAll } from './listAll.ts';
import { currentAiWho } from './aiPerson.ts';

export const TEST_DAILY_CAP_CENTS = 100;
export const CLAUDE_TEST_DAILY_CAP_CENTS = 500;

// Cents per model call at list price (gpt-6-astra: $10 input, $12.50 cache
// write, $1 cached input, $50 output, per million tokens; OpenAI's pricing
// page, Nov 20 2026), from what each kind of call used Nov 14 to 20 2026 in
// the app's own count (AppEvent ai_usage), rounded up.
export const TEST_CENTS: Record<string, number> = {
  sorter: 2.5,  // checkTaskCategory: about 1,600 tokens in, 110 out
  parser: 9,    // runTaskParse: about 7,600 in at full price, 250 out
  rename: 10,   // parseTask renameTry: a short look, then a parse when it finds something
  // 14 since Nov 22 2026 (it was 9, from the average look across everyone):
  // owner looks are run on the fullest account, and 5 of them that night
  // came to 13.8 cents each in the app's own count (about 9,480 tokens in, of
  // which 6,460 written to the cache and 3,010 read from it, and 1,080 out).
  planner: 14,  // cronSmartTaskNudge: one look (a preview that asks the model, or "re-plan now")
  steps: 0.5,   // checkSubtasks
  tracker: 1.5, // the look at a Parking Lot idea (captureText judge_test): about 1,000 tokens in, 40 out
  goal: 6,      // goalPlannerChat self-test: one model call per request
};

const ZONE = 'America/Chicago';
const dayOf = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const msOf = (v: unknown) => {
  const s = String(v || '');
  return s ? Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : NaN;
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

// What test runs have booked so far today (Central time). null = the count
// could not be read.
export async function testRunsToday(base44: any, nowMs = Date.now(), provider: 'openai' | 'claude' = 'openai'): Promise<{ cents: number; runs: number } | null> {
  try {
    const since = new Date(nowMs - 30 * 60 * 60 * 1000).toISOString();
    const rows = await filterAll(base44.asServiceRole.entities.AppEvent, { event: 'ai_test_run', created_date: { $gte: since } });
    const today = dayOf(nowMs);
    let cents = 0;
    let runs = 0;
    for (const r of rows || []) {
      const ms = msOf(r?.created_date);
      if (!Number.isFinite(ms) || dayOf(ms) !== today) continue;
      if ((r?.props?.provider === 'claude' ? 'claude' : 'openai') !== provider) continue;
      cents += Number(r?.props?.cents) || 0;
      runs++;
    }
    return { cents: round1(cents), runs };
  } catch (_) {
    return null;
  }
}

type Gate =
  | { ok: true; spend: { this_run: string; today_so_far: string; cap: string } }
  | { ok: false; refusal: { error: string; message: string; this_run?: string; today_so_far?: string; cap?: string } };

// Ask before a test run. tool: a key of TEST_CENTS. calls: how many model
// calls the run will make. body: the request (for anna_approved_cents).
// It fails closed: when today's count can't be read, or the run can't be
// written down, nothing runs.
export async function testGate(base44: any, tool: string, calls: number, body: any): Promise<Gate> {
  const each = TEST_CENTS[tool] ?? 10;
  const n = Math.max(1, Math.floor(Number(calls) || 1));
  const cost = round1(each * n);
  const approved = Math.max(0, Math.floor(Number(body?.anna_approved_cents) || 0));
  const onCredits = currentAiWho().provider === 'claude';
  const cap = Math.max(onCredits ? CLAUDE_TEST_DAILY_CAP_CENTS : TEST_DAILY_CAP_CENTS, approved);
  const sofar = await testRunsToday(base44, Date.now(), onCredits ? 'claude' : 'openai');
  if (!sofar) {
    return { ok: false, refusal: { error: 'TEST CAP', message: "Today's test runs could not be read, so nothing was run. Try again." } };
  }
  if (sofar.cents + cost > cap + 1e-6) {
    return {
      ok: false,
      refusal: {
        error: 'TEST CAP',
        message: `Nothing was run. This run is ${n} model call${n === 1 ? '' : 's'}, about ${money(cost)} at list price. Test runs today have booked ${money(sofar.cents)} of the ${money(cap)} daily cap. Make the run smaller, or tell Anna the dollar figure and what it proves; only with her yes, send it again with "anna_approved_cents".`,
        this_run: money(cost),
        today_so_far: money(sofar.cents),
        cap: money(cap),
      },
    };
  }
  try {
    await base44.asServiceRole.entities.AppEvent.create({
      event: 'ai_test_run',
      props: { tool, calls: n, cents: cost, day: dayOf(Date.now()), ...(onCredits ? { provider: 'claude' } : {}), ...(approved ? { approved_cents: approved } : {}) },
    });
  } catch (_) {
    return { ok: false, refusal: { error: 'TEST CAP', message: 'This run could not be written down, so nothing was run. Try again.' } };
  }
  return { ok: true, spend: { this_run: money(cost), today_so_far: money(round1(sofar.cents + cost)), cap: money(cap) } };
}
