// Nov 12 2026: { renamed: { from, to } } reads a task's new name after a rename. A short look on gpt-6-astra says whether the new name adds a day, a time or a repeat the old one didn't have; only then is the new name parsed, as of now, by the same parser as a new task. Nothing is saved here (the app applies it: renameReread.js). Admin check of several at once: { renameTry: [{ from, to }] }.
// Re-saved Nov 10 2026 so the bundled shared/taskParsePrompt.ts is picked up: a shared or pasted confirmation gets a short calendar-style title (no order numbers, order dates, hours or fine print), and a dated visit for care or tests is an event.
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Re-saved Nov 1 2026 so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: worth_breaking_down, a several-steps job, so the card offers "Break it into steps" right on the row.
// Re-saved Oct 19 2026 (night) so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: a link the task needs (a video-session or meeting link) goes in the task's notes, never its title, and the time zone of a time stays out of the title.
// Re-saved Oct 19 2026 (later) so the bundled shared/runTaskParse.ts is picked up: the same fix, now actually in the bundle (the first re-save went out before runTaskParse.ts was saved).
// Re-saved Oct 19 2026 so the bundled shared/runTaskParse.ts is picked up: a time picked from a part of the day ("morning medication") is never marked as one the person stated, so it can't ring inside their quiet hours.
// Re-saved Oct 17 2026 (evening) so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: an event that runs past midnight (7 PM–2 AM) is one night, not a two-day range, and a day counted from the real date instead of the said-at day gets a last look.
// Re-saved Oct 17 2026 (night) so the bundled shared/runTaskParse.ts and shared/taskParsePrompt.ts are picked up: "tomorrow morning" / "Sunday night" get a time on gpt-6-astra, and the said-at day is in its system message too.
// Re-saved Oct 17 2026 (later) so the bundled shared/taskParsePrompt.ts is picked up: its calendar is the moment the words were said and beats the real date gpt-6-astra is given.
// Re-saved Oct 17 2026 so the bundled shared/runTaskParse.ts is picked up: the parser and its helpers run on gpt-6-astra (was gpt-5.4).
// Re-saved Oct 14 2026 (later) so the bundled shared/taskParsePrompt.ts is picked up: priority_uninferrable is always false — the app never asks "how urgent?"; the card's priority is editable.
// Re-saved Oct 14 2026 so the bundled shared/taskParsePrompt.ts is picked up: needs_date_pick is always false — the app never asks "when?" (four "make an appointment" tasks typed at once became four questions in a row).
// Re-saved Oct 13 2026 so the bundled shared/runTaskParse.ts is picked up: one more ask when words that name a part of the day ("tonight") came back with no time.
// Re-saved Oct 13 2026 so the bundled shared/taskParsePrompt.ts is picked up: a phone number, address or amount they typed stays in the title.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { runTaskParse } from "../../shared/runTaskParse.ts";
import { buildTaskParsePrompt } from "../../shared/taskParsePrompt.ts";
import { resolveQuietHours } from "../../shared/quietHours.ts";
import OpenAI from "npm:openai";
import { lean } from "../../shared/aiCost.ts";
// Shared files are bundled into this function when it is deployed, so a change
// to the shared prompt (taskParsePrompt.ts) only reaches users after this
// function is saved and redeployed again (last redeploy, Oct 12 2026:
// time_stated, and a time picked from "before bed" goes outside the user's
// quiet hours; before that, Oct 8 2026: a bare
// "ASAP" with no due date means start now; before that, Oct 7 2026: a rhythm
// needs quoted pace words (repeat_words), so "keep reminding me" is a wish, not an
// hourly ping; before that, Oct 6 2026: "ASAP" / "first thing" are the task's
// timing, never a reminder wish; before that, Oct 3 2026: the
// parser's takes_time flag for the card's Time it button; before that, Sept 27 2026: a clock
// time with no day gets its day, "Grandma" stays in the title, "next Tuesday"
// is next week's Tuesday; only signed-in people may use it, and an admin can
// check several inputs at once).

// The platform's calls occasionally fail once and pass a moment later.
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

// ── A renamed task: does the new name say something new? ─────────────────────
// Anna, Nov 12 2026: "any change to a task whether it be date, time, name etc
// should initiate a relook". Until then a rename only re-booked the pushes
// under the new name and had Smart Reminders plan again; nothing read the new
// name, so "weekly" typed onto the end of a chore's name left it a one-time
// task (two of a first-week user's chores). The model answers one narrow
// question, the way a person's assistant would: does the NEW name tell the app
// a day, a time or a repeat the OLD name didn't? Only what it says was added
// is taken from the parse (renameRereadPlan.js), so fixing a typo, rewording,
// or a day that was already in the name changes nothing on the task.
const RENAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    added_day: { type: "boolean" },
    added_time: { type: "boolean" },
    added_repeat: { type: "boolean" },
    added_words: { type: ["string", "null"] },
  },
  required: ["added_day", "added_time", "added_repeat", "added_words"],
};

const RENAME_PROMPT = `Someone renamed a to-do in their task app. Compare the OLD name with the NEW name and say whether the NEW name tells the app something about WHEN this happens, or HOW OFTEN it repeats, that the old name did not already say.

Answer:
- added_day: true when the new name names the day or date it happens or is due (today, tomorrow, Friday, the 15th, Nov 20, next week; "every Monday" names Mondays; "tonight", "this morning", "this afternoon", "this evening" and "in an hour" all name today) and the old name did not name that same day.
- added_time: true when the new name gives a clock time or a part of the day for it (2pm, at 10:30, noon, tonight, in the morning, after work, in an hour) and the old name did not give that same time. "Tonight" is both a day and a time: both true.
- added_repeat: true when the new name says the thing itself repeats (weekly, every day, every other week, every Monday, monthly, on the 1st of every month, yearly) and the old name did not say that same repeat.
- added_words: the exact words from the new name that carry it, copied letter for letter; null when all three are false.

Judge it the way the person's own assistant would:
- Only what the new name itself says counts. Never guess a day, a time or a repeat from what kind of thing it is.
- A day, time or pace that is part of WHAT the thing is, not when to do it, does not count: "Call mom about Sunday dinner", "Buy Friday night pizza supplies", "Black Friday shopping list", "Monday meeting notes", "Order the 2 pm class textbook", "Refill daily planner", "Finish the weekly report", "Renew monthly bus pass".
- If the old name already said the same day, time or repeat, it is not new. A typo fixed, clearer wording, a person, a place, an amount or any other detail added: all false.
- If the new name's day, time or repeat is DIFFERENT from the old name's (weekly became monthly, Friday became Saturday, 2pm became 4pm), that is new: true.
- Words about how to be reminded ("remind me every hour", "keep reminding me") are not a repeat of the thing itself: added_repeat false for those.
- When you are not sure, answer false.`;

async function judgeRename(from: string, to: string) {
  const none = { day: false, time: false, repeat: false, words: null as string | null };
  const openai = lean(new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") }), { name: "parseTask.rename" });
  const completion = await openai.chat.completions.create({
    model: "gpt-6-astra",
    reasoning_effort: "low",
    messages: [
      { role: "system", content: RENAME_PROMPT },
      { role: "user", content: `OLD name: ${JSON.stringify(from)}\nNEW name: ${JSON.stringify(to)}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "rename_look", strict: true, schema: RENAME_SCHEMA } },
  });
  const a = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  const words = String(a?.added_words || "").trim();
  // The words it points at have to be in the new name, letter for letter.
  // An answer that quotes something else is treated as nothing added.
  const flat = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  if (!words || !flat(to).includes(flat(words))) return none;
  return { day: a.added_day === true, time: a.added_time === true, repeat: a.added_repeat === true, words };
}

// The look and, only when it found something, the parse of the new name as of
// now (the rename is when the words were written; RULES.md §8.3).
async function rereadRename(base44: any, user: any, fromRaw: any, toRaw: any) {
  const from = String(fromRaw || "").trim().slice(0, 300);
  const to = String(toRaw || "").trim().slice(0, 300);
  if (!to || from.toLowerCase() === to.toLowerCase()) return { added: null, parsed: null };
  const added = await judgeRename(from, to);
  if (!added.day && !added.time && !added.repeat) return { added, parsed: null };
  const parsed = await runTaskParse(base44, to, user?.timezone, user?.about_me, undefined,
    user ? resolveQuietHours(user) : undefined);
  return { added, parsed };
}

Deno.serve(async (req) => {
  try {
    const base44 = await createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Only the app's own people and its own backend may use this: it runs
    // whatever it's handed on the app's OpenAI account.
    const internalKey = Deno.env.get("CRON_SECRET")?.trim();
    const presented = typeof body?.internalKey === "string" ? body.internalKey.trim() : "";
    const isInternal = !!internalKey && presented === internalKey;
    const user = isInternal ? null : await whoIsAsking(base44);
    if (!isInternal && !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Admin self-test of the parser (the cases and the runner are at the end
    // of this file): { selfTest: true }.
    if (body?.selfTest === true) {
      if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      return Response.json(await runParserSelfTest(base44));
    }

    // Admin check of several inputs at once, exactly as the Add button would
    // parse them; nothing is saved. { texts, timezone?, about_me? }
    if (Array.isArray(body?.texts)) {
      if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const tz = typeof body.timezone === "string" ? body.timezone : user?.timezone;
      const aboutMe = typeof body.about_me === "string" ? body.about_me : user?.about_me;
      const results = await Promise.all(body.texts.slice(0, 30).map(async (t: any) => {
        const text = String(t || "");
        try {
          return { text, ...(await runTaskParse(base44, text, tz, aboutMe)) };
        } catch (e) {
          return { text, error: String(e?.message || e) };
        }
      }));
      return Response.json({ results });
    }

    // A task was renamed: what the new name adds, and its parse. Signed-in
    // people only (it reads their time zone, about-me and quiet hours).
    // Nothing is saved here. { renamed: { from, to } }
    if (body?.renamed && typeof body.renamed === "object") {
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      return Response.json({ reread: await rereadRename(base44, user, body.renamed.from, body.renamed.to) });
    }
    // Admin check of several renames at once; nothing is saved.
    // { renameTry: [{ from, to }] }
    if (Array.isArray(body?.renameTry)) {
      if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const results = await Promise.all(body.renameTry.slice(0, 30).map(async (r: any) => {
        try {
          const out = await rereadRename(base44, user, r?.from, r?.to);
          const p: any = out.parsed;
          return {
            from: r?.from, to: r?.to, added: out.added,
            parsed: p ? {
              title: p.title, classification: p.classification, target_date: p.target_date, target_time: p.target_time,
              time_stated: p.time_stated, end_date: p.end_date, deadline_style: p.deadline_style, day_only_task: p.day_only_task,
              recurrence_pattern: p.recurrence_pattern, recurrence_days: p.recurrence_days, reminder_interval: p.reminder_interval,
              reminder_wish: p.reminder_wish,
            } : null,
          };
        } catch (e) {
          return { from: r?.from, to: r?.to, error: String((e as any)?.message || e) };
        }
      }));
      return Response.json({ results });
    }

    // The user's about-me line lets the parser judge work vs personal for this
    // specific person. Missing (skipped onboarding) is fine — the model falls
    // back to plain common sense.
    // `asOf`: when the words were said (ms). A capture finished later than it
    // was typed, or a re-read of an old task, reads "tomorrow" from then. Only
    // a sane past moment is honoured (up to 60 days back, not the future).
    const asOfRaw = Number(body?.asOf);
    const asOf = Number.isFinite(asOfRaw) && asOfRaw > Date.now() - 60 * 24 * 60 * 60 * 1000 && asOfRaw <= Date.now() + 60 * 1000
      ? asOfRaw : undefined;
    // Their quiet hours, so a time picked from "before bed" lands outside them
    // (RULES.md §9 Q4); runTaskParse moves one the model still put inside them,
    // to two hours before they start or to when they end
    // (keepPickedTimeOutOfQuietHours). An internal call has no user: no
    // quiet-hours line.
    const response = await runTaskParse(base44, body?.prompt, user?.timezone, user?.about_me, asOf,
      user ? resolveQuietHours(user) : undefined);
    return Response.json({ response });
  } catch (error) {
    console.error("[parseTask] error:", error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});

// ── Parser self-test ─────────────────────────────────────────────────────────
// Admin only: { selfTest: true }. Runs a fixed set of sentences the way they
// were really said — each with its own "said at" moment, on the owner's
// calendar — and compares the parse with what the person meant. Nothing is
// saved. Run it after ANY change to the parser prompt, the date resolver or
// the capture pipeline, and before calling that change done (RULES.md §9).
// Added Oct 9 2026, after two first-time users' "remind me tomorrow at 9am"
// landed on the wrong day twice. The first cases are the real sentences from
// that week. A check can be an exact value or a test function.
const said = (iso: string) => Date.parse(iso); // when the words were said (Central time offsets)
const aTime = (v: any) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
const PARSER_CHECKS: { text: string; saidAt: number; expect: Record<string, any> }[] = [
  { text: "Schedule Tamra Appointment. Remind me tomorrow at 9am.", saidAt: said("2026-10-05T21:25:00-05:00"), expect: { target_date: "2026-10-06", target_time: "09:00", recurrence_pattern: "none" } },
  { text: "make cardiologist appt. Remind me tomorrow at 9am.", saidAt: said("2026-10-07T19:12:00-05:00"), expect: { target_date: "2026-10-08", target_time: "09:00" } },
  { text: "Remind me tomorrow at 8am to take the car in", saidAt: said("2026-10-05T23:50:00-05:00"), expect: { target_date: "2026-10-06", target_time: "08:00", time_stated: true } },
  { text: "Call Shy back tomorrow morning.", saidAt: said("2026-10-08T16:37:00-05:00"), expect: { target_date: "2026-10-09", target_time: aTime, time_stated: false } },
  { text: "Mix up cinnamon roll dough before bed.", saidAt: said("2026-10-08T14:40:00-05:00"), expect: { target_date: "2026-10-08", deadline_style: "by", target_time: aTime, time_stated: false } },
  { text: "Feed obi pan kenobi after work tonight", saidAt: said("2026-10-07T11:28:00-05:00"), expect: { target_date: "2026-10-07", target_time: (v: any) => aTime(v) && v >= "16:00" } },
  { text: "Take trash to the curb every Wednesday and Sunday night.", saidAt: said("2026-10-07T14:20:00-05:00"), expect: { recurrence_pattern: "weekly", recurrence_days: [0, 3], target_time: aTime } },
  { text: "schedule date night for every thursday at 22:00", saidAt: said("2026-10-08T14:56:00-05:00"), expect: { recurrence_pattern: "weekly", recurrence_days: [4], target_time: "22:00" } },
  { text: "remind me to clean the litter box everyday at 9 p.m. and keep reminding me until I mark it complete", saidAt: said("2026-10-07T13:19:00-05:00"), expect: { recurrence_pattern: "daily", target_time: "21:00", reminder_wish: (v: any) => typeof v === "string" && v.length > 0 } },
  { text: "remind me every saturday and sunday to make Antonio coffee at 9:30", saidAt: said("2026-10-04T09:39:00-05:00"), expect: { recurrence_pattern: "weekly", recurrence_days: [0, 6], target_time: "09:30" } },
  { text: "Do Laundry on thursday", saidAt: said("2026-09-30T20:40:00-05:00"), expect: { target_date: "2026-10-01", target_time: null } },
  { text: "At 11 p.m. tomorrow, tell me to get my ass to bed.", saidAt: said("2026-10-06T01:38:00-05:00"), expect: { target_date: "2026-10-07", target_time: "23:00" } },
  { text: "I should try to do an oil change before this Sunday", saidAt: said("2026-09-10T11:30:00-05:00"), expect: { target_date: "2026-09-13", deadline_style: "by" } },
  { text: "Dentist appointment Friday at 2pm", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: "2026-10-09", target_time: "14:00" } },
  { text: "Lunch with Sarah tomorrow at noon", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: "2026-10-06", target_time: "12:00" } },
  { text: "Submit the report by Friday 5pm", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: "2026-10-09", target_time: "17:00", deadline_style: "by" } },
  { text: "Pick up prescription next Tuesday", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: "2026-10-13" } },
  { text: "Call the vet at 3", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: "2026-10-05", target_time: "15:00" } },
  { text: "Call the vet at 3", saidAt: said("2026-10-05T16:00:00-05:00"), expect: { target_date: "2026-10-06", target_time: "15:00" } },
  { text: "Gym every weekday at 6am", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { recurrence_pattern: "weekly", recurrence_days: [1, 2, 3, 4, 5], target_time: "06:00", time_stated: true } },
  { text: "Water the plants every other day", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { recurrence_pattern: "every_other_day" } },
  { text: "take out the trash tonight", saidAt: said("2026-10-09T15:00:00-05:00"), expect: { target_date: "2026-10-09", target_time: aTime } },
  { text: "Text mom", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: null, target_time: null, recurrence_pattern: "none" } },
  // An appointment they still have to make has no day and asks for none
  // (Oct 14 2026: four of these typed at once became four "when?" questions).
  { text: "Need to make appointment for cardiologist.", saidAt: said("2026-10-14T01:52:00-05:00"), expect: { target_date: null, needs_date_pick: (v: any) => !v } },
  // A number they typed stays in the title (Oct 13 2026: a user's "call propane
  // 530-477-7854 today" came out as "Call propane", the number gone).
  // A part of the day is a time the app picks, never one they stated (Oct 16
  // 2026: this became 6:30 AM marked as stated, and rang inside the person's
  // quiet hours every morning).
  { text: "taking morning medication", saidAt: said("2026-10-16T11:30:00-05:00"), expect: { target_time: aTime, time_stated: false } },
  // A link the task needs goes in notes, and neither it nor the time zone is
  // in the title (Anna, Oct 19 2026: this became "Video session with your
  // therapist (CDT; betterhelp.com/s/c248xy5qjem6)").
  { text: "A Video Session with your therapist is scheduled for Tuesday, Oct 20 at 11:00am CDT at betterhelp.com/s/c248xy5qjem6.", saidAt: said("2026-10-18T20:29:00-05:00"), expect: { title: (v: any) => typeof v === "string" && !/betterhelp|CDT/i.test(v), notes: (v: any) => typeof v === "string" && v.includes("betterhelp.com/s/c248xy5qjem6") && !/CDT|time zone/i.test(v), target_date: "2026-10-20", target_time: "11:00" } },
  { text: "call propane 530-477-7854 today", saidAt: said("2026-10-13T08:46:00-07:00"), expect: { title: (v: any) => typeof v === "string" && v.includes("530-477-7854"), target_date: "2026-10-13", deadline_style: "by" } },
  // A party that runs past midnight is one night, not a two-day range: this one
  // showed on its card as "Nov 1 – Nov 2" (Anna, Oct 17 2026).
  { text: "4th Anniversary Neon Velocity Halloween Party Edition on Nov 1st, Sunday of Halloween weekend, from 7PM-2AM at Reset Arcade Bar, 10402 Menchaca Rd #2, Austin TX 78748.", saidAt: said("2026-10-14T10:25:00-05:00"), expect: { target_date: "2026-11-01", target_time: "19:00", end_date: null } },
  // A business named in passing is not a business the task is done with
  // (Nov 3 2026: a key to a restaurant handed to a friend got that
  // restaurant's hours looked up and a "nudged a closed business" alert;
  // Anna: "doesn't mean it's happening at Pizza Hut"). One they call still is.
  { text: "Give the Target vest back to Sam", saidAt: said("2026-11-03T13:00:00-06:00"), expect: { business_name: null } },
  { text: "Call Walgreens about the refill", saidAt: said("2026-11-03T13:00:00-06:00"), expect: { business_name: (v: any) => typeof v === "string" && /walgreens/i.test(v) } },
  // An appointment with something to get ready BEFORE it is prep_worthy: its
  // night-before reminder asks for prep notes and every reminder repeats
  // them (Anna, Nov 4 2026: a vet visit with a fasting cat carried no note,
  // "a notification is not enough"). Things people just show up to are not.
  { text: "Take the dog to the vet Wednesday at 1:45pm", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { classification: "event", prep_worthy: true } },
  { text: "Dentist Friday at 2pm", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: true } },
  { text: "Flight to Denver Saturday 6:40am", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: true } },
  { text: "DMV appointment Thursday 10am", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: true } },
  { text: "Job interview at Costco Monday 9am", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: true } },
  { text: "Dinner with Jess Friday at 7", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: false } },
  { text: "Haircut Saturday at 11", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: false } },
  { text: "Movie night with the kids Friday 8pm", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: false } },
  { text: "Vacuum the living room", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { prep_worthy: false } },
  // goes_somewhere (Nov 5 2026): an event that means leaving (the row offers "Add the
  // address and I'll time when to leave") vs one that happens where they are
  // (Anna, Nov 5 2026: "attend video session... 9/10 times this is going to
  // be virtual. Meaning they dont go anywhere").
  { text: "Attend video session Thursday at 3pm", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { classification: "event", goes_somewhere: false } },
  { text: "Team call on Zoom Monday 10am", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { goes_somewhere: false } },
  { text: "Telehealth visit with the doctor Tuesday 2pm", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { goes_somewhere: false } },
  { text: "Physical therapy session Wednesday 9am", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { goes_somewhere: true } },
  { text: "Dinner at the new Thai place Friday 7pm", saidAt: said("2026-11-02T10:00:00-06:00"), expect: { goes_somewhere: true } },
];

async function runParserSelfTest(base44: any) {
  const tz = "America/Chicago";
  const results: any[] = [];
  for (const c of PARSER_CHECKS) {
    try {
      const parsed: any = await runTaskParse(base44, buildTaskParsePrompt(c.text, tz, c.saidAt), tz, undefined, c.saidAt);
      const got: Record<string, any> = {};
      const misses: string[] = [];
      for (const [k, want] of Object.entries(c.expect)) {
        const have = parsed?.[k] ?? null;
        got[k] = have;
        const ok = typeof want === "function" ? !!want(have) : JSON.stringify(have) === JSON.stringify(want);
        if (!ok) misses.push(k);
      }
      const expect: Record<string, any> = {};
      for (const [k, want] of Object.entries(c.expect)) expect[k] = typeof want === "function" ? "(checked by rule)" : want;
      results.push({ text: c.text, saidAt: new Date(c.saidAt).toISOString(), pass: misses.length === 0, misses, got, expect, title: parsed?.title });
    } catch (e) {
      results.push({ text: c.text, pass: false, error: String((e as any)?.message || e) });
    }
  }
  const failed = results.filter((r) => !r.pass);
  return { pass: failed.length === 0, total: results.length, failed: failed.length, failures: failed, results };
}
