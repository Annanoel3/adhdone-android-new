import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI from "npm:openai";

// THE one place that decides what kind of thing a capture is: a task, an idea
// (Parking Lot), a birthday, something meant for ADHDone itself, or a mix.
//
// Every way of adding something asks this exact question, about the WHOLE
// capture and before anything is split up or broken into steps: the Add Task
// screen, the home quick-add, the floating microphone, the welcome chat, and the
// four outside-the-app captures (share sheet, screenshot, pinned notification,
// widget) which arrive through captureText. They all send RAW TEXT and the
// prompt lives here, so the in-app and outside-the-app answers can never drift
// apart.
//
// The prompt asks for judgment, the way an assistant would sort a note handed
// to them — not a list of magic words. The old one said "an action verb means
// a task", so "Note to self: create a speech-to-text note taker for ADHD
// brains" became a task (Sept 2026), and "I use Samsung date book calendar,
// and I'd like to add that" became a task instead of a request for the app.
//
// Callers: send { text, today?, about_me? }. today is the person's own date
// (YYYY-MM-DD) so "her birthday is tomorrow" lands on the right day. The older
// { prompt } shape is still accepted so a phone holding a stale published
// bundle keeps working right after a deploy.
//
// Answer: { response: { category, is_list, main_idea, items, birthday_person,
// birthday_month, birthday_day, birthday_is_own, parts, why } }. category is "task", "parking_lot",
// "birthday", "app_feedback" or "mixed". Anything a caller doesn't know how to
// handle it treats as a task, so a capture is never lost.
//
// Checking it: an admin can send { texts: [...], today?, about_me? } to see how
// several captures would be sorted, without saving anything, optionally with
// { model, effort } to try another model.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function todayIn(timeZone?: string): string {
  try {
    if (timeZone) {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    }
  } catch (_) { /* unknown zone */ }
  return new Date().toISOString().slice(0, 10);
}

// Today plus the week ahead, so a birthday said as "tomorrow" or "this
// Wednesday" becomes a real month and day without the model doing date math.
function calendarLines(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 12);
  const line = (offset: number) => {
    const day = new Date(base + offset * 86400000);
    return `${WEEKDAYS[day.getUTCDay()]} ${day.toISOString().slice(0, 10)}`;
  };
  const week = [1, 2, 3, 4, 5, 6, 7].map(line).join(", ");
  return `TODAY: ${line(0)}\nTHE WEEK AHEAD: ${week}`;
}

const SYSTEM =
  "You sort what someone captured in ADHDone, an app for people with ADHD, the way a sharp personal " +
  "assistant would sort a note handed to them. Read for meaning and intent: what they want to happen " +
  "with it, and who it's for. There is no list of magic words; judge it like a person would. " +
  "Respond with valid JSON only, filling every field.";

const buildPrompt = (text: string, today: string, aboutMe?: string) => `Someone just captured this in ADHDone (typed, spoken, or shared from another app):

"""
${text}
"""
${aboutMe?.trim() ? `\nABOUT THEM (their own words): ${aboutMe.trim()}\n` : ""}
${calendarLines(today)}

Decide what it is, the way a thoughtful assistant would if this note landed on their desk.

"task" — something they need to do, handle, attend, pay, buy, or be reminded about: chores,
errands, calls, appointments, events, bills, deadlines, things to pick up. Asking to be reminded
makes it a task. A bare thing to deal with ("dentist", "oil change") is a task. A question is a
task only when they say they need to find out or ask ("ask the doctor if...", "find out whether...",
"call and check..."). A question they're just wondering about out loud, with no action or date
("when mom gets released, will she have outpatient appointments?", "will the store be open
Monday?") is an "idea": file it, don't invent an "Ask" or "Find out" for them. A list of things
they need to get or do (a grocery list, a packing list) is a task.

"idea" — something they want to keep rather than something they're asking to get done: an idea,
a thought, a plan to make or build something someday (an app, a business, a song, a product), a
maybe or someday, something to look into eventually, information to remember, a wish list, books
or shows for someday, brainstorming. These go to the Parking Lot, where they can turn one into a
task whenever they're ready. Ask yourself: would a good assistant put this on the to-do list and
start reminding them about it, or file it so it isn't lost? "Note to self" only tells you it's a
note; what the note says decides which.

"birthday" — they're telling the app about someone's birthday so they get reminded every year
("Mom's birthday is October 5th", "Jake's bday is the 12th"). A birthday party, a gift to buy, or
a card to send is a task, not this.

"app_feedback" — they're talking to ADHDone itself or to the people who make it: asking for a
feature, suggesting a change, saying something in the app is broken or confusing, or asking the
app to work differently (connect another calendar, change how reminders behave, add a setting).
Their own life's tasks that happen to involve apps or phones are not this ("update my phone",
"cancel Netflix"). Something they plan to make themselves is their own idea, even if it's an app.

"mixed" — it clearly holds separate things of different kinds, like a birthday plus an errand, or
an idea plus a to-do. Only when there really are two or more different kinds in it.

A fragment — a word or two, no verb, no date — is sorted by what it names, not by its length. If
it names something they deal with, attend or pay ("dentist", "oil change", "rent", "car
inspection"), it's a task. If it names a subject, a thing to make, or something to think about or
look into ("collage", "podcast", "Greece", "collage outpatient"), it's an idea: a couple of nouns
jotted down is a thought being kept, not a chore being assigned.

When it's truly unclear, choose "task": a to-do filed away as an idea can be missed, while a task
they didn't need is easy to delete.

For "idea": is_list is true only when they wrote two or more separate items as a list. Then
main_idea is a short name for the list and items are exactly the items they wrote, in their own
words. Never add, expand, or suggest items they didn't write. Otherwise is_list is false, items is
[] and main_idea is a short title.

For "birthday": birthday_person is the name as they said it ("Mom", "Jake"), or null if they gave
none or it's their own birthday. birthday_is_own is true only when it's their own birthday.
birthday_month (1-12) and birthday_day (1-31) are the birthday's date: read "tomorrow" or "this
Wednesday" off the dates above, and a day number on its own ("the 12th") is the next time that
date comes around, this month if it's still ahead and otherwise next month. Both null only if they
gave no day at all. For every other category birthday_person, birthday_month and birthday_day are
null and birthday_is_own is false.

For "mixed": parts are the separate pieces, each written so it makes sense on its own, in their
words, keeping the day, time, place or person that goes with it. Each piece is sorted again on
its own, with nothing else to go on, so keep whatever in their wording shows what kind of thing
that piece is: if they marked it as a note to self or an idea, that stays with it. "Mom's
birthday is Oct 5 and I need to buy her a gift" → ["Mom's birthday is Oct 5", "Buy Mom a
birthday gift before Oct 5"]. "Buy envelopes, and note to self: someday learn watercolor" →
["Buy envelopes", "Note to self: someday learn watercolor"].
For every other category parts is [].

"why" is one short sentence saying why, for the app's own logs.

Return JSON:
{
  "category": "task" | "idea" | "birthday" | "app_feedback" | "mixed",
  "is_list": boolean,
  "main_idea": string,
  "items": string[],
  "birthday_person": string | null,
  "birthday_month": integer | null,
  "birthday_day": integer | null,
  "birthday_is_own": boolean,
  "parts": string[],
  "why": string
}`;

const CATEGORIES = ["task", "parking_lot", "birthday", "app_feedback", "mixed"];

// Whatever came back, the callers get a known category and clean fields.
function clean(raw: any) {
  const r = raw && typeof raw === "object" ? raw : {};
  let category = String(r.category || "").trim().toLowerCase();
  if (category === "idea") category = "parking_lot";
  if (!CATEGORIES.includes(category)) category = "task";
  const items = Array.isArray(r.items) ? r.items.map((s: any) => String(s || "").trim()).filter(Boolean) : [];
  const isList = category === "parking_lot" && r.is_list === true && items.length > 1;
  const month = Number(r.birthday_month);
  const day = Number(r.birthday_day);
  const hasDay = category === "birthday" && Number.isInteger(month) && month >= 1 && month <= 12 &&
    Number.isInteger(day) && day >= 1 && day <= 31;
  const person = category === "birthday" ? String(r.birthday_person || "").trim() : "";
  return {
    category,
    is_list: isList,
    main_idea: String(r.main_idea || "").trim(),
    items: isList ? items : [],
    birthday_person: person || null,
    birthday_month: hasDay ? month : null,
    birthday_day: hasDay ? day : null,
    birthday_is_own: category === "birthday" && r.birthday_is_own === true,
    parts: category === "mixed" && Array.isArray(r.parts)
      ? r.parts.map((s: any) => String(s || "").trim()).filter(Boolean).slice(0, 8)
      : [],
    why: String(r.why || "").trim().slice(0, 300),
  };
}

const MODEL = "gpt-6-astra";
const EFFORT = "low";
const TRY_MODELS = ["gpt-6-astra", "gpt-6-luna"];
const TRY_EFFORTS = ["none", "low", "medium"];

async function classify(openai: OpenAI, prompt: string, opts: { model?: string; effort?: string } = {}) {
  const completion = await openai.chat.completions.create({
    model: opts.model || MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: (opts.effort || EFFORT) as any,
    max_completion_tokens: 4000,
  });
  return clean(JSON.parse(completion.choices[0].message.content || "{}"));
}

// The phone's platform calls occasionally fail once and pass a moment later.
async function whoIsAsking(base44: any) {
  for (let i = 0; i < 3; i++) {
    try {
      return await base44.auth.me();
    } catch (_) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = await createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Only the app's own people and its own backend (captureText, which sends
    // the internal key) may use this: otherwise anyone could run prompts on
    // the app's OpenAI account.
    const internalKey = Deno.env.get("CRON_SECRET")?.trim();
    const presented = typeof body?.internalKey === "string" ? body.internalKey.trim() : "";
    const isInternal = !!internalKey && presented === internalKey;
    const user = isInternal ? null : await whoIsAsking(base44);
    if (!isInternal && !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = typeof body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today
      : todayIn(user?.timezone);
    const aboutMe = typeof body?.about_me === "string" ? body.about_me : user?.about_me;
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    // Admin check of several captures at once; nothing is saved.
    if (Array.isArray(body?.texts)) {
      if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const model = TRY_MODELS.includes(body?.model) ? body.model : MODEL;
      const effort = TRY_EFFORTS.includes(body?.effort) ? body.effort : EFFORT;
      const results = await Promise.all(body.texts.slice(0, 40).map(async (t: any) => {
        const text = String(t || "");
        try {
          return { text, ...(await classify(openai, buildPrompt(text, today, aboutMe), { model, effort })) };
        } catch (e) {
          return { text, error: String(e?.message || e) };
        }
      }));
      return Response.json({ today, model, effort, results });
    }

    // Old callers sent a ready-made prompt; its answer only knows task / parking_lot.
    if (!body?.text && typeof body?.prompt === "string") {
      return Response.json({ response: await classify(openai, body.prompt) });
    }
    if (!body?.text || !String(body.text).trim()) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    const response = await classify(openai, buildPrompt(String(body.text), today, aboutMe));
    console.log(`[checkTaskCategory] ${response.category}: ${response.why}`);
    return Response.json({ response });
  } catch (error) {
    console.error("[checkTaskCategory] error:", error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});