// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Goals planner (ported Oct 31 2026 from Anna's Goals app, function of the
// same name; what was copied, adapted and dropped is in GOALS_PORT.md).
// Nov 1 2026: long plans finish (continue_plan) and extract_plan reads every
// planner message.
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
//     built from EVERY planner message (assemblePlan), not just the last one.
//   { messages, mode: 'apply_edit', goal_id, tz? }      → replaces the goal's not-completed steps
//   { messages, mode: 'continue_plan', plan_text, goal_id?, tz? }
//                       → { message, incomplete, months_done, months_total, month_titles }
//     writes the months a long plan is still missing, with a fresh time budget.
//     A chat answer that holds a plan carries incomplete / months_done /
//     months_total too; the Planner calls continue_plan until incomplete is
//     false (Anna, Nov 1 2026: a long plan came out with months 15+ empty).
//   { mode: 'step_feedback', goal_id, step_id, feedback?, days_late?, tz? }
//                       → { kept, summary, changed: [{ id, phase, old_title, title, old_description, description }] }
//     "How did it go?" after a step was marked done (Nov 1 2026): rewrites
//     upcoming steps in place when the feedback calls for it, and adds the
//     exchange to the goal's conversation_history.
//   admin only: { selftest: true, goal: "<text>", answers: ["...", ...], tz? }
//     runs the planner on a sample goal (its questions answered from `answers`,
//     in order) through to the full plan and its extraction, in stages over
//     several calls: every answer carries `next`, the body for the next call,
//     until `done` (see selfTest). Reads and writes nothing.
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

// When to bring up a therapist or doctor (Anna, Nov 1 2026: "It should only
// suggest professional help if someone says something that endangers
// themselves or others or is very worrying. It told me to go to one and all I
// said was that I had bpd"). New goals and edits both.
const PROFESSIONAL_HELP_RULE = `PROFESSIONAL HELP. A condition or diagnosis they mention (ADHD, autism, anxiety, depression, BPD, a physical illness, anything) is context: plan around it the way they describe it, like any other detail about their life. Suggest a therapist, doctor, crisis line or other professional ONLY when what they say shows a risk to themselves or someone else, or is seriously worrying (for example self-harm, not eating, being unsafe at home, a health emergency). Then say it once, plainly and kindly, and carry on helping. In every other case the conversation and the plan's steps stay free of referrals and of "this isn't treatment" disclaimers.`;

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

// Closing lines the planner (or this function) puts under a plan. A plan that
// is being continued never keeps one in the middle.
const CLOSING_RE = /continue expanding any remaining months|that completes the full plan|does this plan look good|ready to save it\?/i;
const COMPLETE_LINE = 'That completes the full plan — does this look good and are you ready to save it?';
function stripClosing(text: string): string {
  return String(text || '').split('\n')
    .filter((ln) => !(CLOSING_RE.test(ln) && !/^\s*(?:[-•*]|\d+\.)\s/.test(ln)))
    .join('\n').replace(/\s+$/, '');
}

// The plan from EVERY planner message (ADHDone; the Goals app read only the
// last one, so a long plan finished with "continue" saved only its last
// months). Each Month N comes from the most recent message that wrote it in
// full (as many weeks with content as its fullest version). How many months:
// the latest message that starts at Month 1 sets the length and messages
// after it (a continuation, a rewritten month) can only add to it, so a plan
// that was made shorter doesn't bring back the longer version's last months.
function assemblePlan(messages: any[]) {
  const plans = (Array.isArray(messages) ? messages : [])
    .filter((m) => m?.role === 'assistant' && /^\s*#{0,4}\s*\*{0,2}\s*Month\s+\d+/im.test(String(m.content || '')))
    .map((m) => {
      const text = stripClosing(String(m.content));
      const parsed = parsePlanWeeks(text);
      const byMonth = new Map<number, any[]>();
      for (const w of parsed.weeks) {
        if (!byMonth.has(w.month)) byMonth.set(w.month, []);
        byMonth.get(w.month)!.push(w);
      }
      const a = analyzePlan(text);
      return { text, byMonth, titles: parsed.monthTitles, reach: Math.max(a.maxMentioned, a.maxPresent) };
    });
  if (plans.length === 0) return null;
  const filled = (i: number, n: number) => (plans[i].byMonth.get(n) || []).filter((w: any) => w.bullets.length > 0).length;
  let fullIdx = -1;
  for (let i = plans.length - 1; i >= 0; i--) { if (filled(i, 1) > 0) { fullIdx = i; break; } }
  let limit = 0;
  for (let i = Math.max(0, fullIdx); i < plans.length; i++) limit = Math.max(limit, plans[i].reach);
  limit = Math.min(36, limit);
  const weeks: any[] = [];
  const monthTitles: Record<number, string> = {};
  for (let n = 1; n <= limit; n++) {
    let best = 0;
    for (let i = 0; i < plans.length; i++) best = Math.max(best, filled(i, n));
    if (best === 0) continue;
    const need = Math.min(4, best);
    let pick = -1;
    for (let i = plans.length - 1; i >= 0 && pick < 0; i--) if (filled(i, n) >= need) pick = i;
    weeks.push(...(plans[pick].byMonth.get(n) || []));
    if (plans[pick].titles[n]) monthTitles[n] = plans[pick].titles[n];
  }
  weeks.sort((a, b) => a.month - b.month || a.week - b.week);
  return { weeks, monthTitles, intro: plans[fullIdx >= 0 ? fullIdx : plans.length - 1].text, months: limit };
}

// ── Dates: the person's own day, not the server's (RULES.md: their time) ────
function localToday(tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
}

// The plan's length in months, from the timeline the PERSON gave, counted
// from their own today. Their newest message that names one wins, so a
// changed deadline counts. The planner's own words never set it (its "in the
// first 3 months" or a year next to the word "Month" used to), and nothing
// found means null: the model works it out from the conversation.
// Anna, Nov 1 2026: she said January 2028 (14 months away) and the plan view
// showed Months 15-36 empty. The Goals app took the first "<number> month"
// anywhere in the chat, planner included, and its "by January" ignored the
// year ("by January 2028" came out as 2 months).
const MONTH_WORDS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_NAME_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?';
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, eighteen: 18, 'twenty-four': 24, 'thirty-six': 36,
};
const NUM_RE = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty-four|thirty-six)';
const numOf = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : (NUMBER_WORDS[s.toLowerCase()] || 0));

function monthsFromText(text: string, nowYear: number, nowMonth: number): number | null {
  const t = String(text || '');
  const ok = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.min(36, n) : null);
  // A month with a year: "January 2028", "Jan 1, 2028", "the end of January 2028".
  // One that comes after a deadline word wins; otherwise the furthest one ahead.
  const datedRe = new RegExp(`\\b${MONTH_NAME_RE}\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?(20\\d{2})\\b`, 'gi');
  const deadlineBefore = /\b(?:by|before|until|till|deadline|due|end\s+of|finish(?:ed)?|done|complete(?:d)?|reach)\b[^.\n]*$/i;
  let deadline: number | null = null, furthest: number | null = null;
  for (const m of t.matchAll(datedRe)) {
    const ti = MONTH_WORDS[m[1].toLowerCase()];
    const n = (parseInt(m[2], 10) - nowYear) * 12 + (ti - nowMonth);
    if (n < 1) continue;
    if (deadlineBefore.test(t.slice(Math.max(0, (m.index || 0) - 30), m.index || 0))) deadline = Math.max(deadline || 0, n);
    furthest = Math.max(furthest || 0, n);
  }
  if (deadline || furthest) return ok((deadline || furthest) as number);
  // "6 months", "a 6-month plan", "in six months".
  const nm = t.match(new RegExp(`\\b${NUM_RE}[\\s-]+months?\\b`, 'i'));
  if (nm) return ok(numOf(nm[1]));
  // "in 2 years", "a two-year plan".
  const ny = t.match(new RegExp(`(?:\\bin\\s+${NUM_RE}\\s+years?\\b|\\b${NUM_RE}-years?\\b)`, 'i'));
  if (ny) return ok(numOf(ny[1] || ny[2]) * 12);
  // "in 8 weeks".
  const nw = t.match(/\bin\s+(\d{1,3})\s+weeks?\b/i);
  if (nw) return ok(Math.max(1, Math.round(parseInt(nw[1], 10) / 4)));
  // "by June" (no year): the next June.
  const bm = t.match(new RegExp(`\\b(?:by|before|until)\\s+(next\\s+|this\\s+|(?:the\\s+)?end\\s+of\\s+)?${MONTH_NAME_RE}(?!\\s+\\d)`, 'i'));
  if (bm) {
    const ti = MONTH_WORDS[bm[2].toLowerCase()];
    let ty = nowYear;
    if (ti <= nowMonth || /next/i.test(bm[1] || '')) ty++;
    return ok(Math.max(1, (ty - nowYear) * 12 + (ti - nowMonth)));
  }
  // "before 2028" = by its January; "by the end of 2028" = its December. A
  // bare "by 2028" could be either, and "next year" is no date at all: no
  // guess (a guess would be firm, planFirm), the planner asks or works it out
  // (Nov 1 2026: it asked "does 'by 2028' mean January 1, 2028, or the end
  // of 2028?" and the answer, "before January 2028", set 14).
  const yr = t.match(/\b(by|before)\s+((?:the\s+)?end\s+of\s+)?(20\d{2})\b/i);
  if (yr && (yr[2] || yr[1].toLowerCase() === 'before')) {
    const y = parseInt(yr[3], 10);
    const n = yr[2] ? (y - nowYear) * 12 + (11 - nowMonth) : (y - nowYear) * 12 - nowMonth;
    if (n >= 1) return ok(n);
  }
  if (/\b(?:by|before)\s+(?:the\s+)?end\s+of\s+(?:(?:this|the)\s+)?year\b/i.test(t)) return ok(Math.max(1, 11 - nowMonth));
  return null;
}

function detectMonths(messages: any[], today: string): number | null {
  const [ty0, tm0] = today.split('-').map(Number);
  const theirs = (Array.isArray(messages) ? messages : []).filter((m) => m?.role === 'user');
  for (let i = theirs.length - 1; i >= 0; i--) {
    const n = monthsFromText(String(theirs[i].content || ''), ty0, tm0 - 1);
    if (n) return n;
  }
  return null;
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
ONE ROUND ONLY: ask 4 to 6 questions in ONE numbered list, in ONE message, then write the plan after their reply. Fewer for a simple goal, up to 6 for one with more moving parts. Never a second round of questions: if they skip a question or answer vaguely, pick a sensible default, build the plan, and say in your summary what you assumed (they can change it). The people using this have ADHD: a long list is a wall. Rules for questions:
  a) Never ask two questions covering the same topic — merge them (start date + deadline in one; time of day + which days in one).
  b) Keep each question to one short sentence. Add a few words on why only when it isn't obvious — no "I'll use this to…" on every question.
  c) For purchase/savings goals, look up the item's real price first and reference it ("The 2026 Camry is ~$29,000 — full price or just a down payment?") instead of a generic "how much do you need?".
  d) Ask only what THIS goal's plan needs. From the list below, choose the 4–6 that matter most for it; skip anything they already told you.
  The questions to choose from:
   - ONE combined experience + prior attempts question (MANDATORY, every goal): "What's your current experience with this? Have you tried before — and if so, what worked or didn't?"
   - Obstacles/fears (MANDATORY, every goal): "What usually gets in the way, or worries you about it?" (build specific contingency steps for what they say)
   - The target amount/outcome (for finance goals, reference the real price).
   - Realistic monthly commitment (time or money).
   - Deadline/target date — ONLY if they haven't already stated one.
   - Start date: "When do you want to start?" (merge with the deadline question when you need both)
   - DAILY-ACTION GOALS ONLY (practice, reading, exercise, learning), as ONE question: "What time of day, and every day or just weekdays?" (or no set time)
   - BUDGET (ask for almost all goals — books, courses, tools, classes all cost money): "Do you have a budget for things like books, courses, or tools? A rough idea helps — or I can stick to free resources only." Skip ONLY for pure save/pay-off-money goals. Use the answer to filter resources strictly: no budget / no answer / vague / question not asked → FREE resources only (never recommend paid books, courses, or tools). A stated budget → tailor to fit it.
   - LOCAL RESOURCES (only for goals where in-person options genuinely help — music lessons, clubs, dance, martial arts, classes, etc.): ${userCity ? `the user's city is ${userCity}; ask if they want local resources included.` : `ask "What city are you in? (optional — I can include local classes, clubs, and meetups near you)".`} Ask this once only.

Once they have answered your ONE round of questions, write the plan in your next message (Phase 2). Do not ask follow-up questions first.

${PROFESSIONAL_HELP_RULE}

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

APPROVAL: When the user approves ("looks great", "perfect", "save it", "let's do it", "yes", "looks good"), FIRST verify the plan in the conversation covers every month from Month 1 to the last with no gaps. If it's incomplete, present the missing months instead. Only when the complete plan has been presented, start your response with EXACTLY "PLAN_APPROVED" then a warm 2–3 sentence summary, then add: "Remember, this plan is a living document. Come back to this chat anytime (open the goal and tap Change this plan) to adjust the difficulty, add resources, extend the timeline, skip ahead if you're crushing it, or restructure a phase. Just tell me what's working and what isn't — I'll update your plan instantly."

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

${PROFESSIONAL_HELP_RULE}

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

// ── The system prompt and the plan's length for a conversation ─────────────
// (Goals app logic, unchanged; shared by a chat turn and continue_plan.)
function planContext(p: {
  messages: any[]; goalId: string | null; city: string | null; today: string;
  existingGoals: any[]; stepsByGoal: Record<string, any[]>;
}) {
  const { messages, goalId, city, today, existingGoals, stepsByGoal } = p;
  const detectedMonths = detectMonths(messages, today);
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

  // A timeline the person gave is the plan's length: a stray "Months 15-36"
  // or a header past it doesn't make the plan longer (planFirm, expandPlan).
  // An edit can change the timeline, so there the plan's own months count.
  return { systemPrompt, planMonths, planFirm: !isEditSession && !!detectedMonths };
}

// Guarantee a plan draft is fully expanded into SEPARATE months (Goals app
// logic). ADHDone: when the time runs out with months still missing, the plan
// so far comes back with incomplete, months_done and months_total (and no
// closing line), and the Planner asks for the rest (continue_plan, a fresh
// time budget each call). The Goals app closed it with "You can also ask me
// to continue expanding any remaining months", and the months never came.
const HARD_CAP_MONTHS = 36;
async function expandPlan(openai: any, systemPrompt: string, messages: any[], startText: string, planMonths: number | null, startedAt: number, planFirm = false) {
  const remaining = () => CHAT_BUDGET_MS - (Date.now() - startedAt);
  const expectedFor = (a: any) => Math.min(HARD_CAP_MONTHS, planFirm && planMonths ? planMonths : Math.max(planMonths || 0, a.maxMentioned));
  let text = startText;
  let stalls = 0;
  for (let attempt = 0; attempt < 16; attempt++) {
    const a = analyzePlan(text);
    const expected = expectedFor(a);
    if (a.contig >= expected && !a.groupingPresent) break;
    const from = a.contig + 1;
    if (from > expected) break;
    if (remaining() < 60 * 1000) break; // out of time: the Planner asks for the rest
    const cut = a.contig >= 1
      ? a.sectionEnd(a.headerIdx[a.contig])
      : (a.firstHeaderIdx >= 0 ? a.firstHeaderIdx : a.lines.length);
    const head = stripClosing(a.lines.slice(0, cut).join('\n'));
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
    const candidate = (addition && addition.trim()) ? head + '\n\n' + addition.trim() : null;
    if (candidate && analyzePlan(candidate).contig > a.contig) {
      text = candidate;
      stalls = 0;
    } else if (++stalls >= 3) {
      break;
    }
  }
  const fin = analyzePlan(text);
  const finExpected = expectedFor(fin);
  const progress = { months_done: Math.min(fin.contig, finExpected), months_total: finExpected };
  if (fin.contig < finExpected || fin.rangePresent) {
    const cut = fin.contig >= 1
      ? fin.sectionEnd(fin.headerIdx[fin.contig])
      : (fin.firstHeaderIdx >= 0 ? fin.firstHeaderIdx : fin.lines.length);
    const head = stripClosing(fin.lines.slice(0, cut).join('\n'));
    if (fin.contig >= finExpected) return { text: head + '\n\n' + COMPLETE_LINE, incomplete: false, ...progress };
    return { text: head, incomplete: true, ...progress };
  }
  if (!/\?\s*$/.test(text.trim())) text = text.trim() + '\n\n' + COMPLETE_LINE;
  return { text, incomplete: false, ...progress };
}

// Month titles from a plan's text (verbatim from the Goals app).
function monthTitlesFrom(finalReply: string): Record<number, string> {
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
  return chatMonthTitles;
}

// ── CHAT: one planner turn ─────────────────────────────────────────────────
async function runChat(openai: any, p: {
  messages: any[]; goalId: string | null; city: string | null; today: string; startedAt: number;
  existingGoals: any[]; stepsByGoal: Record<string, any[]>;
}) {
  const { messages, goalId, startedAt } = p;
  const isEditSession = !!goalId;
  const remaining = () => CHAT_BUDGET_MS - (Date.now() - startedAt);

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

  const { systemPrompt, planMonths, planFirm } = planContext(p);

  let finalReply = await modelTurn(openai, systemPrompt, messages, remaining() - 10 * 1000);
  if (!finalReply.trim()) throw new Error('The planner gave an empty answer');

  const isApproval = /\b(?:PLAN_APPROVED|EDIT_APPROVED)\b/i.test(finalReply);
  const looksLikePlan = /^\s*#{0,4}\s*\*{0,2}\s*Month\s+\d+/im.test(finalReply);
  // incomplete / months_done / months_total: see expandPlan.
  let progress: any = {};
  if (!isApproval && looksLikePlan) {
    const r = await expandPlan(openai, systemPrompt, messages, finalReply, planMonths, startedAt, planFirm);
    finalReply = r.text;
    progress = { incomplete: r.incomplete, months_done: r.months_done, months_total: r.months_total };
  }

  if (isEditSession && finalReply.includes('EDIT_APPROVED')) {
    return { message: finalReply.replace(/EDIT_APPROVED\s*/i, '').trim(), action: 'edit_approved', goal_id: goalId, ...progress };
  }
  if (finalReply.includes('PLAN_APPROVED')) {
    return { message: finalReply.replace(/PLAN_APPROVED\s*/i, '').trim(), action: 'plan_proposed', ...progress };
  }
  const editMatch = finalReply.match(/EDIT_APPROVED:([^\s]+)/i);
  if (editMatch) {
    return { message: finalReply.replace(/EDIT_APPROVED:[^\s]+\s*/i, '').trim(), action: 'edit_approved', goal_id: editMatch[1], ...progress };
  }
  return { message: finalReply, action: 'chat', month_titles: monthTitlesFrom(finalReply), ...progress };
}

// ── CONTINUE PLAN: the months a long plan is still missing ─────────────────
// The Planner calls this when a plan came back incomplete; the same
// continuation passes as a chat turn, from the plan as it stands, with this
// call's own time budget. `messages` is the conversation before the plan.
async function continuePlan(openai: any, p: {
  messages: any[]; planText: string; goalId: string | null; city: string | null; today: string; startedAt: number;
  existingGoals: any[]; stepsByGoal: Record<string, any[]>;
}) {
  const { systemPrompt, planMonths, planFirm } = planContext(p);
  const r = await expandPlan(openai, systemPrompt, p.messages, stripClosing(p.planText), planMonths, p.startedAt, planFirm);
  return {
    message: r.text,
    action: 'chat',
    month_titles: monthTitlesFrom(r.text),
    incomplete: r.incomplete,
    months_done: r.months_done,
    months_total: r.months_total,
  };
}

// A bullet that starts with a day, not a topic: "Monday:", "Mon–Fri:", "Day 3:", "Weekdays:".
const DAY_LABEL_RE = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)\b|^(?:days?\s*\d+|weekdays?|weekends?|daily|every\s+day|each\s+day)\b/i;

// The short focus in a step's title ("Week N: <focus>"), from the week's first
// bullet (its concrete action). The step's title is its task's name. Used by
// extract_plan and step_feedback alike.
function weekFocus(firstBullet: string): string {
  const first = String(firstBullet || '').replace(/^\s*(?:[-•*]|\d+\.)\s+/, '').replace(/\*\*/g, '').trim();
  // The label ends at the first colon that isn't inside a clock time: "Each
  // night at 9:00 PM: Spend…" made "Week 1: Each night at 9" (Nov 1 2026).
  const cut = first.search(/:(?!\d)/);
  let focus = (cut > 0 ? first.slice(0, cut) : first).trim();
  // A label that says WHEN, not what ("Monday:", "Day 3:", "Each night at
  // 9:00 PM:") made every step "Week N: Monday" (Nov 1 2026 self-test). Then
  // the focus is that first thing to do.
  const whenLabel = DAY_LABEL_RE.test(focus) || /^(?:each|every)\s+\w+/i.test(focus) || /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(focus);
  if (cut > 0 && whenLabel) {
    focus = first.slice(cut + 1).trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '').trim() || focus;
  }
  // Too long for a task's name: cut at a word, with "…" so it reads as cut
  // ("Week 1: On your first day, spend ten minutes sampling one new" looked
  // finished, Nov 1 2026). The full step is in its description.
  if (focus.length > 60) focus = focus.slice(0, 60).replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '').trim() + '…';
  return focus;
}

// ── EXTRACT PLAN: the already-written plan → structured JSON (nothing saved) ─
async function extractPlan(openai: any, messages: any[], today: string) {
  const conversationText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Planner'}: ${m.content}`).join('\n\n');
  const detectedMonths = detectMonths(messages, today);
  // The newest planner message that is a plan (a question asked after it,
  // like "why does it stop at Month 14?", leaves an answer that isn't one).
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant' && /^\s*#{0,4}\s*\*{0,2}\s*Month\s+\d+/im.test(String(m.content || '')))
    || [...messages].reverse().find((m) => m.role === 'assistant');
  const planText = lastAssistantMessage?.content || conversationText;

  // ADHDone: the plan is built from EVERY planner message (assemblePlan), so a
  // long plan finished with "continue", or a month rewritten later, is all in.
  // (The AI fallback below still reads the last message, as before.)
  const assembled = assemblePlan(messages);
  const parsedWeeks = assembled ? assembled.weeks : [];
  const parsedMonthTitles = assembled ? assembled.monthTitles : {};
  const planIntro = assembled ? assembled.intro : planText;
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
          { role: 'user', content: `User said:\n${userText}\n\nPlan intro:\n${planIntro.slice(0, 1200)}\n\nFrom the user's text above, extract BOTH the time of day they want to do it AND their start date. For start_date, resolve relative phrasing ("next month", "in July", "start in July", "now") to a real YYYY-MM-DD using today = ${today}. Return the JSON.` },
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
      const focus = weekFocus(bullets[0] || '');
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
  const existingGoal = (await base44.entities.Goal.filter({ id: goalId }))?.[0];
  if (!existingGoal) throw new Error('Goal not found');
  const existingSteps = await base44.entities.GoalStep.filter({ goal_id: goalId }, 'order_index', 1000);
  const completedSteps = existingSteps.filter((s: any) => s.status === 'completed');
  const replaceableSteps = existingSteps.filter((s: any) => s.status !== 'completed');

  const { goalUpdates, otherUpdates, newSteps } = await extractEdit(openai, messages, existingGoal, today);
  if (Object.keys(otherUpdates).length > 0) await base44.entities.Goal.update(goalId, otherUpdates);
  if (goalUpdates.month_titles && typeof goalUpdates.month_titles === 'object' && Object.keys(goalUpdates.month_titles).length > 0) {
    await base44.entities.Goal.update(goalId, { month_titles: { ...(existingGoal.month_titles || {}), ...goalUpdates.month_titles } });
  }

  // A plan that came back empty replaces nothing (the Goals app would have
  // deleted every open step and created none).
  if (newSteps.length === 0) {
    return { success: false, error: 'No steps found in the new plan', steps_replaced: 0, steps_created: 0, completed_kept: completedSteps.length };
  }

  for (const step of replaceableSteps) {
    await base44.entities.GoalStep.delete(step.id);
  }

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

// What an edit conversation changes: the goal's fields and its full new step
// list, read by the model from the conversation (Goals app logic). Writes
// nothing; applyEdit saves it, and the self-test's edit stage only looks.
async function extractEdit(openai: any, messages: any[], existingGoal: any, today: string) {
  const conversationText = messages.map((m) => `${m.role === 'user' ? 'User' : 'Planner'}: ${m.content}`).join('\n\n');
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

  const newSteps = Array.isArray(extracted.new_steps) ? extracted.new_steps : [];
  newSteps.sort((a: any, b: any) => {
    const aMonth = parseInt(a.phase?.match(/Month (\d+)/i)?.[1] || 0);
    const bMonth = parseInt(b.phase?.match(/Month (\d+)/i)?.[1] || 0);
    if (aMonth !== bMonth) return aMonth - bMonth;
    const aWeek = parseInt(a.phase?.match(/Week (\d+)/i)?.[1] || 0);
    const bWeek = parseInt(b.phase?.match(/Week (\d+)/i)?.[1] || 0);
    return aWeek - bWeek;
  });
  return { goalUpdates, otherUpdates, newSteps };
}

// ── STEP FEEDBACK: "How did it go?" adjusts the weeks ahead ───────────────────
// Anna, Nov 1 2026: "Anytime someone checks a milestone or whatever done, ask
// them how it went... It would be nice if the plan chat could basically read
// any feedback it gets and adjust the rest of the plan if it needs adjusting.
// Like if they come back saying the paper collage etc was not helpful.. the
// planner chat would make sure the following weeks are not more of the same."
// The model reads what they said (and everything they said about earlier
// weeks) and rewrites only upcoming weeks, in place: never a finished one,
// only the rest of the month they're in and the next one, and nothing at all
// when the plan already fits. Rows are updated, never deleted or made, so the
// step's task stays linked; the goal page then gives that task the step's new
// name and note if they were still the old ones (GoalDetail carryToTasks).
const stepMonth = (s: any) => parseInt(String(s?.phase || '').match(/Month\s*(\d+)/i)?.[1] || '0', 10);
const stepWeek = (s: any) => parseInt(String(s?.phase || '').match(/Week\s*(\d+)/i)?.[1] || '0', 10);

async function planFromFeedback(openai: any, p: { goal: any; steps: any[]; step: any; feedback: string; today: string; daysLate?: number }) {
  const { goal, step, feedback, today } = p;
  // Checked off after its week ended (Anna, Nov 1 2026: "if someone checks
  // off late, the plan can readjust"): the app has already moved the later
  // weeks' dates (goalWeeks.lateFinishShift); the planner may lighten them.
  const daysLate = Math.max(0, Math.round(Number(p.daysLate) || 0));
  const sorted = [...(p.steps || [])].sort((a: any, b: any) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
  const isDone = (s: any) => s.status === 'completed' || s.status === 'skipped' || s.id === step.id;
  const open = sorted.filter((s: any) => !isDone(s));
  const firstMonth = open.length ? stepMonth(open[0]) : 0;
  // The rest of the month they're in and the next one, at most 10 weeks.
  const window = open.filter((s: any) => !firstMonth || !stepMonth(s) || stepMonth(s) <= firstMonth + 1).slice(0, 10);
  if (window.length === 0) {
    return { kept: true, summary: 'Thanks for telling me how it went. That was the last step in the plan, so there was nothing left to change.', changes: [] as any[] };
  }
  const earlier = sorted.filter((s: any) => s.id !== step.id && String(s.feedback || '').trim())
    .map((s: any) => `- ${s.phase || ''} "${s.title}": ${String(s.feedback).slice(0, 600)}`);
  const theyPlanned = (Array.isArray(goal?.conversation_history) ? goal.conversation_history : [])
    .filter((m: any) => m?.role === 'user' && String(m.content || '').trim())
    .map((m: any) => `- ${String(m.content).slice(0, 700)}`).join('\n').slice(0, 4000);
  const weekBlock = (s: any) => [
    `id: ${s.id}`,
    `phase: ${s.phase || ''}`,
    `title: ${s.title || ''}`,
    `description:\n${String(s.description || '').slice(0, 2500)}`,
    Array.isArray(s.success_criteria) && s.success_criteria.length ? `success criteria: ${s.success_criteria.join(' | ')}` : '',
    s.tips_and_guidance ? `tips: ${String(s.tips_and_guidance).slice(0, 600)}` : '',
  ].filter(Boolean).join('\n');

  const system = `You are the goal planner inside ADHDone. Someone just finished a week of their goal plan and told you how it went, in their own words. Decide whether the weeks ahead should change, and if so, rewrite them.

${APP_RULE}

${PROFESSIONAL_HELP_RULE}

HOW TO DECIDE (judgment, the way a good coach would; not keywords):
- Change upcoming weeks only when what they said calls for it: an activity that didn't help or didn't suit them, too hard or too easy, too long, no time, something they disliked, a new constraint, or something that worked well and is worth building on.
- Something didn't help: the weeks ahead must not repeat that KIND of activity, not just that exact one (if a crafts exercise felt pointless, no more crafts-style exercises), unless they said otherwise. Replace it with something that fits what they told you when planning and now: start from what they said worked, what they enjoy or used to enjoy, and the kind of help they asked for. The replacement is a real, specific activity that does the same job for the goal, never a vaguer or smaller version of the thing that didn't help. Stop asking for what didn't help, but never forbid it or tell them not to do it: a reflection that used to be written becomes one to think over, with writing left up to them ("think it over, writing optional"), not "without writing".
- Something helped: build on it, so it grows over the coming weeks.
- Keep the goal, its timeline and the order of the weeks. Keep each week's theme unless the feedback says the direction itself is wrong.
- Their answer is positive, neutral or very short, and the plan already fits: change nothing. Never rewrite for the sake of it.
- They finished late (see TIMING, when it's there): the app has already moved the later weeks' dates, so never change dates or the number of weeks. Late is common and isn't a failure. Make the next few weeks lighter (smaller, shorter, fewer things) only when what they said, or how late it was, suggests the load is too much for them; keep what's working. A little late with a positive answer: change nothing.
- Respect everything they set when planning: budget, time per day or week, start and end, what kind of help they want.
- Same format and depth as the existing weeks: the first line is the concrete thing to do this week, then the same kind of lines (for example "Focus on: ...", "Reflect: ...", "Activity: ..."), one per line. No markdown headings, no bullets characters. Keep a link a week already has unless that activity is gone.
- Only the weeks under UPCOMING may change, and only return the ones you change, by their id.

Answer with JSON only:
{"change": true | false,
 "summary": "1-3 short plain sentences TO THEM: what you took out, what you put in its place (name the new activity itself, e.g. 'a 10-minute walk with no destination'), and which weeks; or that the plan stays as it is and why. Warm, no pep talk, no promises of reminders or check-ins.",
 "steps": [{"id": "<id from UPCOMING>", "description": "the rewritten week, one line per item", "success_criteria": ["2-4 concrete done-checks"], "tips_and_guidance": "a short helpful note, or empty"}]}`;

  const user = [
    `TODAY: ${today}`,
    `GOAL: "${goal?.title || ''}"${goal?.timeline ? ` (${goal.timeline})` : ''}${goal?.description ? ` — ${String(goal.description).slice(0, 400)}` : ''}`,
    theyPlanned ? `WHAT THEY SAID WHEN PLANNING (their words):\n${theyPlanned}` : '',
    earlier.length ? `WHAT THEY SAID ABOUT EARLIER WEEKS:\n${earlier.join('\n')}` : '',
    `THE WEEK THEY JUST FINISHED:\n${weekBlock(step)}`,
    daysLate > 0 ? `TIMING: they checked this week off ${daysLate} day${daysLate === 1 ? '' : 's'} after it was due. The weeks after it have already been moved later to match.` : '',
    `HOW IT WENT, IN THEIR WORDS: "${String(feedback).slice(0, 2000)}"`,
    `UPCOMING (the only weeks you may change):\n\n${window.map(weekBlock).join('\n\n')}`,
  ].filter(Boolean).join('\n\n');

  let out: any = {};
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      reasoning_effort: 'medium',
      max_completion_tokens: 16000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    out = JSON.parse(res.choices?.[0]?.message?.content || '{}') || {};
  } catch (e: any) {
    console.error('[goalPlannerChat] step_feedback model call failed:', e?.message || e);
    throw new Error('The planner could not read your feedback right now');
  }
  const byId = new Map(window.map((s: any) => [s.id, s]));
  const changes: any[] = [];
  if (out.change === true && Array.isArray(out.steps)) {
    for (const c of out.steps) {
      const s = byId.get(String(c?.id || ''));
      const description = String(c?.description || '').trim();
      if (!s || !description) continue;
      byId.delete(s.id); // once each
      const focus = weekFocus(description.split('\n').map((l) => l.trim()).find(Boolean) || '');
      const wk = stepWeek(s);
      changes.push({
        id: s.id,
        phase: s.phase || '',
        old_title: s.title || '',
        old_description: s.description || '',
        title: focus ? `${wk ? `Week ${wk}: ` : ''}${focus}` : (s.title || ''),
        description,
        success_criteria: Array.isArray(c?.success_criteria) ? c.success_criteria.map((x: any) => String(x)).filter(Boolean).slice(0, 6) : (s.success_criteria || []),
        tips_and_guidance: typeof c?.tips_and_guidance === 'string' ? c.tips_and_guidance : (s.tips_and_guidance || ''),
      });
    }
  }
  const summary = String(out.summary || '').trim() ||
    (changes.length ? `I changed ${changes.length} of the weeks ahead to fit what you said.` : 'Thanks for telling me how it went. The weeks ahead still fit, so I left them as they are.');
  return { kept: changes.length === 0, summary, changes };
}

// The goal's chat gets the exchange, so "Change this plan" shows it.
function feedbackTurns(step: any, feedback: string, summary: string) {
  const label = stepWeek(step) ? `${stepMonth(step) ? `Month ${stepMonth(step)}, ` : ''}Week ${stepWeek(step)}` : (step?.title || 'that step');
  return [
    { role: 'user', content: `How ${label} went: ${feedback}` },
    { role: 'assistant', content: summary },
  ];
}

async function stepFeedback(base44: any, openai: any, goalId: string, stepId: string, feedbackIn: string, today: string, daysLateIn = 0) {
  const goal = (await base44.entities.Goal.filter({ id: goalId }))?.[0];
  if (!goal) return { error: 'Goal not found' };
  const steps = await base44.entities.GoalStep.filter({ goal_id: goalId }, 'order_index', 1000);
  const step = (steps || []).find((s: any) => s.id === stepId);
  if (!step) return { error: 'Step not found' };
  const feedback = String(feedbackIn || step.feedback || '').trim();
  if (!feedback) return { error: 'No feedback to read' };
  const daysLate = Math.max(Number(step.finished_days_late) || 0, Number(daysLateIn) || 0);
  const r = await planFromFeedback(openai, { goal, steps, step, feedback, today, daysLate });
  for (const c of r.changes) {
    await base44.entities.GoalStep.update(c.id, {
      title: c.title,
      description: c.description,
      success_criteria: c.success_criteria,
      tips_and_guidance: c.tips_and_guidance,
    });
  }
  try {
    const history = Array.isArray(goal.conversation_history) ? goal.conversation_history : [];
    await base44.entities.Goal.update(goalId, { conversation_history: [...history, ...feedbackTurns(step, feedback, r.summary)] });
  } catch (e: any) {
    console.error('[goalPlannerChat] could not add the feedback to the goal chat:', e?.message || e);
  }
  console.log(`[goalPlannerChat] step_feedback: ${r.changes.length} upcoming week(s) changed for goal ${goalId}`);
  return {
    success: true,
    kept: r.kept,
    summary: r.summary,
    changed: r.changes.map((c: any) => ({ id: c.id, phase: c.phase, old_title: c.old_title, title: c.title, old_description: c.old_description, description: c.description })),
  };
}

// ── Admin self-test ────────────────────────────────────────────────────────
// Runs the planner on a sample goal, its questions answered from `answers` in
// order, through to the full plan and its extraction. Reads and writes
// nothing. A long plan needs more than one call (each call has the planner's
// time budget), so every answer carries `next`: the exact body for the next
// call, until `done`. Stages:
//   chat     — the questions, then the plan (as the app's chat turns)
//   continue — the months still missing (as the app's continue_plan)
//   extract  — extract_plan on the finished plan, and a check that the same
//              plan split over two planner messages (as when someone types
//              "continue") assembles to the same months and weeks
async function selfTest(openai: any, body: any, today: string) {
  const startedAt = Date.now();
  const stage = ['chat', 'continue', 'extract', 'edit', 'edit_apply', 'feedback'].includes(body?.stage) ? body.stage : 'chat';
  const call = Math.max(1, Number(body?.call) || 1);
  const remaining = () => CHAT_BUDGET_MS - (Date.now() - startedAt);
  const seconds = () => Math.round((Date.now() - startedAt) / 1000);
  const base = { selftest: true, saved: false, stage, call, today };
  const none = { existingGoals: [] as any[], stepsByGoal: {} as Record<string, any[]> };
  const isPlan = (t: string) => /^\s*#{0,4}\s*\*{0,2}\s*Month\s+\d+/im.test(t) && /Week\s+\d+/i.test(t);
  // Any line that sounds like it promises a reminder, a check-in or a
  // message: the prompt says never to (APP_RULE); this shows if it slipped.
  const promisesIn = (t: string) => String(t || '').split('\n')
    .filter((ln) => /\b(remind|reminder|notification|notify|check[- ]in|i'?ll (send|check|text|message|ping)|you'?ll (get|receive))\b/i.test(ln))
    .map((ln) => ln.trim()).slice(0, 20);
  // Lines that send them to a professional (PROFESSIONAL_HELP_RULE: only for
  // a risk or something seriously worrying).
  const referralsIn = (t: string) => String(t || '').split('\n')
    .filter((ln) => /\b(therap(y|ist)|counsel(or|ing)|psychiatr\w*|psycholog\w*|doctor|clinician|professional (help|support)|crisis|hotline|988|treatment)\b/i.test(ln))
    .map((ln) => ln.trim().slice(0, 200)).slice(0, 20);
  const monthsWritten = (t: string) => {
    const a = analyzePlan(stripClosing(t));
    return Object.keys(a.headerIdx).map(Number).filter((n) => n >= 1).sort((x, y) => x - y);
  };
  const afterPlan = (convo: any[], planText: string, r: any, extra: any) => ({
    ...base,
    ...extra,
    seconds: seconds(),
    plan_reached: true,
    incomplete: r.incomplete === true,
    months_done: r.months_done,
    months_total: r.months_total,
    months_with_headers: monthsWritten(planText),
    reminder_promise_lines: promisesIn(planText),
    referral_lines: referralsIn([...(extra?.turns || []).map((t: any) => t?.message || ''), planText].join('\n')),
    plan_start: planText.slice(0, 1200),
    plan_end: planText.slice(-600),
    done: false,
    next: r.incomplete === true
      ? { selftest: true, stage: 'continue', call: call + 1, messages: convo, plan_text: planText, tz: body?.tz || null }
      : { selftest: true, stage: 'extract', call: call + 1, messages: [...convo, { role: 'assistant', content: planText }], tz: body?.tz || null },
  });

  if (stage === 'chat') {
    const messages = cleanMessages(body?.messages);
    if (messages.length === 0) {
      const goal = String(body?.goal || '').trim();
      if (!goal) return { error: 'goal (text) is required' };
      messages.push({ role: 'user', content: goal });
    }
    let answers: string[] = Array.isArray(body?.answers) ? body.answers.map((a: any) => String(a || '').trim()).filter(Boolean) : [];
    const turns: any[] = [];
    while (true) {
      if (turns.length > 0 && remaining() < 150 * 1000) {
        return { ...base, seconds: seconds(), turns, plan_reached: false, done: false, next: { selftest: true, stage: 'chat', call: call + 1, messages, answers, tz: body?.tz || null } };
      }
      const r: any = await runChat(openai, { messages, goalId: null, city: null, today, startedAt, ...none });
      const plan = isPlan(r.message);
      turns.push({ action: r.action, message: plan ? '(the plan: see plan_start / plan_end)' : r.message });
      if (r.action === 'safety_flag') return { ...base, seconds: seconds(), turns, plan_reached: false, done: true };
      if (plan) return afterPlan(messages, r.message, r, { turns });
      messages.push({ role: 'assistant', content: r.message });
      if (answers.length === 0) {
        return { ...base, seconds: seconds(), turns, plan_reached: false, done: true, note: 'The planner asked more than the answers given; add answers and run again.' };
      }
      messages.push({ role: 'user', content: answers[0] });
      answers = answers.slice(1);
    }
  }

  if (stage === 'continue') {
    const convo = cleanMessages(body?.messages);
    const planText = String(body?.plan_text || '');
    if (convo.length === 0 || !planText.trim()) return { error: 'messages and plan_text are required' };
    const r = await continuePlan(openai, { messages: convo, planText, goalId: null, city: null, today, startedAt, ...none });
    return afterPlan(convo, r.message, r, {});
  }

  // feedback — "How did it go?" (STEP FEEDBACK): the plan as if saved (nothing
  // is), the step at done_index (default 0) finished with `feedback`, and what
  // the planner would change in the weeks ahead. Writes nothing.
  if (stage === 'feedback') {
    const convo = cleanMessages(body?.messages);
    const feedback = String(body?.feedback || '').trim();
    if (convo.length === 0 || !feedback) return { error: 'messages (a conversation that ends with the plan) and feedback are required' };
    const plan: any = await extractPlan(openai, convo, today);
    const goal: any = { id: 'selftest-goal', title: plan.title, description: plan.description, timeline: plan.timeline, conversation_history: convo };
    const doneAt = Math.max(0, Number(body?.done_index) || 0);
    const steps = (plan.steps || []).map((s: any, i: number) => ({
      ...s, id: `selftest-step-${i}`, goal_id: goal.id, order_index: i,
      status: i <= doneAt ? 'completed' : 'pending',
      ...(i === doneAt ? { feedback } : {}),
    }));
    const step = steps[doneAt];
    if (!step) return { error: 'done_index is past the last step' };
    const daysLate = Math.max(0, Number(body?.days_late) || 0);
    const r = await planFromFeedback(openai, { goal, steps, step, feedback, today, daysLate });
    return {
      ...base, seconds: seconds(), done: true,
      finished_step: { phase: step.phase, title: step.title },
      feedback,
      days_late: daysLate,
      kept: r.kept,
      summary: r.summary,
      steps_after_it: steps.length - doneAt - 1,
      changed: r.changes.map((c: any) => ({ phase: c.phase, old_title: c.old_title, title: c.title, description: String(c.description).slice(0, 500) })),
      unchanged_next: steps.slice(doneAt + 1, doneAt + 6).filter((s: any) => !r.changes.some((c: any) => c.id === s.id)).map((s: any) => ({ phase: s.phase, title: s.title })),
    };
  }

  // edit — coming back to a saved goal (its Change this plan button opens
  // /Planner?edit=<id>, the chat it was made in): an edit session on this
  // plan as if it were saved (nothing is), a change asked for, then "yes".
  // edit_apply — what applying that edit would save (extractEdit; no writes).
  if (stage === 'edit') {
    const convo = cleanMessages(body?.messages);
    if (convo.length === 0) return { error: 'messages (a conversation that ends with the plan) are required' };
    const plan: any = await extractPlan(openai, convo, today);
    const goal: any = {
      id: 'selftest-goal', title: plan.title, description: plan.description, plan_summary: plan.plan_summary,
      timeline: plan.timeline, target_date: plan.target_date, start_date: plan.start_date, status: 'active',
      created_date: today, month_titles: plan.month_titles || {}, requires_daily_action: plan.requires_daily_action,
      conversation_history: convo,
    };
    const steps = (plan.steps || []).map((s: any, i: number) => ({ ...s, id: `selftest-step-${i}`, goal_id: goal.id, status: 'pending' }));
    const ask = String(body?.edit_request || 'Month 2 feels too hard for me. Can you make it easier?');
    const msgs: any[] = [...convo, { role: 'user', content: ask }];
    const ctx = { goalId: goal.id, city: null, today, startedAt, existingGoals: [goal], stepsByGoal: { [goal.id]: steps } };
    const turns: any[] = [];
    let r: any = await runChat(openai, { messages: msgs, ...ctx });
    turns.push({ action: r.action, message: String(r.message || '').slice(0, 1500) });
    msgs.push({ role: 'assistant', content: String(r.message || '') });
    if (r.action !== 'edit_approved' && remaining() > 60 * 1000) {
      msgs.push({ role: 'user', content: 'yes' });
      r = await runChat(openai, { messages: msgs, ...ctx });
      turns.push({ action: r.action, message: String(r.message || '').slice(0, 1500) });
      msgs.push({ role: 'assistant', content: String(r.message || '') });
    }
    const { conversation_history: _h, ...goalShown } = goal;
    return {
      ...base, seconds: seconds(), steps_before: steps.length, turns, approved: r.action === 'edit_approved', done: false,
      next: { selftest: true, stage: 'edit_apply', call: call + 1, messages: msgs, goal: goalShown, tz: body?.tz || null },
    };
  }
  if (stage === 'edit_apply') {
    const convo = cleanMessages(body?.messages);
    if (convo.length === 0) return { error: 'messages are required' };
    const { goalUpdates, otherUpdates, newSteps } = await extractEdit(openai, convo, body?.goal || {}, today);
    const monthOf = (s: any) => parseInt(String(s?.phase || '').match(/Month\s+(\d+)/i)?.[1] || '0', 10);
    return {
      ...base, seconds: seconds(), done: true,
      would_save: newSteps.length > 0,
      steps_after: newSteps.length,
      months_after: [...new Set(newSteps.map(monthOf).filter((n: number) => n > 0))].sort((a: any, b: any) => a - b),
      goal_updates: otherUpdates,
      month_titles_changed: Object.keys(goalUpdates?.month_titles || {}).length,
      month2_steps: newSteps.filter((s: any) => monthOf(s) === 2).map((s: any) => ({ title: s.title, description: String(s.description || '').slice(0, 300) })),
    };
  }

  // extract
  const convo = cleanMessages(body?.messages);
  if (convo.length === 0) return { error: 'messages are required' };
  const plan: any = await extractPlan(openai, convo, today);
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const months = [...new Set(steps.map((st: any) => parseInt(String(st.phase || '').match(/Month\s+(\d+)/i)?.[1] || '0', 10)).filter((n: number) => n > 0))].sort((x: any, y: any) => x - y);
  const timelineMonths = parseInt(String(plan?.timeline || '').match(/\d+/)?.[0] || '0', 10);
  const missing: number[] = [];
  for (let n = 1; n <= timelineMonths; n++) if (!months.includes(n)) missing.push(n);
  let merge_check: any = null;
  const last = convo[convo.length - 1];
  if (last?.role === 'assistant') {
    const a = analyzePlan(stripClosing(last.content));
    const mid = Math.floor(a.contig / 2) + 1;
    if (a.contig >= 2 && a.headerIdx[mid] != null) {
      const split = [
        ...convo.slice(0, -1),
        { role: 'assistant', content: a.lines.slice(0, a.headerIdx[mid]).join('\n') },
        { role: 'user', content: 'continue' },
        { role: 'assistant', content: a.lines.slice(a.headerIdx[mid]).join('\n') },
      ];
      const whole = assemblePlan(convo);
      const parts = assemblePlan(split);
      const monthsOf = (x: any) => [...new Set((x?.weeks || []).map((w: any) => w.month))].sort((p: any, q: any) => p - q);
      merge_check = {
        split_at_month: mid,
        months_one_message: monthsOf(whole).length,
        months_two_messages: monthsOf(parts).length,
        weeks_one_message: whole?.weeks.length || 0,
        weeks_two_messages: parts?.weeks.length || 0,
        same: JSON.stringify(monthsOf(whole)) === JSON.stringify(monthsOf(parts)) && (whole?.weeks.length || 0) === (parts?.weeks.length || 0),
      };
    }
  }
  return {
    ...base,
    seconds: seconds(),
    done: true,
    timeline: plan?.timeline,
    steps_count: steps.length,
    months_with_steps: months.length,
    months_missing: missing,
    all_months_have_steps: months.length > 0 && missing.length === 0,
    merge_check,
    plan: { ...plan, steps: steps.slice(0, 6), steps_left_out_of_this_preview: Math.max(0, steps.length - 6) },
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

    // "How did it go?" after a step was marked done: adjust the weeks ahead.
    if (mode === 'step_feedback') {
      const stepId = typeof body?.step_id === 'string' ? body.step_id : '';
      if (!goalId || !stepId) return Response.json({ error: 'goal_id and step_id required' }, { status: 400 });
      const out: any = await stepFeedback(base44, openai, goalId, stepId, typeof body?.feedback === 'string' ? body.feedback : '', today, Number(body?.days_late) || 0);
      return Response.json(out, { status: out.error ? 422 : 200 });
    }

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

    // CHAT and CONTINUE PLAN. The user's own goals and steps (RLS scopes to their own).
    let existingGoals: any[] = [];
    try { existingGoals = await base44.entities.Goal.list('-created_date', 50); } catch (_) { existingGoals = []; }
    const stepsByGoal: Record<string, any[]> = {};
    for (const g of existingGoals) {
      try {
        const steps = await base44.entities.GoalStep.filter({ goal_id: g.id }, 'order_index', 1000);
        stepsByGoal[g.id] = (steps || []).sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
      } catch (_) { stepsByGoal[g.id] = []; }
    }
    const city = typeof body?.city === 'string' ? body.city : null;
    if (mode === 'continue_plan') {
      const planText = String(body?.plan_text || '');
      if (!planText.trim()) return Response.json({ error: 'plan_text required' }, { status: 400 });
      // The conversation before the plan (the plan itself may be sent too).
      let convo = messages;
      const lastMsg = convo[convo.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content.trim() === planText.trim()) convo = convo.slice(0, -1);
      const out = await continuePlan(openai, {
        messages: convo, planText, goalId, city, today, startedAt: Date.now(), existingGoals, stepsByGoal,
      });
      return Response.json(out);
    }
    const out = await runChat(openai, {
      messages, goalId, city, today,
      startedAt: Date.now(), existingGoals, stepsByGoal,
    });
    return Response.json(out);
  } catch (error: any) {
    console.error('[goalPlannerChat] failed:', error?.status, error?.message);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
