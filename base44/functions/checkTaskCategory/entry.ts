import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import OpenAI from "npm:openai";

// THE one place that decides task vs parking lot idea.
//
// Every way of adding something asks this exact question: the Add Task screen,
// the home quick-add, the floating microphone, and the four outside-the-app
// captures (share sheet, screenshot, pinned notification, widget) which arrive
// through captureText. They all send RAW TEXT and the prompt lives here, so the
// in-app and outside-the-app answers can never drift apart. It used to be typed
// out twice — once in the web pipeline, once in captureToTasks — which is the
// same duplicated-decision mistake this app has already paid for with its parser.
//
// Callers: send { text }. The older { prompt } shape is still accepted so a
// browser holding a stale published bundle keeps working right after a deploy.
const buildPrompt = (text: string) => `Analyze this input: "${text}"

      CRITICAL RULES:
      1. If user explicitly says "parking lot" → ALWAYS parking_lot
      2. If it's an ACTIONABLE TODO that needs to be done → task
      Examples: "clean the toilet", "call dentist", "do laundry", "Amazon returns", "pay bills"
      3. If it's IDEAS, THOUGHTS, INFORMATION, or vague LISTS → parking_lot

      TASKS (concrete actions that need to be done):
      - Clear actionable todos: "clean the toilet", "call dentist", "Amazon returns", "submit report", "pay rent"
      - With timing: "Remind me tomorrow", "Call at 2pm", "Do laundry every day"
      - Deadlines: "Turn in homework Tuesday", "Pay rent by the 1st"
      - Appointments: "Therapist at 12 p.m.", "Meeting at 9am"
      - Events: "Martin's wedding on the 30th", "Birthday party Saturday"
      - Errands: "Pick up dry cleaning", "Drop off package", "Go to post office"

      PARKING LOT (ideas, thoughts, non-actionable information):
      - Explicit: "add to parking lot", "parking lot idea"
      - Ideas/thoughts: "Steel guitar strings might be better", "Maybe try meditation"
      - Planning: "Think about what to tell my professor"
      - Shopping/reading lists WITHOUT urgency: "I need milk, eggs, paper", "read twilight and cirque du freak"
      - Information: "Brazilian blowouts cost $200"
      - Brainstorming: "My project needs hypothesis, summary, references"
      - Questions: "Not sure if car leak is from transmission or seal"
      - Research: "Look into meditation apps", "Research vacation spots"

      BARE NOUNS DEFAULT TO TASK: if the input is just a thing or a place with no verb
      and no opinion, question or "maybe" in it — "dentist", "groceries", "taxes",
      "pharmacy", "library books", "oil change" — the user is noting something they have
      to deal with. That is a TASK. Only call a bare noun parking_lot when it reads as a
      thought, a preference, or a piece of information rather than something to handle.

      KEY DISTINCTION: If someone needs to DO it (action verb), it's a TASK. If they're just capturing info/ideas, it's PARKING LOT.

      Return JSON:
      {
      "category": "parking_lot" | "task",
      "is_list": true/false,
      "main_idea": "short title",
      "items": ["item 1", "item 2", ...] or []
      }`;

Deno.serve(async (req) => {
  await createClientFromRequest(req);
  const body = await req.json();
  const prompt = body?.text ? buildPrompt(String(body.text)) : body?.prompt;
  if (!prompt) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const completion = await openai.chat.completions.create({
    model: "gpt-6-astra",
    messages: [
      {
        role: "system",
        content: "You are a task categorization assistant for an ADHD productivity app. Always respond with valid JSON and populate all required fields. Determine whether the input is a task, parking lot idea, or other category based on the instructions given."
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    reasoning_effort: 'low',
    max_completion_tokens: 4000
  });
  const response = JSON.parse(completion.choices[0].message.content);
  return Response.json({ response });
});