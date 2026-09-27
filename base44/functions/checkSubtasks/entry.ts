import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI from "npm:openai";

// THE one place that decides whether a new task should get a checklist of
// steps under it ("pay my bills: electric, rent, insurance" → "Pay bills" with
// three steps).
//
// The app sends RAW TEXT and the prompt lives here. The prompt asks for
// judgment, the way an assistant would set up a note handed to them, not a list
// of rules to match. A list of rules broke when the model changed (Sept 17
// 2026, GPT-4o → GPT-6 Astra): the newer model follows written rules to the
// letter.
//
// Callers: send { text }. Answer: { response: { has_subtasks, main_task,
// subtasks } }; steps are only ever the pieces the person wrote. The older
// { prompt } shape is still accepted so a phone holding a stale published
// bundle keeps working right after a deploy.
//
// Checking it: an admin can send { texts: [...] } to see several answers at
// once, or { prompts: [...] } to run ready-made prompts the old way, optionally
// with { model, effort } to try another model. Nothing is saved.

const MODEL = "gpt-6-astra";
const EFFORT = "low";
const TRY_MODELS = ["gpt-6-astra", "gpt-6-luna"];
const TRY_EFFORTS = ["none", "low", "medium"];

const SYSTEM =
  "You help someone with ADHD keep track of what they need to do. They jot things down fast, by " +
  "voice or text, and trust you to set them up the way a sharp, caring personal assistant would. " +
  "Read for what they mean. Answer with JSON only.";

// What the app used to send along with its own ready-made prompt.
const OLD_SYSTEM =
  "You are a task analysis assistant for an ADHD productivity app. Always respond with valid JSON and " +
  "populate all required fields. Analyze carefully whether a task has multiple steps that should be " +
  "tracked as separate subtasks.";

const buildPrompt = (text: string) => `Here is one task they added:
"""
${text}
"""

Would a good assistant set this up as one task with a short checklist of steps under it?

Yes when they named one goal and listed its pieces themselves: the bills under "pay my bills",
the items under "grocery run", the rooms under "clean the house", or steps they spelled out in
order ("call the dentist, then book the appointment, then check my insurance"). Each step is
one of the pieces they wrote, in their order, worded so it reads on its own as a line on a
checklist ("Pay the electric bill" under "Pay bills"; just "Milk" under "Grocery run"). Never
add a step they didn't say, and never break a simple action into steps nobody asked for.

No when it is one action, even with details ("call the dentist about my tooth"), or an event or
appointment, even one with several times in it ("get to the depot at 2:30 to check in, the train
runs 3:30 to 5:30").

Return JSON: { "has_subtasks": true or false, "main_task": "short name for the goal, like Pay bills",
"subtasks": ["..."] }. When the answer is no, main_task is "" and subtasks is [].`;

async function ask(openai: OpenAI, prompt: string, opts: { model?: string; effort?: string; system?: string } = {}) {
  const completion = await openai.chat.completions.create({
    model: opts.model || MODEL,
    messages: [
      { role: "system", content: opts.system || SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: (opts.effort || EFFORT) as any,
    max_completion_tokens: 4000,
  });
  return JSON.parse(completion.choices[0].message.content || "{}");
}

function clean(r: any) {
  const steps = Array.isArray(r?.subtasks)
    ? r.subtasks.map((s: any) => String(s || "").trim()).filter(Boolean).slice(0, 20)
    : [];
  const title = String(r?.main_task || "").trim();
  // A checklist of one isn't a checklist.
  if (r?.has_subtasks !== true || steps.length < 2 || !title) {
    return { has_subtasks: false, main_task: "", subtasks: [] };
  }
  return { has_subtasks: true, main_task: title, subtasks: steps };
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
    // Only signed-in people may use this: otherwise anyone could run prompts
    // on the app's OpenAI account.
    const base44 = await createClientFromRequest(req);
    const user = await whoIsAsking(base44);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
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
          return legacy
            ? { response: await ask(openai, s, { model, effort, system: OLD_SYSTEM }) }
            : { text: s, ...clean(await ask(openai, buildPrompt(s), { model, effort })) };
        } catch (e) {
          return { text: legacy ? "" : s, error: String(e?.message || e) };
        }
      }));
      return Response.json({ model, effort, results });
    }

    // Old callers sent a ready-made prompt.
    if (!body?.text && typeof body?.prompt === "string") {
      return Response.json({ response: await ask(openai, body.prompt, { system: OLD_SYSTEM }) });
    }
    const text = String(body?.text || "").trim();
    if (!text) return Response.json({ error: "text is required" }, { status: 400 });
    return Response.json({ response: clean(await ask(openai, buildPrompt(text))) });
  } catch (error) {
    console.error("[checkSubtasks] error:", error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});
