// Goals planner (ported Oct 31 2026 from Anna's Goals app, function of the
// same name; what was copied, adapted and dropped is in GOALS_PORT.md).
//
// Same conversation, same questions, same plan shape as the Goals app. What
// changed: every model call is gpt-6-astra through OpenAI (RULES.md §1; the
// Goals app used gpt-4o, gpt-4o-mini and Base44's InvokeLLM for web search —
// web search is now OpenAI's own web_search tool, as in supportSpaceChat), and
// the prompts no longer ask for or promise reminders: ADHDone reminds people
// only through its own system (the step goes on their task list; Smart
// Reminders and times they set do the rest). No notification schedule is
// generated or saved.
//
// Body:
//   { messages, mode: 'chat', goal_id?, city?, tz? }    → { message, action, goal_id?, month_titles }
//   { messages, mode: 'extract_plan', tz? }             → { plan }  (nothing saved; the app saves)
//   { messages, mode: 'apply_edit', goal_id, tz? }      → replaces the goal's not-completed steps
//   admin only: { selftest: true, goal: "<text>", answers: ["...", ...], tz? }
//     runs the planner on a sample goal (its questions answered from `answers`,
//     in order) through to the full plan and its extraction, and returns them.
//     Reads and writes nothing.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import OpenAI from "npm:openai";
import { lean } from '../../shared/aiCost.ts';
import { stepDueDate } from '../../shared/goalPlan.ts';
import { secrets } from "base44:runtime";

const MODEL = 'gpt-6-astra';
// The platform stops a function after a few minutes; the plan is never left
// half-sent. No new continuation pass starts once this much time has gone.
const CHAT_BUDGET_MS = 230 * 1000;

// ──────────────────────────────────────────────────────────────────────────
// Shared, reusable rule blocks (word for word from the Goals app unless noted).
// ──────────────────────────────────────────────────────────────────────────

const NO_GROUPING_RULE = `WRITE EVERY MONTH IN FULL — NO GROUPING. This is the single most important rule.
- Generate every month from Month 1 to the final month, in sequence, with no gaps.
- Every month is its own section with the SAME detail as Month 1: a "**Month N — Title**" line, then "**Week 1**" through "**Week 4**", each followed by specific "- task" bullets.
- NEVER combine or use ranges for months or weeks. "Month 9-12", "Months 3-6", "Week 1-2", "Weeks 5-6" are all forbidden — one section per single month, one block per single week.
- NEVER write a placeholder or summary for later months. Phrases like "Months 4-15: titles TBD", "I'll continue selecting books", "book titles to be determined", "(repeat for the remaining months)", "subsequent months follow the same pattern", or "for the rest of the months" are CRITICAL FAILURES.
- If you are running low on space, shorten each individual task — but NEVER collapse months together. Detail per month wins over padding; completeness of every month is non-negotiable.`;

const NO_FABRICATION_RULE = `NO FABRICATED FACTS. Use the web_search tool before stating any specific fact you are not 100% certain of — chapter/page counts, prices, calorie or macro numbers, hardiness zones, interest rates, dosages, statistics, or any measurable claim. If search is unavailable, hedge ("generally", "typically", "many people find") instead of presenting a guess as fact. Applies to every goal type.`;

// The Goals app gave these as its web_search tool's description; ADHDone's
// web_search is OpenAI's built-in tool, which takes no description, so the
// same guidance is given here instead.
const WEB_SEARCH_RULE = `WEB SEARCH. You have a web_search tool for current, accurate information. MANDATORY USE CASES: (1) Any reading/book goal — search for the exact chapter count and page count of EVERY specific book before assigning weekly reading ranges. Never guess chapter counts. (2) Any purchase/savings goal — search for current prices. (3) Any factual claim you are not 100% certain of. Do NOT fabricate facts, chapter counts, prices, or URLs.`;

const NO_REPEAT_RULE = `NEVER RECOMMEND ALREADY-USED ITEMS. Before adding any book, resource, app, or activity, scan the ENTIRE conversation (including any original planning conversation) for anything the user said they already read, watched, tried, liked, enjoyed, or disliked. "I liked/enjoyed X" means they already experienced X. Every such item is permanently banned from the whole plan — not Month 1, not Month 9, not as a bonus resource.`;

const RESPECT_CONSTRAINTS_RULE = `RESPECT "LESS X" CONSTRAINTS. If the user said anything like "less X", "fewer X", "not so much X", "too many X", "cut back on X" (where X is any genre, activity, topic, exercise, food, or skill), cap it hard: "less/fewer X" → at most 1 instance in the entire plan; "way less / too much X" → 0–1; "no X / remove X" → zero. "I like X" is general interest, NOT a request for more of it — the explicit limit always wins. Count instances before sending and revise if over.`;

const TIME_MAPPING_RULE = `TIME-OF-DAY MAPPING. "morning/early" → 06:00–07:00, "afternoon/midday" → 12:00–14:00, "evening/late afternoon" → 18:00–19:00, "night/late evening" → 20:00–21:00. If the user gave an exact time (e.g. "6pm", "7:30am"), use it. Never map "evening" to 1 PM.`;

const READING_GOAL_RULE = `READING/BOOK GOALS. Never guess or invent chapter or page counts. MONTH TITLES must be the real book title only (e.g. "A Court of Thorns and Roses") — NEVER write placeholder text like "Book Recommendation from Search (e.g., ...)" or "Book TBD" or any parenthetical example as the month title. If you used web_search to find a book, put only the final chosen title in the month heading. Use web_search to look up the exact chapter count of EVERY specific book before splitting it into weekly chunks; divide evenly (total chapters ÷ 4 = chapters per week, balanced across all 4 weeks; if no chapters, use total pages ÷ 4). Assign a real, specific book title to every month — never "Book Title", "TBD", or a generic genre label. NO SPOILERS: a week's resource must match where the reader currently is — never a full-book/whole-plot summary, ending explainer, or review that reveals later events. Prefer spoiler-free aids (author background, "how to read X", character/vocabulary primers) or summaries explicitly limited to the chapters already assigned; if unsure a link is spoiler-free, omit it.`;

const WEEK_DETAIL_RULE = `WEEK DEPTH — every week must be RICH, never a bare one-liner. A week that just says "Read Chapters 1–5" or "Practice scales" is a CRITICAL FAILURE. Each week needs ~3–6 bullets that actually give the user something to do AND think about:
  • The concrete action/chunk for the week (the exact chapters, the exercises with sets/reps, the specific vocabulary set, etc.).
  • What to focus on or notice while doing it, tied to the REAL content — for a book, the actual themes, characters, conflicts, or arguments in those specific chapters; for fitness, form cues and what should feel hard; for language, the specific structures in play.
  • A reflection / thinking prompt: 1–2 concrete questions that make the user engage with the material (e.g. "How does Okonkwo's reaction in Ch 4 reflect the theme of masculinity and fear? Jot 3–4 sentences.").
  • A practice / application / discussion activity (journal entry, a short exercise, summarize a passage in your own words, connect it to last week, apply it to your own life, or a question to discuss with someone).
  • Optionally a relevant resource (follow the link rules).
For reading/book goals: use web_search to learn what those exact chapters are actually about, then build the focus points, reflection prompts, and activities around the real themes and plot — not generic "think about what you read" filler.`;

const RESOURCE_LINK_RULE = `RESOURCE LINKS — a broken link is worse than no link. Never guess article/blog URLs or invent paths. Use only safe search-style URLs with REAL terms: https://www.youtube.com/results?search_query=…, https://www.amazon.com/s?k=Title+Author, https://www.google.com/search?q=…, Udemy/Coursera search URLs, or a root domain you are 100% sure of. No Google Maps links. No placeholder words (TOPIC, CITY, AUTHOR) inside URLs. If no real URL exists, leave it blank and put the actionable detail in the description.`;

// ADHDone only (the Goals app sent its own goal notifications; ADHDone does
// not). Facts about the app, so the planner never promises what won't happen.
const APP_RULE = `THIS APP. You are the goal planner inside ADHDone, a task app for people with ADHD. When a plan is saved, the step the user is on goes on their ADHDone task list (the next one appears when they finish it), and a daily habit becomes one repeating task on the days and at the time they chose. Neither you nor the app sends goal check-ins, summaries, pep talks or messages of any kind: never promise reminders, check-ins, notifications or messages (no "I'll check in every Monday", no "you'll get a reminder", no "I'll send you"). Plan steps never mention reminders or notifications.`;

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers for the plan-completeness safety net (verbatim from the Goals app).
// ──────────────────────────────────────────────────────────────────────────

const MONTH_HEADER_RE = /^\s*#{0,4}\s*\*{0,2}\s*Month\s+(\d+)\b/i;
const MONTH_RANGE_RE = /Months\s+\d+\s*(?:[-–—]|to|through|&|,)\s*\d+|Month\s+\d+\s*-\s*\d+|Month\s+\d+\s+(?:to|through)\s+\d+/i;
const DEFERRAL_RE = /continue\s+(?:to\s+)?(?:select|choose|selecting|choosing|picking)\b|(?:titles?|books?)\s+(?:are\s+)?(?:tbd|to\s+be\s+determined)|\bTBD\b|for\s+the\s+(?:rest|remainder)\s+of\s+(?:the\s+)?(?:months|year|plan|timeline)|subsequent\s+months|remaining\s+months\s+(?:will|to|follow)|repeat\s+(?:this\s+)?(?:for\s+)?(?:every|each)\s+(?:remaining\s+)?month/i;
const isPlaceholderLine = (ln: string) => MONTH_RANGE_RE.test(ln) || DEFERRAL_RE.test(ln);

function analyzePlan(text: string) {
  const lines = text.split('\n');
  const headerIdx: Record<number, number> = {};
  let maxPresent = 0, maxMentioned = 0, firstHeaderIdx = -1;

  lines.forEach((ln, i) => {
    if (MONTH_RANGE_RE.test(ln)) {
      const nums = ((ln.match(MONTH_RANGE_RE) as RegExpMatchArray)[0].match(/\d+/g) || []).map(Number).filter((x) => x >= 1 && x <= 36);
      if (nums.length) maxMentioned = Math.max(maxMentioned, ...nums);
    }
    const m = ln.match(MONTH_HEADER_RE);
    if (m && !MONTH_RANGE_RE.test(ln)) {
      const n = parseInt(m[1], 10);
      if (!(n in headerIdx)) headerIdx[n] = i;
      if (firstHeaderIdx === -1) firstHeaderIdx = i;
      maxPresent = Math.max(maxPresent, n);
      maxMentioned = Math.max(maxMentioned, n);
    }
  });

  const sectionEnd = (startIdx: number) => {
    for (let k = startIdx + 1; k < lines.length; k++) {
      const isHeader = MONTH_HEADER_RE.test(lines[k]) && !MONTH_RANGE_RE.test(lines[k]);
      if (isHeader || isPlaceholderLine(lines[k])) return k;
    }
    return lines.length;
  };
  const hasContent = (startIdx: number) => {
    const end = sectionEnd(startIdx);
    for (let k = startIdx + 1; k < end; k++) { if (lines[k].trim() && !isPlaceholderLine(lines[k])) return true; }
    return false;
  };

  let contig = 0;
  for (let M = 1; (M in headerIdx) && hasContent(headerIdx[M]); M++) contig = M;

  let rangePresent = false, groupingPresent = false;
  if (firstHeaderIdx >= 0) {
    for (let k = firstHeaderIdx; k < lines.length; k++) {
      if (MONTH_RANGE_RE.test(lines[k])) { rangePresent = true; groupingPresent = true; break; }
      if (DEFERRAL_RE.test(lines[k])) groupingPresent = true;
    }
  }

  return { lines, headerIdx, maxPresent, maxMentioned, contig, rangePresent, groupingPresent, firstHeaderIdx, sectionEnd };
}

// Parse an already-written plan (markdown) into weeks + month titles — no AI.
function parsePlanWeeks(text: string) {
  const lines = text.split('\n');
  const monthTitles: Record<number, string> = {};
  const registry: Record<string, any> = {};
  const weeks: any[] = [];
  let curMonth: number | null = null, curWeek: any = null, awaitingSubtitle = false;

  const monthRe    = /^#{0,4}\s*\*{0,2}\s*Month\s+(\d+)\b\s*(?:\*{0,2}\s*[-–—:]\s*(.*\S))?\s*$/i;
  const weekRe     = /^#{0,4}\s*\*{0,2}\s*Week\s+(\d+)\b\s*(?:\*{0,2}\s*[-–—:]\s*(.*\S))?\s*$/i;
  const combinedRe = /^#{0,4}\s*\*{0,2}\s*Month\s+(\d+)\s*[,\s]\s*Week\s+(\d+)\b/i;
  const rangeRe    = /Months?\s+\d+\s*(?:[-–—]|to|through|&)\s*\d+/i;
  const bulletRe   = /^(?:[-•*]\s+|\d+\.\s+)(.+\S)\s*$/;
  const dateOnlyRe = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i;
  const stripEmph  = (s: string) => s.replace(/\*/g, '').replace(/^[-–—:]\s*/, '').trim();

  const getWeek = (m: number, w: number) => {
    const key = m + '-' + w;
    if (!registry[key]) { const o = { month: m, week: w, phase: `Month ${m}, Week ${w}`, bullets: [] as string[] }; registry[key] = o; weeks.push(o); }
    return registry[key];
  };

  for (const raw of lines) {
    const clean = raw.replace(/\*\*/g, '').replace(/`/g, '').trim();
    if (!clean) continue;

    const cm = clean.match(combinedRe);
    if (cm) { curMonth = parseInt(cm[1], 10); curWeek = getWeek(curMonth, parseInt(cm[2], 10)); awaitingSubtitle = false; continue; }

    const mh = clean.match(monthRe);
    if (mh && !rangeRe.test(clean) && !/Week\s+\d+/i.test(clean)) {
      curMonth = parseInt(mh[1], 10); curWeek = null;
      const sub = mh[2] ? stripEmph(mh[2]) : '';
      if (sub && !dateOnlyRe.test(sub) && !/^Month\s+\d+$/i.test(sub) && sub.length <= 120) { monthTitles[curMonth] = sub; awaitingSubtitle = false; }
      else awaitingSubtitle = true;
      continue;
    }

    const wh = clean.match(weekRe);
    if (wh && curMonth != null && !/Month\s+\d+/i.test(clean)) {
      curWeek = getWeek(curMonth, parseInt(wh[1], 10));
      awaitingSubtitle = false;
      const wsub = wh[2] ? stripEmph(wh[2]) : '';
      if (wsub) curWeek.bullets.push(wsub);
      continue;
    }

    const b = clean.match(bulletRe);
    if (b) {
      const content = b[1].replace(/\*/g, '').trim();
      if (content) {
        if (curWeek) curWeek.bullets.push(content);
        else if (curMonth != null) getWeek(curMonth, 1).bullets.push(content);
      }
      awaitingSubtitle = false;
      continue;
    }

    if (awaitingSubtitle && curMonth != null && !monthTitles[curMonth]) {
      const t = stripEmph(clean);
      if (t && !dateOnlyRe.test(t) && t.length <= 120) monthTitles[curMonth] = t;
    }
    awaitingSubtitle = false;
  }

  return { weeks, monthTitles };
}

// ── Dates: the person's own day, not the server's (RULES.md: their time) ────
function localToday(tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
}

// Detect the timeline (in months) from natural language so the plan's length
// can be enforced (verbatim from the Goals app, counted from their own today).
function detectMonths(conversationText: string, today: string): number | null {
  const _mNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const _wNum: Record<string, number> = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12 };
  const [ty0, tm0] = today.split('-').map(Number);
  const nowYear = ty0, nowMonth = tm0 - 1;
  let detectedMonths: number | null = null;
  const _em = conversationText.match(/(\d+)[- ]month/i);
  if (_em) detectedMonths = parseInt(_em[1], 10);
  if (!detectedMonths) { const m = conversationText.match(/in\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+years?/i); if (m) detectedMonths = (parseInt(m[1]) || _wNum[m[1].toLowerCase()] || 1) * 12; }
  if (!detectedMonths) { const m = conversationText.match(/in\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+months?/i); if (m) detectedMonths = parseInt(m[1]) || _wNum[m[1].toLowerCase()] || 1; }
  if (!detectedMonths) { const m = conversationText.match(/in\s+(\d+)\s+weeks?/i); if (m) detectedMonths = Math.max(1, Math.round(parseInt(m[1]) / 4)); }
  if (!detectedMonths) { const m = conversationText.match(/by\s+(?:next\s+|this\s+|end\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i); if (m) { const ti = _mNames.indexOf(m[1].toLowerCase()); const isNext = /next/i.test(m[0]); let ty = nowYear; if (ti <= nowMonth || isNext) ty++; detectedMonths = Math.max(1, (ty - nowYear) * 12 + (ti - nowMonth)); } }
  if (!detectedMonths) { const m = conversationText.match(/(?:by|before)\s+(?:(?:the\s+)?end\s+of\s+)?(\d{4})/i); if (m) { const ty = parseInt(m[1]); if (ty >= nowYear) detectedMonths = Math.max(1, (ty - nowYear) * 12 + (11 - nowMonth)); } }
  if (!detectedMonths && /(?:by|before)\s+(?:the\s+)?end\s+of\s+(?:(?:this|the)\s+)?year/i.test(conversationText)) detectedMonths = Math.max(1, 11 - nowMonth);
  if (!detectedMonths && /next\s+year/i.test(conversationText)) detectedMonths = Math.max(6, 12 - nowMonth + 6);
  return detectedMonths;
}

function cleanMessages(messages: any[]): { role: 'user' | 'assistant'; content: string }[] {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map((m) => ({ role: m.role, content: String(m.content) }));
}

// ── One model turn ─────────────────────────────────────────────────────────
// With OpenAI's web_search (the Goals app's search went through InvokeLLM,
// which ADHDone never uses). If the Responses call itself fails for a reason
// other than running out of time, the same turn is asked once more without
// web search, so the conversation still moves.
async function modelTurn(openai: any, systemPrompt: string, messages: any[], timeoutMs: number): Promise<string> {
  const input = messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  const base = { model: MODEL, instructions: systemPrompt, input, tools: [{ type: 'web_search' }], max_output_tokens: 16000 };
  const opts = { timeout: Math.max(20000, timeoutMs) };
  try {
    let res;
    try {
      res = await openai.responses.create({ ...base, reasoning: { effort: 'low' } }, opts);
    } catch (e: any) {
      if (e?.status !== 400) throw e;
      res = await openai.responses.create(base, opts);
    }
    return String(res?.output_text || '');
  } catch (e: any) {
    const timedOut = /timed? ?out|abort/i.test(String(e?.message || e?.name || ''));
    if (timedOut) throw e;
    console.error('[goalPlannerChat] web-search turn failed, asking without search:', e?.status, e?.message);
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...input],
      reasoning_effort: 'low',
      max_completion_tokens: 16000,
    }, opts);
    return String(completion.choices?.[0]?.message?.content || '');
  }
}

// ── System prompts ─────────────────────────────────────────────────────────

function newGoalPrompt({ today, goalsSummary, userCity, monthsRule }: { today: string; goalsSummary: string; userCity: string | null; monthsRule: string }) {
  return `You are an expert goal planner, life coach, and ongoing accountability partner. You help users create brand-new, detailed, actionable, realistic goal plans — and continuously refine them over time.

TODAY'S DATE: ${today}. Always use it to calculate timelines exactly. If a user says "by December 2026", compute the precise number of months from today — do NOT guess (e.g. May 2026 → December 2026 = 7 months).

${APP_RULE}

${goalsSummary}
${userCity ? `USER'S CITY: ${userCity}` : ''}

═══ CREATING A NEW GOAL ═══

PHASE 0 — SKIP INFO-GATHERING WHEN POSSIBLE: If the user's CURRENT message already contains the goal, the timeline/duration, time commitment, and any budget/constraints, skip straight to Phase 2 and build the full plan immediately (no "are you ready?" question).
  EXCEPTION — READING/BOOK GOALS never skip Phase 1, even with a timeline given. You must first learn their genres/authors, books already read (so you don't repeat them), and book budget. Generic genre labels are not a substitute for real personalized picks.

PHASE 1 — GATHER INFO FIRST (required before any plan, unless Phase 0 applies):
Ask ALL your questions in ONE numbered list (never split across messages). Rules for questions:
  a) Never ask two questions covering the same topic — merge them.
  b) Every question states how the answer shapes the plan (e.g. "What obstacles or fears do you have? I'll build contingency steps for them.").
  c) For purchase/savings goals, look up the item's real price first and reference it ("The 2026 Camry is ~$29,000 — full price or just a down payment?") instead of a generic "how much do you need?".
  The questions to ask:
   - ONE combined experience + prior attempts question (MANDATORY, every goal): "What's your current experience with this? Have you tried before — and if so, what worked or didn't?"
   - Obstacles/fears (MANDATORY, every goal): "What obstacles or fears do you have? I'll build specific contingency steps to address them."
   - The target amount/outcome (for finance goals, reference the real price).
   - Realistic monthly commitment (time or money).
   - Deadline/target date — ONLY if they haven't already stated one.
   - Start date: "When do you want to start? I'll calculate the timeline from your start date to the end date."
   - DAILY-ACTION GOALS ONLY (practice, reading, exercise, learning): what time of day they'll do it: "What time of day do you want to do this? I'll put it on your task list at that time — or say no set time."
   - DAILY-ACTION GOALS ONLY: "Every day, or just weekdays?"
   - BUDGET (ask for almost all goals — books, courses, tools, classes all cost money): "Do you have a budget for things like books, courses, or tools? A rough idea helps — or I can stick to free resources only." Skip ONLY for pure save/pay-off-money goals. Use the answer to filter resources strictly: no budget / no answer / vague / question not asked → FREE resources only (never recommend paid books, courses, or tools). A stated budget → tailor to fit it.
   - LOCAL RESOURCES (only for goals where in-person options genuinely help — music lessons, clubs, dance, martial arts, classes, etc.): ${userCity ? `the user's city is ${userCity}; ask if they want local resources included.` : `ask "What city are you in? (optional — I can include local classes, clubs, and meetups near you)".`} Ask this once only.

DO NOT draft a plan until the user has replied at least TWICE with substantive answers. If they've replied only once, ask follow-ups on anything vague.

PHASE 2 — DRAFT THE FULL PLAN (once enough info is gathered):
Once the user has answered your Phase 1 questions, produce the COMPLETE plan in THIS response. Never defer ("I'll draft it next", "stay tuned", "coming up") — the plan appears now. Response structure, all in one message:
  1. A 2–3 sentence summary of what you heard.
  2. Immediately below it, the full month-by-month markdown plan (every month, no abbreviations).
  3. Then a direct approval question ("Does this plan look good? Ready to save it?").

${monthsRule}

MANDATORY MARKDOWN FORMAT — repeat this exact structure for every month the timeline requires (3-month plan = 3 months, 7-month plan = 7 months — never add or drop months). Each week has 3–6 detailed bullets (see WEEK DEPTH below), NOT a single line:

**Month 1 — [Descriptive Title]**
**Week 1**
- [The concrete action for the week — exact chapters / exercises with sets+reps / specific vocab set]
- Focus on: [what to notice this week, tied to the real content — e.g. the actual theme or technique in play]
- Reflect: [1–2 pointed questions that make them engage with the material]
- Activity: [a journaling / practice / application / discussion task]
- Resource: [optional, a real link per the link rules]

**Week 2**
- [concrete action]
- Focus on: [...]
- Reflect: [...]
- Activity: [...]

**Week 3**
- [concrete action]
- Focus on: [...]
- Reflect: [...]
- Activity: [...]

**Week 4**
- [concrete action]
- Focus on: [...]
- Reflect: [...]
- Activity: [...]

**Month 2 — [Descriptive Title]**
**Week 1**
- ...

(Continue this exact pattern for EVERY month, generated inline now — every month titled "**Month N — Title**" with all 4 weeks, and every week filled with the detailed bullets shown above.)

${NO_GROUPING_RULE}

GRANULARITY — match the goal type:
- DAILY-PRACTICE goals (instrument, language, fitness, coding, drawing): break each week into daily tasks; mark is_daily_habit: true.
- MILESTONE/PROJECT goals (finance, career, business, travel): 2–4 specific action steps per week.
- SOFT/PERSONAL-GROWTH goals (confidence, anxiety, boundaries, mindset, relationships): 3–7 gentle reflection prompts or practice goals per week, no rigid scheduling.

SPECIFICITY (every goal type): Every step title and month title must be specific, actionable, and grounded in what the user told you — their preferences, experience, equipment, and schedule. Generic filler is a critical failure: never "workout today", "practice today", "Week 3 training", "study session", "do your goal". Instead name real content — fitness: "3x10 goblet squats + 20 min incline walk"; language: "past-tense conjugations — 30 irregular verbs"; nutrition: "swap breakfast to Greek yogurt + berries"; skill-building: "build a CSS flexbox layout from scratch".

${WEEK_DETAIL_RULE}

RESOURCES: Include concrete resources where they add value (videos, books, apps, free tools, and — if the user opted in — specific local venues/clubs${userCity ? ` in ${userCity}` : ''}). Any resource, link, book, app, or tool mentioned during the conversation MUST appear in the relevant step. Follow the resource-link rules below.

TIMELINE & START DATE: Build the plan to fit the stated timeline AND start date. "Start immediately/now" → count months from today (${today}). A future start date (e.g. "June 1st") → count months from THAT date, and name phases from it (Month 1 = first month after the start date). Example: "start June 1, done Dec 31" → 7 months, Month 1 (June) through Month 7 (December).

NEVER ask follow-up questions mid-plan ("do these resonate?"). Commit to the full plan using everything the user told you.

APPROVAL: When the user approves ("looks great", "perfect", "save it", "let's do it", "yes", "looks good"), FIRST verify the plan in the conversation covers every month from Month 1 to the last with no gaps. If it's incomplete, present the missing months instead. Only when the complete plan has been presented, start your response with EXACTLY "PLAN_APPROVED" then a warm 2–3 sentence summary, then add: "Remember, this plan is a living document. Come back anytime to adjust the difficulty, add resources, extend the timeline, skip ahead if you're crushing it, or restructure a phase. Just tell me what's working and what isn't — I'll update your plan instantly."

═══ EDITING AN EXISTING GOAL (user says too easy/hard, wants more resources, skip ahead, restructure, add a week, etc.) ═══
- If the user has exactly ONE goal, assume they mean it — never ask which. Only ask if they have 2+ goals AND it's ambiguous.
- Propose SPECIFIC changes immediately — no questions first. Show the steps/changes clearly. End with "Say 'yes' to save these changes." or "Want me to apply this?"
- When the user approves, start your response with EXACTLY "EDIT_APPROVED:<goal_id>" using the actual ID from the list above.
- Coaching signals: "too easy" → accelerate/harder; "too hard/overwhelmed" → smaller steps, slower, more beginner resources; "no time" → extend timeline or reduce weekly load; "finished early" → advanced content or a new goal; "need resources" → add specific links/books/videos.

${WEB_SEARCH_RULE}

${READING_GOAL_RULE}

${TIME_MAPPING_RULE}

${RESOURCE_LINK_RULE}

${NO_FABRICATION_RULE}

${NO_REPEAT_RULE}

${RESPECT_CONSTRAINTS_RULE}

Always be specific, warm, encouraging, and treat the plan as a living document that evolves with the user.`;
}

function editGoalPrompt({ today, currentGoal, phasesSummary, originalContextText, createdStr, monthsFromCreation, targetMonths }: any) {
  return `You are an expert goal planner and ongoing accountability partner helping a user EDIT and EVOLVE an existing goal.

${APP_RULE}

CRITICAL OUTPUT RULE: When you propose changes to any month, you MUST write the COMPLETE replacement content for that month — all 4 weeks with full bullet details. NEVER write a placeholder like "---", "(same as before)", or leave a month section empty. If you searched the web for a book recommendation and found one, use that exact title immediately in the month header and week content — do not leave a dash or ellipsis. If for any reason you cannot produce the full replacement right now, instead describe in plain text what change you will make and ask the user to confirm before writing it out.

SMALL CHANGE APPROVAL FLOW: When the user requests a small change (e.g. "change the book for month 8", "swap month 3 to something easier", "use a different resource"), you do NOT need to rewrite the entire plan. Instead:
1. Propose the specific change clearly in plain text (e.g. "For Month 8 I'll swap to *Book Title* by Author. It covers X and fits your goal because Y. Want me to apply this?")
2. When the user confirms with words like "yes", "sounds good", "perfect", "ok", "sure", "do it", "go ahead", "looks good" — respond with EXACTLY "EDIT_APPROVED" followed by a brief summary of what changed. Do NOT rewrite the full plan. Do NOT ask more questions.

FULL REWRITE vs SMALL CHANGE — use your judgment:
- Small change (propose inline, then wait for "yes"): swap a book/resource, change one month's focus, adjust difficulty of one phase.
- Full rewrite needed: restructure the whole timeline, extend by multiple months, complete overhaul of approach.
For small changes, NEVER regenerate the full plan just to show approval buttons — a single conversational proposal + user confirmation is enough.

TODAY'S DATE: ${today}. Use it to calculate timelines accurately.

CURRENT GOAL: "${currentGoal?.title || 'Unknown'}"
DESCRIPTION: ${currentGoal?.description || 'N/A'}
PLAN SUMMARY: ${currentGoal?.plan_summary || 'N/A'}
TIMELINE: ${currentGoal?.timeline || 'N/A'} (Target Date: ${currentGoal?.target_date || 'N/A'})
GOAL CREATED: ${createdStr}
${monthsFromCreation !== null ? `MONTHS ELAPSED SINCE CREATION: ~${monthsFromCreation}` : ''}
${targetMonths !== null ? `PLAN SHOULD SPAN ${targetMonths} MONTHS TOTAL (Month 1 through Month ${targetMonths})` : ''}
${originalContextText}

FULL PLAN — ALL EXISTING STEPS BY PHASE:
${phasesSummary || '  (no steps yet)'}

HOW YOU WORK:

1. DEFAULT TO ACTION, NOT QUESTIONS. You already have the full step list, original conversation, description, timeline, and creation date. Respond to any edit request with a concrete proposal, not questions. The ONLY question you may ever ask is which goal the user means — and only if they have 2+ goals and it is genuinely ambiguous. Never ask "do these resonate?", "what resources do you prefer?", etc. End every proposal with "Want me to add this to your plan?" or "Say 'yes' to save this."

2. GAP-FILLING IS IMMEDIATE. If the plan shows e.g. Months 1–5 but should span 12, and the user says "fill in the rest", generate Month 6 through Month 12 in full detail right now — look at the surrounding months and infer the logical progression. If the user asks to add a single missing week/phase, respond with 5–8 specific steps immediately. Never ask a question first.

3. TIMELINE ACCURACY. The goal was created on ${createdStr}; today is ${today}. Use these to know where the user is — do not assume a specific month unless you can calculate it.

4. APPROVAL TRIGGER. Detect approval in ANY of these patterns:
   - Direct affirmatives: "yes", "yeah", "yep", "ok", "okay", "alright", "sure", "sounds good", "looks good", "perfect", "great", "love it", "i like it"
   - Imperative directives: "do it", "go ahead", "make it so", "apply it", "apply that", "revise", "revise it", "revise please", "revise please", "make that change", "make the change", "go for it", "let's do it", "let's go", "update it", "change it", "rewrite it", "write it", "build it"
   - Conditional approvals: "if that's what...", "as long as...", "as you suggested"
   - When user says "revise" + any suggested change in same or previous message = approval to apply AND show full plan
   When ANY of these patterns appear, skip the proposal step entirely and IMMEDIATELY output the complete Month/Week plan with "EDIT_APPROVED" at the start.

TIMELINE EXTENSION ("add 2 more months", "extend by 3 months", "I need more time"): never silently append months to the end — that creates two endpoints and a disjointed plan. Offer ONE of:
- OPTION A — FULL RESTRUCTURE (recommend this when the user is behind, struggling, or short on time): recalculate the ENTIRE plan across the new total duration, redistribute the same goals/milestones, delete incomplete steps and replace them. "I'm restructuring your full plan to span [new total] months so everything flows naturally to the new end date."
- OPTION B — EXTEND WITH NEW ADVANCED CONTENT (only if the user explicitly wants MORE material/depth, not just more time): add genuinely advanced new phases BEYOND the original endpoint. "I've added [X] months of advanced content after your original completion point."
Present both clearly, recommend the one that fits, and wait for their choice before generating the extended plan. When in doubt, recommend Option A.

PROACTIVE COACHING — watch for and respond to these signals:
- "too easy / I already know this" → accelerate, remove beginner steps, add harder content.
- "too hard / overwhelmed" → break steps smaller, slow the pace, add foundational resources.
- "I don't have time" → extend timeline or reduce weekly step count (Option A restructure).
- "I finished early" → add advanced phases or a follow-on goal (Option B).
- "I need more resources" → add specific links/videos/books to relevant steps.
- "a week/phase is missing" → fill the gap logically from the surrounding phases.

${NO_GROUPING_RULE}

${WEEK_DETAIL_RULE}

${WEB_SEARCH_RULE}

${READING_GOAL_RULE}

${TIME_MAPPING_RULE}

${RESOURCE_LINK_RULE}

${NO_FABRICATION_RULE}

${NO_REPEAT_RULE}

${RESPECT_CONSTRAINTS_RULE}

Always be specific, warm, and treat the plan as a living document.`;
}

// ── Safety check (first message of a new goal) ─────────────────────────────
async function safetyCheck(openai: any, firstUserMessage: string): Promise<{ safe: boolean; reason: string }> {
  const res = await openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: 'low',
    max_completion_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a safety reviewer for a goal-planning app. Evaluate the user's goal and return ONLY a JSON object with two fields:
- "safe": boolean — true if the goal is healthy and appropriate, false if it should be flagged
- "reason": string — if not safe, a warm, non-judgmental 1-2 sentence explanation of the concern and a suggestion for a healthier alternative. Empty string if safe.

Flag a goal as NOT safe if it:
1. Involves unhealthy weight loss (more than 1-2 lbs/week, or extreme crash dieting, or "lose X lbs in Y weeks/months" where the rate exceeds safe guidelines)
2. Involves dangerous physical extremes (extreme fasting, starvation diets, dangerous exercise volume for a beginner)
3. Is physically impossible in the given timeframe (e.g. "run a 4-minute mile in 2 weeks" for a non-athlete)
4. Involves illegal activities (drug use, fraud, violence, theft, etc.)
5. Is self-harmful or promotes harm to others
6. Involves clearly harmful or predatory behavior
7. Is deeply offensive or hateful content

Do NOT flag:
- Ambitious but realistic goals (even if very challenging)
- Legal activities even if controversial
- Goals about quitting bad habits
- Financial or career goals even if difficult
Return ONLY the JSON object, no other text.`,
      },
      { role: 'user', content: firstUserMessage },
    ],
  });
  try {
    const out = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    return { safe: out?.safe !== false, reason: String(out?.reason || '') };
  } catch (_) {
    return { safe: true, reason: '' };
  }
}

// ── CHAT: one planner turn ─────────────────────────────────────────────────
async function runChat(openai: any, p: {
  messages: any[]; goalId: string | null; city: string | null; today: string; startedAt: number;
  existingGoals: any[]; stepsByGoal: Record<string, any[]>;
}) {
  const { messages, goalId, city, today, startedAt, existingGoals, stepsByGoal } = p;
  const conversationText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Planner'}: ${m.content}`).join('\n\n');
  const detectedMonths = detectMonths(conversationText, today);
  const monthsRule = detectedMonths
    ? `- Use EXACTLY ${detectedMonths} months for this plan (Month 1 through Month ${detectedMonths}). Do NOT recalculate or shorten it. Each month MUST have exactly 4 weeks (Week 1–Week 4) — ${detectedMonths * 4} week-blocks total. Never combine or skip weeks or months.`
    : `- Identify the exact duration from the conversation (a deadline, date, or duration phrase) and use that many months — do NOT shorten it. Each month has exactly 4 weeks.`;

  const goalsSummary = existingGoals.length > 0
    ? `The user has these existing goals (with their full step lists):\n${existingGoals.map((g) => {
        const steps = stepsByGoal[g.id] || [];
        const phaseMap: Record<string, string[]> = {};
        steps.forEach((s) => {
          const ph = s.phase || 'Uncategorized';
          if (!phaseMap[ph]) phaseMap[ph] = [];
          phaseMap[ph].push(s.title);
        });
        const phaseSummary = Object.entries(phaseMap).map(([ph, titles]) => `      ${ph}: ${titles.join(', ')}`).join('\n');
        return `- ID: ${g.id} | Title: "${g.title}" | Status: ${g.status} | Timeline: ${g.timeline || 'N/A'}\n${phaseSummary || '      (no steps)'}`;
      }).join('\n\n')}`
    : 'The user has no existing goals yet.';

  const isEditSession = !!goalId;

  // Safety check on a new goal's first message (as in the Goals app).
  if (!isEditSession) {
    const firstUserMessage = messages.find((m) => m.role === 'user')?.content || '';
    if (firstUserMessage && messages.length <= 2) {
      try {
        const safety = await safetyCheck(openai, firstUserMessage);
        if (!safety.safe && safety.reason) return { message: safety.reason, action: 'safety_flag' };
      } catch (e: any) {
        console.error('[goalPlannerChat] safety check failed, carrying on:', e?.message);
      }
    }
  }

  let planMonths = detectedMonths;
  let systemPrompt: string;
  if (isEditSession) {
    const currentGoal = existingGoals.find((g) => g.id === goalId);
    const currentSteps = stepsByGoal[goalId as string] || [];
    const phaseMap: Record<string, string[]> = {};
    currentSteps.forEach((s) => {
      const ph = s.phase || 'Uncategorized';
      if (!phaseMap[ph]) phaseMap[ph] = [];
      phaseMap[ph].push(s.title);
    });
    const phasesSummary = Object.entries(phaseMap)
      .map(([ph, titles]) => `  ${ph} (${titles.length} steps):\n${titles.map((t) => `    - ${t}`).join('\n')}`)
      .join('\n');
    const originalConversation = currentGoal?.conversation_history || [];
    const originalContextText = originalConversation.length > 0
      ? `\nORIGINAL PLANNING CONVERSATION (user's stated constraints, time availability, preferences):\n${originalConversation.slice(0, 10).map((m: any) => `${m.role === 'user' ? 'User' : 'Planner'}: ${m.content}`).join('\n')}`
      : '';
    const tm = currentGoal?.timeline?.match(/(\d+)\s*month/i);
    const targetMonths = tm ? parseInt(tm[1], 10) : null;
    planMonths = targetMonths;
    const monthsFromCreation = currentGoal?.created_date
      ? Math.round((new Date(today).getTime() - new Date(currentGoal.created_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;
    const createdStr = currentGoal?.created_date ? new Date(currentGoal.created_date).toISOString().split('T')[0] : 'recently';
    systemPrompt = editGoalPrompt({ today, currentGoal, phasesSummary, originalContextText, createdStr, monthsFromCreation, targetMonths });
  } else {
    systemPrompt = newGoalPrompt({ today, goalsSummary, userCity: city, monthsRule });
  }

  const remaining = () => CHAT_BUDGET_MS - (Date.now() - startedAt);

  // Guarantee a plan draft is fully expanded into SEPARATE months (Goals app
  // logic, unchanged apart from the time budget).
  const HARD_CAP_MONTHS = 36;
  const expandPlan = async (text: string) => {
    let stalls = 0;
    for (let attempt = 0; attempt < 16; attempt++) {
      const a = analyzePlan(text);
      const expected = Math.min(HARD_CAP_MONTHS, Math.max(planMonths || 0, a.maxMentioned));
      if (a.contig >= expected && !a.groupingPresent) break;
      const from = a.contig + 1;
      if (from > expected) break;
      if (remaining() < 60 * 1000) break; // out of time: close honestly below
      const cut = a.contig >= 1
        ? a.sectionEnd(a.headerIdx[a.contig])
        : (a.firstHeaderIdx >= 0 ? a.firstHeaderIdx : a.lines.length);
      const head = a.lines.slice(0, cut).join('\n');
      const target = Math.min(HARD_CAP_MONTHS, Math.max(expected, a.maxPresent));
      let addition = '';
      try {
        addition = await modelTurn(openai, systemPrompt, [
          ...messages,
          { role: 'assistant', content: head },
          {
            role: 'user',
            content: `Continue building this exact plan. Do NOT repeat, rewrite, or alter any month you already wrote — Month 1 through Month ${a.contig} are done. Now write Month ${from} through Month ${target}, EACH as its own separate section titled "**Month N — Title**" with all 4 weeks (Week 1–Week 4), in the same detailed format and depth as the earlier months. Every week must be detailed, not a one-liner: the concrete action PLUS what to focus on (tied to the actual content/themes), a reflection/thinking prompt, and a practice/application activity. NEVER write a month range like "Month ${from}-${target}", NEVER write "TBD"/"to be determined"/"I'll continue" — write every single month out in full and separately. Output ONLY Month ${from} through Month ${target}.`,
          },
        ], remaining() - 15 * 1000);
      } catch (e: any) {
        console.error('[goalPlannerChat] continuation pass failed:', e?.message);
        addition = '';
      }
      const candidate = (addition && addition.trim()) ? head.replace(/\s+$/, '') + '\n\n' + addition.trim() : null;
      if (candidate && analyzePlan(candidate).contig > a.contig) {
        text = candidate;
        stalls = 0;
      } else if (++stalls >= 3) {
        break;
      }
    }
    const fin = analyzePlan(text);
    const finExpected = Math.min(HARD_CAP_MONTHS, Math.max(planMonths || 0, fin.maxMentioned));
    if (fin.contig < finExpected || fin.rangePresent) {
      const cut = fin.contig >= 1
        ? fin.sectionEnd(fin.headerIdx[fin.contig])
        : (fin.firstHeaderIdx >= 0 ? fin.firstHeaderIdx : fin.lines.length);
      const head = fin.lines.slice(0, cut).join('\n').replace(/\s+$/, '');
      if (fin.contig >= finExpected) {
        text = head + '\n\nThat completes the full plan — does this look good and are you ready to save it?';
      } else {
        text = head + '\n\nDoes this plan look good so far? You can also ask me to continue expanding any remaining months.';
      }
    } else if (!/\?\s*$/.test(text.trim())) {
      text = text.trim() + '\n\nThat completes the full plan — does this look good and are you ready to save it?';
    }
    return text;
  };

  let finalReply = await modelTurn(openai, systemPrompt, messages, remaining() - 10 * 1000);
  if (!finalReply.trim()) throw new Error('The planner gave an empty answer');

  const isApproval = /\b(?:PLAN_APPROVED|EDIT_APPROVED)\b/i.test(finalReply);
  const looksLikePlan = /^\s*#{0,4}\s*\*{0,2}\s*Month\s+\d+/im.test(finalReply);
  if (!isApproval && looksLikePlan) finalReply = await expandPlan(finalReply);

  if (isEditSession && finalReply.includes('EDIT_APPROVED')) {
    return { message: finalReply.replace(/EDIT_APPROVED\s*/i, '').trim(), action: 'edit_approved', goal_id: goalId };
  }
  if (finalReply.includes('PLAN_APPROVED')) {
    return { message: finalReply.replace(/PLAN_APPROVED\s*/i, '').trim(), action: 'plan_proposed' };
  }
  const editMatch = finalReply.match(/EDIT_APPROVED:([^\s]+)/i);
  if (editMatch) {
    return { message: finalReply.replace(/EDIT_APPROVED:[^\s]+\s*/i, '').trim(), action: 'edit_approved', goal_id: editMatch[1] };
  }

  // Month titles from the reply (verbatim from the Goals app).
  const chatMonthTitles: Record<number, string> = {};
  const replyLines = finalReply.split('\n');
  const isDateOnly = (t: string) => /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(t);
  const stripFormatting = (s: string) => s.replace(/\*+/g, '').replace(/^[#>\s-]+/, '').trim();
  for (let li = 0; li < replyLines.length; li++) {
    const cleanLine = stripFormatting(replyLines[li]);
    const inlineMatch = cleanLine.match(/^Month\s+(\d+)\s*[–—:\-]+\s*(.+)/i);
    if (inlineMatch) {
      const num = parseInt(inlineMatch[1], 10);
      const title = stripFormatting(inlineMatch[2]);
      if (title && !isDateOnly(title) && title.length <= 120 && !chatMonthTitles[num]) chatMonthTitles[num] = title;
      continue;
    }
    const monthNumMatch = cleanLine.match(/^Month\s+(\d+)$/i);
    if (monthNumMatch) {
      const num = parseInt(monthNumMatch[1], 10);
      for (let nli = li + 1; nli < replyLines.length && nli < li + 6; nli++) {
        const candidate = stripFormatting(replyLines[nli]);
        if (!candidate) continue;
        const isWeekLine = /^Week\s+\d+/i.test(candidate);
        const isMonthLine = /^Month\s+\d+/i.test(candidate);
        const isTaskBullet = /^\d+\.\s/.test(candidate) && candidate.length < 60;
        const isGenericPlaceholder = /continue\s+to\s+select|will\s+continue|for\s+these\s+months/i.test(candidate);
        if (!isWeekLine && !isMonthLine && !isDateOnly(candidate) && !isGenericPlaceholder && candidate.length <= 150 && !isTaskBullet) {
          if (!chatMonthTitles[num]) chatMonthTitles[num] = candidate;
        }
        break;
      }
    }
  }
  return { message: finalReply, action: 'chat', month_titles: chatMonthTitles };
}

// ── EXTRACT PLAN: the already-written plan → structured JSON (nothing saved) ─
async function extractPlan(openai: any, messages: any[], today: string) {
  const conversationText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Planner'}: ${m.content}`).join('\n\n');
  const detectedMonths = detectMonths(conversationText, today);
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const planText = lastAssistantMessage?.content || conversationText;

  const parsed = parsePlanWeeks(planText);
  const parsedWeeks = parsed.weeks;
  const parsedMonthTitles = parsed.monthTitles;
  const weeksWithContent = parsedWeeks.filter((w) => w.bullets.length > 0).length;

  if (weeksWithContent >= 3) {
    parsedWeeks.sort((a, b) => a.month - b.month || a.week - b.week);
    const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    let meta: any = {};
    try {
      const metaResp = await openai.chat.completions.create({
        model: MODEL,
        reasoning_effort: 'low',
        max_completion_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `Return ONLY a small JSON object describing this goal at a high level (NO steps). Fields:
        - title: short goal title (e.g. "Read 12 books in 12 months")
        - description: one sentence
        - plan_summary: 2-3 sentences
        - category: one of learning|health|career|finance|relationships|personal|creative|other. CRITICAL: If the goal involves reading, books, novels, or chapters, use "learning", NOT "personal".
        - requires_daily_action: true for habit/practice/reading/fitness goals, else false. CRITICAL: Reading/book goals MUST be true.
        - weekdays_only: false unless the goal is explicitly work/career only, or the user said they'll only do it on weekdays
        - include_weekend_reminders: false if the user said anything like "no weekends", "weekdays only", "not on weekends"; true otherwise (default true)
        - habit_days_of_week: if the user named specific days for it (e.g. "Mon, Wed, Fri"), those days as numbers 0=Sun … 6=Sat; otherwise []
        - preferred_time: the time of day the user said they want to do it (daily-action goals), in 24h HH:MM format (e.g., "09:00", "18:00", "08:00" for morning, "17:00" for evening). null if they gave no time or said no set time.
        - start_date: The date the user wants to START, as YYYY-MM-DD. TODAY IS ${today}. Resolve loose/relative phrasing: "next month" → the 1st of next month; a bare month name ("July", "in July", "start in July") → the 1st of that month (this year if still upcoming, else next year); "now"/"today"/"asap" → ${today}. Only return null if no start timing is given at all.
        ${TIME_MAPPING_RULE}` },
          { role: 'user', content: `User said:\n${userText}\n\nPlan intro:\n${planText.slice(0, 1200)}\n\nFrom the user's text above, extract BOTH the time of day they want to do it AND their start date. For start_date, resolve relative phrasing ("next month", "in July", "start in July", "now") to a real YYYY-MM-DD using today = ${today}. Return the JSON.` },
        ],
      });
      meta = JSON.parse(metaResp.choices?.[0]?.message?.content || '{}') || {};
    } catch (e: any) {
      console.error('[goalPlannerChat] extract_plan meta failed:', e?.message);
      meta = {};
    }

    const monthNums = parsedWeeks.map((w) => w.month);
    const titleNums = Object.keys(parsedMonthTitles).map(Number).filter((n) => !isNaN(n));
    const N = Math.max(detectedMonths || 0, monthNums.length ? Math.max(...monthNums) : 0, titleNums.length ? Math.max(...titleNums) : 0, 1);
    const validDate = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const startStr = validDate(meta.start_date) ? meta.start_date : today;
    const startDate = new Date(startStr + 'T00:00:00Z');
    const targetDate = new Date(startDate); targetDate.setUTCMonth(targetDate.getUTCMonth() + N);
    const totalDays = Math.max(1, (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const T = parsedWeeks.length || 1;
    // The Goals app forced reading goals to daily + learning with a keyword
    // list on top of the model's answer (its gpt-4o-mini kept missing them).
    // ADHDone leaves that judgment to the model (Anna: no keyword tables); the
    // prompt above still says reading goals are daily and "learning".
    const dailyHabit = meta.requires_daily_action === true;
    const resolvedCategory = meta.category || 'personal';
    const time = typeof meta.preferred_time === 'string' && /^\d{1,2}:\d{2}$/.test(meta.preferred_time.trim())
      ? meta.preferred_time.trim().padStart(5, '0') : null;
    const days = Array.isArray(meta.habit_days_of_week)
      ? [...new Set(meta.habit_days_of_week.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))] : [];

    const steps = parsedWeeks.map((wk, i) => {
      const bullets = wk.bullets.filter(Boolean);
      const first = bullets[0] || '';
      let focus = (first.includes(':') ? first.split(':')[0] : first).trim();
      if (focus.length > 60) focus = focus.slice(0, 60).trim();
      const d = new Date(startDate); d.setUTCDate(d.getUTCDate() + Math.round(i * totalDays / T));
      return {
        title: focus ? `Week ${wk.week}: ${focus}` : `Week ${wk.week}`,
        description: bullets.join('\n'),
        phase: wk.phase,
        priority: 'medium',
        due_date: d.toISOString().split('T')[0],
        order_index: i,
        step_resources: [],
        success_criteria: [],
        tips_and_guidance: '',
        is_daily_habit: dailyHabit,
      };
    });

    const firstUser = messages.find((m) => m.role === 'user')?.content || 'My Goal';
    const plan = {
      title: String(meta.title || firstUser).slice(0, 120),
      description: meta.description || '',
      plan_summary: meta.plan_summary || '',
      timeline: `${N} months`,
      target_date: targetDate.toISOString().split('T')[0],
      start_date: startStr,
      category: resolvedCategory,
      requires_daily_action: dailyHabit,
      weekdays_only: meta.weekdays_only === true,
      include_weekend_reminders: meta.include_weekend_reminders !== false,
      habit_days_of_week: days,
      preferred_time: time,
      month_titles: parsedMonthTitles,
      steps,
    };
    console.log(`[goalPlannerChat] extract_plan (code-parse) done: ${steps.length} steps, ${N} months`);
    return plan;
  }

  // FALLBACK — the markdown wasn't in the expected shape: the model extracts it.
  const extractionResponse = await openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: 'low',
    max_completion_tokens: 32000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You convert an already-written goal plan (in markdown) into structured JSON. Preserve ALL of the plan's content — never drop or summarize away detail. You may reorganize each week's bullets into the fields below and rephrase for clarity, but do NOT invent new facts. Return ONLY valid JSON, no markdown fences.

Rules:
- Each step = one week. phase = "Month X, Week Y". title = "Week N: [short focus from plan]".
- Include EVERY week of EVERY month present in the plan. Do not skip or merge any.
- description: capture the FULL detail of that week — the concrete action, focus points, reflection prompts, and activities. NEVER compress to one line.
- success_criteria: 2–4 concrete "done" checks for the week.
- tips_and_guidance: a short helpful note, or "".
- step_resources: leave as []. Put resource links inside the description text.
- is_daily_habit: true for reading/fitness/language/music/meditation; false for milestone/project goals.
- requires_daily_action: same logic as is_daily_habit.
- month_titles: extract the title after each "Month N —" heading.
- due_dates: spread evenly from today ${today} across the timeline.
- weekdays_only: false unless explicitly work/career focused.
- ${TIME_MAPPING_RULE}`,
      },
      {
        role: 'user',
        content: `Convert this plan to JSON:\n\n${planText}\n\nReturn this structure:\n{ "title": "...", "description": "...", "timeline": "X months", "target_date": "YYYY-MM-DD", "category": "...", "plan_summary": "...", "requires_daily_action": true, "weekdays_only": false, "habit_days_of_week": [], "month_titles": {"1":"title"}, "steps": [{ "title": "Week N: focus", "description": "...", "phase": "Month X, Week Y", "priority": "medium", "due_date": "YYYY-MM-DD", "order_index": 0, "step_resources": [], "success_criteria": [], "tips_and_guidance": "", "is_daily_habit": false }] }`,
      },
    ],
  });
  const plan = JSON.parse(extractionResponse.choices?.[0]?.message?.content || '{}');
  plan.steps = (plan.steps || []).map((step: any) => ({
    ...step,
    step_resources: step.step_resources || [],
    success_criteria: step.success_criteria || [],
    tips_and_guidance: step.tips_and_guidance || '',
  }));
  plan.month_titles = plan.month_titles || {};
  plan.habit_days_of_week = plan.habit_days_of_week || [];
  plan.start_date = plan.start_date || today;
  plan.preferred_time = null;
  delete plan.notification_schedule;
  delete plan.notification_frequency;
  const todayDate = new Date(today + 'T00:00:00Z');
  const targetDate = plan.target_date ? new Date(plan.target_date + 'T00:00:00Z') : null;
  const aiDueDates = plan.steps.filter((s: any) => s.due_date).map((s: any) => s.due_date).sort();
  const aiDatesAreValid = aiDueDates[0] && new Date(aiDueDates[0]) > todayDate;
  if (!aiDatesAreValid && targetDate && plan.steps.length > 0) {
    const daysAvailable = (targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
    const daysPerStep = daysAvailable / plan.steps.length;
    plan.steps.forEach((step: any, idx: number) => {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() + Math.round((idx + 1) * daysPerStep));
      step.due_date = d.toISOString().split('T')[0];
    });
  }
  console.log(`[goalPlannerChat] extract_plan (AI fallback) done: ${plan.steps.length} steps, ${plan.timeline}`);
  return plan;
}

// ── APPLY EDIT: commit approved edits to an existing goal ───────────────────
async function applyEdit(base44: any, openai: any, messages: any[], goalId: string, today: string) {
  const conversationText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Planner'}: ${m.content}`).join('\n\n');
  const existingGoal = (await base44.entities.Goal.filter({ id: goalId }))?.[0];
  if (!existingGoal) throw new Error('Goal not found');
  const existingSteps = await base44.entities.GoalStep.filter({ goal_id: goalId }, 'order_index', 1000);
  const completedSteps = existingSteps.filter((s: any) => s.status === 'completed');
  const replaceableSteps = existingSteps.filter((s: any) => s.status !== 'completed');

  const extractionResponse = await openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: 'low',
    max_completion_tokens: 32000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You extract the new goal plan proposed in a conversation. Return ONLY valid JSON, no markdown.
CRITICAL RULES:
1. Extract EVERY step the planner proposed in their latest plan. Do NOT omit any steps, and do NOT collapse months or weeks into ranges.
2. ENFORCE WEEK ORDERING: For each month, steps MUST appear in order Week 1, Week 2, Week 3, Week 4.
3. FOR READING GOALS: If the planner mentioned specific chapter ranges (e.g. "Ch 1-15"), include those exact ranges in the step titles/descriptions. Do NOT use vague percentages when a chapter count is available.
4. The output completely replaces all existing steps, so be exhaustive.
5. CAPTURE FULL DETAIL PER STEP: each step's "description" must include the full substance of that week — the concrete action, what to focus on, the reflection/thinking prompts, and the activities — never a one-liner like "Read chapters 1-5". Populate "success_criteria" with 2–4 concrete done-checks and "tips_and_guidance" with a short helpful note, drawn from the plan (do not invent unrelated facts).
6. MONTH TITLES (if changed): include "month_titles" in goal_updates with real, specific titles (not placeholders).`,
      },
      {
        role: 'user',
        content: `Goal: "${existingGoal?.title || 'Unknown'}"

Conversation:
${conversationText}

Extract ALL steps from the planner's most recent proposed plan/changes. Include goal-level updates if the title, timeline, or description changed.

Return JSON:
{
  "goal_updates": {
    "title": "only if changed",
    "description": "only if changed",
    "plan_summary": "only if changed",
    "timeline": "only if changed",
    "target_date": "YYYY-MM-DD only if changed",
    "month_titles": { "1": "title", "2": "title" }
  },
  "new_steps": [
    { "title": "...", "description": "...", "phase": "Month X, Week Y", "priority": "low|medium|high|critical", "due_date": "YYYY-MM-DD", "order_index": 0, "step_resources": [], "success_criteria": [], "tips_and_guidance": "", "is_daily_habit": false }
  ]
}
today = ${today}
Extract every single step. If the planner listed 48 steps, return all 48.`,
      },
    ],
  });
  const extracted = JSON.parse(extractionResponse.choices?.[0]?.message?.content || '{}');

  const goalUpdates = extracted.goal_updates || {};
  const allowed = ['title', 'description', 'plan_summary', 'timeline', 'target_date'];
  const otherUpdates: Record<string, any> = {};
  for (const k of allowed) {
    const v = goalUpdates[k];
    if (typeof v === 'string' && v.trim() && !/^only if changed/i.test(v.trim())) otherUpdates[k] = v.trim();
  }
  if (otherUpdates.target_date && !/^\d{4}-\d{2}-\d{2}$/.test(otherUpdates.target_date)) delete otherUpdates.target_date;
  if (Object.keys(otherUpdates).length > 0) await base44.entities.Goal.update(goalId, otherUpdates);
  if (goalUpdates.month_titles && typeof goalUpdates.month_titles === 'object' && Object.keys(goalUpdates.month_titles).length > 0) {
    await base44.entities.Goal.update(goalId, { month_titles: { ...(existingGoal.month_titles || {}), ...goalUpdates.month_titles } });
  }

  const newSteps = Array.isArray(extracted.new_steps) ? extracted.new_steps : [];
  // A plan that came back empty replaces nothing (the Goals app would have
  // deleted every open step and created none).
  if (newSteps.length === 0) {
    return { success: false, error: 'No steps found in the new plan', steps_replaced: 0, steps_created: 0, completed_kept: completedSteps.length };
  }

  for (const step of replaceableSteps) {
    await base44.entities.GoalStep.delete(step.id);
  }

  newSteps.sort((a: any, b: any) => {
    const aMonth = parseInt(a.phase?.match(/Month (\d+)/i)?.[1] || 0);
    const bMonth = parseInt(b.phase?.match(/Month (\d+)/i)?.[1] || 0);
    if (aMonth !== bMonth) return aMonth - bMonth;
    const aWeek = parseInt(a.phase?.match(/Week (\d+)/i)?.[1] || 0);
    const bWeek = parseInt(b.phase?.match(/Week (\d+)/i)?.[1] || 0);
    return aWeek - bWeek;
  });

  // New steps go after the kept (completed) ones, in plan order.
  const keptMax = completedSteps.reduce((mx: number, s: any) => Math.max(mx, Number(s.order_index) || 0), -1);
  const wasHabit = existingGoal.requires_daily_action === true;
  const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
  for (let i = 0; i < newSteps.length; i++) {
    const step = newSteps[i];
    await base44.entities.GoalStep.create({
      goal_id: goalId,
      title: String(step.title || `Step ${i + 1}`),
      description: step.description || '',
      phase: step.phase || '',
      priority: PRIORITIES.has(step.priority) ? step.priority : 'medium',
      due_date: stepDueDate(existingGoal.start_date, step.phase, i, step.due_date) || null,
      order_index: keptMax + 1 + i,
      status: 'pending',
      step_resources: Array.isArray(step.step_resources) ? step.step_resources : [],
      success_criteria: Array.isArray(step.success_criteria) ? step.success_criteria : [],
      tips_and_guidance: step.tips_and_guidance || '',
      is_daily_habit: step.is_daily_habit === true || wasHabit,
    });
  }

  return { success: true, steps_replaced: replaceableSteps.length, steps_created: newSteps.length, completed_kept: completedSteps.length };
}

// ── Admin self-test ────────────────────────────────────────────────────────
async function selfTest(openai: any, body: any, today: string) {
  const startedAt = Date.now();
  const goal = String(body.goal || '').trim();
  if (!goal) return { error: 'goal (text) is required' };
  const answers = Array.isArray(body.answers) ? body.answers.map((a: any) => String(a || '').trim()).filter(Boolean) : [];
  const messages: any[] = [{ role: 'user', content: goal }];
  const turns: any[] = [];
  let planText = '';
  for (let i = 0; i <= answers.length; i++) {
    const r: any = await runChat(openai, { messages, goalId: null, city: null, today, startedAt, existingGoals: [], stepsByGoal: {} });
    turns.push({ action: r.action, message: r.message });
    messages.push({ role: 'assistant', content: r.message });
    if (r.action === 'safety_flag') break;
    if (/Month\s+\d+/i.test(r.message) && /Week\s+\d+/i.test(r.message)) { planText = r.message; break; }
    if (i < answers.length) messages.push({ role: 'user', content: answers[i] });
  }
  let plan: any = null;
  if (planText) plan = await extractPlan(openai, messages, today);
  // Any line of the plan that sounds like it promises a reminder, a check-in or
  // a message: the prompt says never to (APP_RULE); this shows if it slipped.
  const promises = String(planText || turns.map((t) => t.message).join('\n'))
    .split('\n')
    .filter((ln) => /\b(remind|reminder|notification|notify|check[- ]in|i'?ll (send|check|text|message|ping)|you'?ll (get|receive))\b/i.test(ln))
    .map((ln) => ln.trim())
    .slice(0, 20);
  return {
    selftest: true,
    saved: false,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    today,
    turns,
    plan_reached: !!planText,
    plan: plan ? {
      ...plan,
      steps_count: plan.steps?.length || 0,
      steps: (plan.steps || []).slice(0, 6),
      steps_left_out_of_this_preview: Math.max(0, (plan.steps?.length || 0) - 6),
    } : null,
    reminder_promise_lines: promises,
  };
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body: any = await req.json().catch(() => ({}));
    const openai = lean(new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') }), { name: 'goalPlannerChat' });
    const tz = typeof body?.tz === 'string' && body.tz ? body.tz : (user.timezone || null);
    const today = localToday(tz);

    if (body?.selftest === true) {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const out = await selfTest(openai, body, today);
      return Response.json(out);
    }

    const messages = cleanMessages(body?.messages);
    const mode = body?.mode || 'chat';
    const goalId = typeof body?.goal_id === 'string' && body.goal_id ? body.goal_id : null;
    if (messages.length === 0) return Response.json({ error: 'messages required' }, { status: 400 });

    if (mode === 'extract_plan') {
      const plan = await extractPlan(openai, messages, today);
      return Response.json({ plan, month_titles: plan.month_titles });
    }

    if (mode === 'apply_edit') {
      if (!goalId) return Response.json({ error: 'goal_id required' }, { status: 400 });
      const out = await applyEdit(base44, openai, messages, goalId, today);
      return Response.json(out, { status: out.success ? 200 : 422 });
    }

    // CHAT. The user's own goals and steps (RLS scopes to their own).
    let existingGoals: any[] = [];
    try { existingGoals = await base44.entities.Goal.list('-created_date', 50); } catch (_) { existingGoals = []; }
    const stepsByGoal: Record<string, any[]> = {};
    for (const g of existingGoals) {
      try {
        const steps = await base44.entities.GoalStep.filter({ goal_id: g.id }, 'order_index', 1000);
        stepsByGoal[g.id] = (steps || []).sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
      } catch (_) { stepsByGoal[g.id] = []; }
    }
    const out = await runChat(openai, {
      messages, goalId, city: typeof body?.city === 'string' ? body.city : null, today,
      startedAt: Date.now(), existingGoals, stepsByGoal,
    });
    return Response.json(out);
  } catch (error: any) {
    console.error('[goalPlannerChat] failed:', error?.status, error?.message);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
