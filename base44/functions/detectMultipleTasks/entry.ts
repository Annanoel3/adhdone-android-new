import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI from "npm:openai";

// THE one place that decides whether a capture is one task or several.
//
// Both ways of adding things ask it: the app itself (taskCreationPipeline's
// detectMultipleTasks) and the outside-the-app captures (captureText, through
// splitCapture in shared/captureToTasks.ts). They send RAW TEXT and the prompt
// lives here, so the two can't drift apart. It used to be typed out twice,
// once as a long list of rules in the web app and once as a short prompt on a
// different model for captureText, and the two disagreed.
//
// The prompt asks for judgment, the way an assistant would read a note handed
// to them, not a list of rules to match. A list of rules broke when the model
// changed (Sept 17 2026, GPT-4o → GPT-6 Astra): the newer model follows written
// rules to the letter.
//
// It only runs on things already sorted as tasks (checkTaskCategory decides
// task / idea / birthday / mix first).
//
// Callers: send { text }. Answer: { response: { is_multiple, tasks } }, tasks in
// the person's own words, never empty. The older { prompt } shape is still
// accepted so a phone holding a stale published bundle keeps working right
// after a deploy.
//
// Checking it: an admin can send { texts: [...] } to see how several captures
// would be split, or { prompts: [...] } to run ready-made prompts the old way,
// optionally with { model, effort } to try another model. Nothing is saved.

const MODEL = "gpt-6-astra";
const EFFORT = "low";
const TRY_MODELS = ["gpt-6-astra", "gpt-6-luna"];
const TRY_EFFORTS = ["none", "low", "medium"];

const SYSTEM =
  "You help someone with ADHD keep track of what they need to do. They jot things down fast, by " +
  "voice or text, and trust you to set them up the way a sharp, caring personal assistant would. " +
  "Read for what they mean. Answer with JSON only.";

const buildPrompt = (text: string) => `Here is what they wrote:
"""
${text}
"""

Should this go on their list as one task, or as several separate ones?

Think about how they'd want to check things off. Separate tasks are things they'd do at
different times or places, where finishing one doesn't finish the other and neither needs the
other to make sense: "call the dentist and pay rent" is two. One task is a single errand or
outing, even with several parts ("buy milk and eggs"; "get to the depot at 2:30 to check in, the
train runs 3:30 to 5:30"), an action with its details ("call the vet about Max's shots"), or a
follow-up that only makes sense with what came before it ("text Sarah and see if she wants to
meet up"). A goal with its pieces listed under it ("pay my bills: electric, rent, insurance") is
one task; the pieces become its steps later. A copied text thread, chat or email about one plan
is one task, however many lines it has. A schedule of different outings at different times
("dentist at 9, lunch with Mom at noon, pick up the kids at 3") is one task per outing, so each
gets its own reminder. When you can't tell, keep it as one.

Write each task in their own words, whole enough to make sense on its own, and keep the day,
time, place or person that goes with it. When a day or time covers everything they said
("clean the dishes and the floor today"), every task keeps it. Never list the same thing twice,
and never add anything they didn't say.

Return JSON: { "is_multiple": true or false, "tasks": ["..."] }. When it is one task, "tasks"
holds exactly their whole text, unchanged.`;

// The prompts the web app used to send carried no system message.
async function ask(openai: OpenAI, prompt: string, opts: { model?: string; effort?: string; system?: boolean } = {}) {
  const completion = await openai.chat.completions.create({
    model: opts.model || MODEL,
    messages: [
      ...(opts.system === false ? [] : [{ role: "system" as const, content: SYSTEM }]),
      { role: "user" as const, content: prompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: (opts.effort || EFFORT) as any,
    max_completion_tokens: 4000,
  });
  return JSON.parse(completion.choices[0].message.content || "{}");
}

function clean(r: any, text: string) {
  const tasks = Array.isArray(r?.tasks)
    ? r.tasks.map((s: any) => String(s || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  if (tasks.length <= 1) return { is_multiple: false, tasks: [text] };
  return { is_multiple: true, tasks };
}

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
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

    // Admin checks; nothing is saved.
    if (Array.isArray(body?.texts) || Array.isArray(body?.prompts)) {
      if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const model = TRY_MODELS.includes(body?.model) ? body.model : MODEL;
      const effort = TRY_EFFORTS.includes(body?.effort) ? body.effort : EFFORT;
      const legacy = Array.isArray(body?.prompts);
      const list: any[] = (legacy ? body.prompts : body.texts).slice(0, 30);
      const results = await Promise.all(list.map(async (t: any) => {
        const s = String(t || "");
        try {
          const r = legacy
            ? await ask(openai, s, { model, effort, system: false })
            : clean(await ask(openai, buildPrompt(s), { model, effort }), s);
          return legacy ? { response: r } : { text: s, ...r };
        } catch (e) {
          return { text: legacy ? "" : s, error: String(e?.message || e) };
        }
      }));
      return Response.json({ model, effort, results });
    }

    // Old callers sent a ready-made prompt.
    if (!body?.text && typeof body?.prompt === "string") {
      return Response.json({ response: await ask(openai, body.prompt, { system: false }) });
    }
    const text = String(body?.text || "").trim();
    if (!text) return Response.json({ error: "text is required" }, { status: 400 });
    const response = clean(await ask(openai, buildPrompt(text)), text);
    return Response.json({ response });
  } catch (error) {
    console.error("[detectMultipleTasks] error:", error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
