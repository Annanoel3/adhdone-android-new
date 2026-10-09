import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { runTaskParse } from "../../shared/runTaskParse.ts";
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