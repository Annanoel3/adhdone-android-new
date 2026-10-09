import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { runTaskParse } from "../../shared/runTaskParse.ts";
import { buildTaskParsePrompt } from "../../shared/taskParsePrompt.ts";
// Shared files are bundled into this function when it is deployed, so a change
// to the shared prompt (taskParsePrompt.ts) only reaches users after this
// function is saved and redeployed again (last redeploy, Oct 8 2026: a bare
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

    // The user's about-me line lets the parser judge work vs personal for this
    // specific person. Missing (skipped onboarding) is fine — the model falls
    // back to plain common sense.
    // `asOf`: when the words were said (ms). A capture finished later than it
    // was typed, or a re-read of an old task, reads "tomorrow" from then. Only
    // a sane past moment is honoured (up to 60 days back, not the future).
    const asOfRaw = Number(body?.asOf);
    const asOf = Number.isFinite(asOfRaw) && asOfRaw > Date.now() - 60 * 24 * 60 * 60 * 1000 && asOfRaw <= Date.now() + 60 * 1000
      ? asOfRaw : undefined;
    const response = await runTaskParse(base44, body?.prompt, user?.timezone, user?.about_me, asOf);
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
  { text: "Remind me tomorrow at 8am to take the car in", saidAt: said("2026-10-05T23:50:00-05:00"), expect: { target_date: "2026-10-06", target_time: "08:00" } },
  { text: "Call Shy back tomorrow morning.", saidAt: said("2026-10-08T16:37:00-05:00"), expect: { target_date: "2026-10-09", target_time: aTime } },
  { text: "Mix up cinnamon roll dough before bed.", saidAt: said("2026-10-08T14:40:00-05:00"), expect: { target_date: "2026-10-08", deadline_style: "by", target_time: aTime } },
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
  { text: "Gym every weekday at 6am", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { recurrence_pattern: "weekly", recurrence_days: [1, 2, 3, 4, 5], target_time: "06:00" } },
  { text: "Water the plants every other day", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { recurrence_pattern: "every_other_day" } },
  { text: "take out the trash tonight", saidAt: said("2026-10-09T15:00:00-05:00"), expect: { target_date: "2026-10-09", target_time: aTime } },
  { text: "Text mom", saidAt: said("2026-10-05T10:00:00-05:00"), expect: { target_date: null, target_time: null, recurrence_pattern: "none" } },
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
