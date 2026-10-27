import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI, { toFile } from "npm:openai";
import { packsOf, leftOf, spendPacks } from "../../shared/minutePacks.ts";

// Two jobs, both on the app's own OpenAI key (RULES.md rule 1):
//
// 1. Voice typing in the Parking Lot: { audio_base64, filename } → { text }.
//    Unchanged, except that only signed-in people may use it now (it was open
//    to anyone, on the app's OpenAI account).
//
// 2. Recorded notes (the Notes page; RecorderBridge on the phone records):
//    { mode: "notes_part", record_id, index, start_ms, end_ms, audio_base64 }
//        transcribes one ~10 minute part of a recording and saves its text on
//        the recording. A part already transcribed is never done (or counted)
//        twice. Counts toward the monthly free minutes; over the limit it
//        answers { ok: false, over_limit: true } without transcribing.
//    { mode: "notes_make", record_id }
//        turns the whole transcript into ADHD-friendly notes and saves them.
//        When the recording has questions (written down before an appointment
//        on the Notes page), the notes say which got answered and what the
//        answer was.
//    { mode: "notes_change", record_id, request }
//        one typed change to a recording's notes ("add that the copay is $40",
//        "take out the line about parking"): made in the right part of the
//        notes, everything else left as it was, and saved.
//    { mode: "notes_ask", question }
//        a question about their recordings ("when did my boss say the report
//        was due?"), answered from their own notes and transcripts. Nothing saved.
//    { mode: "notes_fill", record_id }
//        the second read on its own, for notes made before it existed: reads
//        the transcript against the saved notes and adds what's missing, never
//        touching a line already there (edits and checked-off to-dos included).
//    { mode: "notes_ask_one", record_id, question }
//        a question about ONE recording ("what did my doctor say about the
//        dose?"), answered from its full transcript with the speaker's exact
//        words quoted, each quote checked against the transcript (Anna, Oct 27
//        2026). Nothing saved.
//    Admin only, nothing saved: { mode: "notes_try", transcript, started_at?, model? }
//        shows the notes a transcript would get.
//
// Recordings live in the EnergyLog table (kind: "note_recording"). That table
// had no writers left (the energy check-in was retired) and a new table can't
// be added from the code editor. Its fields are described in EnergyLog.jsonc.
// Each person can only read and write their own (created_by), and every write
// here is made as the person, never the service role.
//
// Free minutes: NOTES_FREE_MINUTES per calendar month in the person's own time
// zone, kept on the User record (notes_minutes_month, notes_seconds_used).
// Bought minutes (Oct 25 2026): packs bought on Google Play, kept in
// MinutePack (base44/shared/minutePacks.ts). They're spent only on what goes
// past the month's free minutes, and they never expire.

const NOTES_FREE_MINUTES = 60;
const NO_CAP_EMAILS = ["s2kap2chick@gmail.com"];
const TRANSCRIBE_MODEL = "gpt-transcribe";
// Astra writes the notes, with Luna stepping in only if Astra fails. Luna had
// the job from Oct 18 2026 ("switch whatever wont be negatively affected to
// the cheaper one"), but by Oct 27 the notes were leaving things out (Anna:
// "it seems like it might be leaving out some things"), and notes are written
// FOR the person, which her model rule keeps on Astra. Medium effort: the
// transcript of an hour-long visit deserves a careful read, not a skim.
const NOTES_MODEL = "gpt-6-astra";
const NOTES_BACKUP_MODEL = "gpt-6-luna";
const NOTES_EFFORT = "medium";
const TRY_MODELS = ["gpt-6-astra", "gpt-6-luna"];

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

function monthKey(timeZone?: string): string {
  try {
    if (timeZone) {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    }
  } catch (_) { /* unknown zone */ }
  return new Date().toISOString().slice(0, 7);
}

// `bought`: seconds left on bought packs. left_seconds is free + bought, so
// every caller that checks "is there time left" counts both.
function usageOf(user: any, bought = 0, usedOverride?: number) {
  const month = monthKey(user?.timezone);
  const used = usedOverride !== undefined
    ? usedOverride
    : (user?.notes_minutes_month === month ? Math.max(0, Number(user?.notes_seconds_used) || 0) : 0);
  const limit = NOTES_FREE_MINUTES * 60;
  const boughtLeft = Math.max(0, Math.round(Number(bought) || 0));
  // No monthly cap for these accounts; minutes are still counted.
  if (NO_CAP_EMAILS.includes(String(user?.email || "").toLowerCase())) {
    return { month, used_seconds: used, limit_seconds: 0, left_seconds: 8 * 3600, free_left_seconds: 8 * 3600, bought_left_seconds: boughtLeft, unlimited: true };
  }
  const freeLeft = Math.max(0, limit - used);
  return { month, used_seconds: used, limit_seconds: limit, free_left_seconds: freeLeft, bought_left_seconds: boughtLeft, left_seconds: freeLeft + boughtLeft };
}

async function boughtLeftOf(base44: any, user: any): Promise<number> {
  try {
    return leftOf(await packsOf(base44.asServiceRole.entities, user.id));
  } catch (e) {
    console.error("[notes] could not read bought minutes:", (e as Error)?.message || e);
    return 0;
  }
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getRecording(base44: any, id: string) {
  if (!id) return null;
  try {
    const rows = await base44.entities.EnergyLog.filter({ id });
    const rec = rows?.[0];
    return rec && rec.kind === "note_recording" ? rec : null;
  } catch (_) {
    return null; // not an id this person can see
  }
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

// ── One part → text ────────────────────────────────────────────────────────

async function notesPart(base44: any, user: any, body: any) {
  const recordId = String(body?.record_id || "");
  const index = Number(body?.index);
  if (!recordId || !Number.isInteger(index) || index < 0) {
    return Response.json({ ok: false, error: "record_id and index are required" }, { status: 400 });
  }
  const rec = await getRecording(base44, recordId);
  if (!rec) return Response.json({ ok: false, error: "No such recording" }, { status: 404 });

  const parts: any[] = Array.isArray(rec.transcript_parts) ? rec.transcript_parts : [];
  const done = parts.find((p) => p?.index === index);
  const bought = await boughtLeftOf(base44, user);
  if (done) return Response.json({ ok: true, index, already: true, usage: usageOf(user, bought) });

  const usage = usageOf(user, bought);
  if (usage.left_seconds <= 0) {
    return Response.json({ ok: false, over_limit: true, usage });
  }

  const b64 = String(body?.audio_base64 || "");
  if (!b64) return Response.json({ ok: false, error: "audio_base64 is required" }, { status: 400 });
  const bytes = decodeBase64(b64);
  // The first part always starts at 0. The phone's recorder reported the time
  // since the phone was switched on for it (its own clock is started a moment
  // after the first part is opened), which put "13:16:53" on every line of a
  // short recording's notes. Later parts carry a real offset.
  const startMs = index === 0 ? 0 : Math.max(0, Number(body?.start_ms) || 0);
  const endMs = Math.max(startMs, Number(body?.end_ms) || 0);
  // The phone's own timing, or (64 kbps) the file size, whichever says longer.
  const seconds = Math.max(1, Math.round((endMs - startMs) / 1000), Math.round(bytes.length / 8000));

  // The end of the part before carries over names and topic, so words cut at a
  // part boundary are still heard in context.
  const before = parts.find((p) => p?.index === index - 1)?.text || "";
  const context = [rec.title ? `Recording: ${rec.title}.` : "", before ? String(before).slice(-600) : ""]
    .filter(Boolean).join(" ");

  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const file = await toFile(bytes, `part-${index}.m4a`, { type: "audio/mp4" });
  let text = "";
  try {
    const tr: any = await openai.audio.transcriptions.create({
      model: TRANSCRIBE_MODEL,
      file,
      ...(context ? { prompt: context } : {}),
    } as any);
    text = String(tr?.text || "").trim();
  } catch (e) {
    console.error(`[notes] transcription failed for ${recordId} part ${index}:`, e?.message || e);
    return Response.json({ ok: false, error: "transcription_failed" }, { status: 502 });
  }

  // Re-read before saving, so a part saved meanwhile is never overwritten.
  const fresh = await getRecording(base44, recordId);
  const merged: any[] = (Array.isArray(fresh?.transcript_parts) ? fresh.transcript_parts : [])
    .filter((p: any) => p?.index !== index);
  merged.push({ index, start_ms: startMs, end_ms: endMs, text });
  merged.sort((a, b) => a.index - b.index);
  await base44.entities.EnergyLog.update(recordId, { transcript_parts: merged, status: "transcribing" });

  const after = usage.used_seconds + seconds;
  await base44.auth.updateMe({ notes_minutes_month: usage.month, notes_seconds_used: after });
  // Whatever went past the free minutes comes off the bought packs.
  let boughtAfter = bought;
  if (!usage.unlimited) {
    const over = Math.max(0, seconds - usage.free_left_seconds);
    if (over > 0 && bought > 0) {
      try {
        const spent = await spendPacks(base44.asServiceRole.entities, user.id, Math.min(over, bought));
        boughtAfter = Math.max(0, bought - spent);
      } catch (e) {
        console.error(`[notes] could not spend bought minutes for ${user.id}:`, (e as Error)?.message || e);
      }
    }
  }
  return Response.json({
    ok: true,
    index,
    chars: text.length,
    usage: usageOf(user, boughtAfter, after),
  });
}

// ── Transcript → notes ─────────────────────────────────────────────────────

const NOTES_SYSTEM =
  "You write notes for someone with ADHD from a recording they made of a meeting, appointment, class " +
  "or conversation, the way a sharp, caring assistant who sat in on it would. They will glance at these " +
  "notes later, probably in a hurry, so every line has to earn its place. Answer with JSON only.";

function notesPrompt(transcript: string, when: string, length: string, aboutMe: string, asked: string[] = []) {
  const askedIntro = asked.length
    ? `\nBefore it, they wrote down questions they wanted to ask:\n${asked.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`
    : "";
  const askedField = asked.length
    ? `\n- asked: one entry for each question they wrote down, in the same order, with the question
  copied as written. "answered" is true only when the recording clearly answers it; then "answer" is
  that answer in one short line (exact details like doses, dates and numbers copied as said). When
  it never came up or the answer isn't clear, "answered" is false and "answer" is empty. Never guess.`
    : "";
  const askedJson = asked.length
    ? `,\n  "asked": [{ "question": "...", "answered": true, "answer": "...", "at": "0:00" }]`
    : "";
  return `Recorded: ${when} (${length} long).${aboutMe ? `\nAbout the person who recorded it: ${aboutMe}` : ""}${askedIntro}

The transcript, with [time] marks where each stretch starts:
"""
${transcript}
"""

Write their notes.

These are notes on what was SAID, not a diary. The person who recorded this may not have said a
word — it may be a podcast, a lecture, a meeting they sat in on, a doctor talking to them. So
report each point as the speaker's, never as the reader's: a host saying "I quit sugar for a
year" becomes "The host quit sugar for a year" (or "[Name] quit…" when the name is clear), never
"You quit sugar for a year". Never turn a speaker's "I", "me" or "my" into "you" or "your". The
only "you" in these notes is the person who recorded it, and only where the recording itself
makes clear something is theirs (the doctor telling them to take a pill, a task they took on).
When it isn't clear who said something, state the point with no person at all.

Put what matters most first, in short plain lines they can take in at a glance. No paragraphs:
one idea per line, and keep lines short.

Leave nothing out. These notes stand in for the recording: someone who reads only the notes must
not know less than someone who heard the whole thing. Every fact, instruction, number, name,
reason, warning, option that was weighed, question that was asked and answer that was given goes
in, each as its own line. Only greetings, filler and talk about nothing (the weather, finding a
parking spot) stay out. Short is about the LINES, never about how many of them there are: a long
recording gets more sections and more points, not fewer. When you're unsure whether something
matters, keep it. If a point is only half clear in the transcript, keep it and say it was unclear.
An explanation the speaker gave (why a medicine, how a process works, what a term means) is
information too: put it in, in their words.

Highlight the words that matter most on a line by wrapping them in ==double equals==, so an eye
skimming the page lands on them first. Be generous with these: nearly every line in good notes
carries something — a medicine, a dose, a number, a date, a name, a body part, the thing to do,
a verdict ("the supplements ==did not cause== it"), a comparison ("something ==stronger than baby
aspirin=="), a change ("==go back on== the statin") — and every line that does gets its key words
marked, not only the rare standout. The highlight answers "what is this line actually telling
me?": in "the doctor said it was a tiny blood vessel deep in the brain", mark ==tiny blood
vessel==; in "she can take magnesium and potassium", mark ==magnesium and potassium==; in "the
exam covers chapters four through six", mark ==chapters four through six==. Two to six words,
inside the line, never the whole line, and usually one per line (two when a line really carries
two separate facts). Only a line that is pure context, with nothing to look up, do or remember,
goes without.

- title: a short, specific name for this recording ("Knee follow-up with Dr. Patel", "Bio 101:
  cell division", "Budget meeting").
- gist: up to 3 lines saying what this was and what they most need to remember.
- todos: everything someone has to do because of this conversation, each written as one line
  that works on its own as a task in their to-do list: start with a verb, and include who or what
  it's about and when. Turn relative days into real dates using the date it was recorded ("by
  Friday" said on a Wednesday becomes "by Friday, October 2"). "who" is "you" only when the
  person who recorded this took it on or was told to do it; otherwise the name or role of whoever
  took it on. A speaker's own errand (a podcast host's "I need to call my dentist") is not the
  reader's to-do — leave it out. Only things that were actually said; never invent one.
- details: the exact things they'll need to look up later, like doses and how to take them,
  dates and times, numbers, prices, names, phone numbers, addresses, due dates, page or chapter
  numbers. Copy them exactly as said. If the transcript is unclear about one, say it was unclear
  instead of guessing.
- sections: the rest of what was covered, grouped by topic under short plain headings, with a
  few short points under each.
- decisions: what was decided or agreed.
- questions: questions nobody answered and things someone said they would find out.${askedField}

Say who said something only when it's clear from the conversation itself (the doctor, the
professor, someone called by name); otherwise don't attribute it. Keep technical and medical
terms as they were said and use plain words for everything else. Each item gets "at": the [time]
mark of the stretch it came from. Leave a list empty rather than padding it. If the recording has
almost no speech, say so in the gist and leave the rest empty.

Return JSON:
{
  "title": "...",
  "gist": ["..."],
  "todos": [{ "text": "...", "who": "you", "at": "0:00" }],
  "details": [{ "label": "...", "value": "...", "at": "0:00" }],
  "sections": [{ "heading": "...", "points": ["..."], "at": "0:00" }],
  "decisions": [{ "text": "...", "at": "0:00" }],
  "questions": [{ "text": "...", "at": "0:00" }]${askedJson}
}`;
}

function cleanNotes(r: any, asked: string[] = []) {
  const str = (v: any, max = 400) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const list = (v: any) => (Array.isArray(v) ? v : []);
  const items = (v: any) => list(v)
    .map((x) => (typeof x === "string" ? { text: str(x), at: "" } : { text: str(x?.text), at: str(x?.at, 12) }))
    .filter((x) => x.text);
  return {
    title: str(r?.title, 120),
    gist: list(r?.gist).map((x) => str(x)).filter(Boolean).slice(0, 3),
    // The caps are a guard against a runaway answer, not a target: a long
    // recording fills them (they were 30/40/12x8/20 until Oct 27 2026, low
    // enough to drop the end of a long visit).
    todos: list(r?.todos)
      .map((t) => ({ text: str(t?.text), who: str(t?.who, 60) || "you", at: str(t?.at, 12) }))
      .filter((t) => t.text).slice(0, 60),
    details: list(r?.details)
      .map((d) => ({ label: str(d?.label, 80), value: str(d?.value), at: str(d?.at, 12) }))
      .filter((d) => d.label || d.value).slice(0, 100),
    sections: list(r?.sections)
      .map((s) => ({
        heading: str(s?.heading, 80),
        points: list(s?.points).map((p) => str(p)).filter(Boolean).slice(0, 25),
        at: str(s?.at, 12),
      }))
      .filter((s) => s.heading && s.points.length).slice(0, 40),
    decisions: items(r?.decisions).slice(0, 40),
    questions: items(r?.questions).slice(0, 40),
    // The questions themselves come from what they wrote, never from the model.
    asked: asked.map((q, i) => {
      const got = list(r?.asked);
      const a = got.find((x) => str(x?.question) === q) || got[i] || {};
      const answer = str(a?.answer);
      const answered = a?.answered === true && !!answer;
      return { question: q, answered, answer: answered ? answer : "", at: answered ? str(a?.at, 12) : "" };
    }),
  };
}

// The questions saved on a recording, cleaned up.
function questionsOf(rec: any): string[] {
  return (Array.isArray(rec?.questions) ? rec.questions : [])
    .map((q: any) => String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 20);
}

function whenRecorded(startedAt: string, timeZone?: string): string {
  const d = new Date(startedAt || Date.now());
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/Chicago",
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
    }).format(d);
  } catch (_) {
    return d.toDateString();
  }
}

function lengthOf(ms: number): string {
  const min = Math.max(1, Math.round((Number(ms) || 0) / 60000));
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minute${m === 1 ? "" : "s"}` : ""}`;
}

async function writeNotes(openai: OpenAI, transcript: string, when: string, length: string, aboutMe: string, model = NOTES_MODEL, asked: string[] = []) {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: NOTES_SYSTEM },
      { role: "user", content: notesPrompt(transcript, when, length, aboutMe, asked) },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: NOTES_EFFORT as any,
    max_completion_tokens: 32000,
  } as any);
  return cleanNotes(JSON.parse(completion.choices[0]?.message?.content || "{}"), asked);
}

// A second read of the transcript against the notes just written: anything
// said that carries information and isn't in the notes comes back as
// additions, in the notes' own shape, and is merged in. One model never
// catches everything in one pass over an hour of talk (Anna, Oct 27 2026:
// "make sure the adhd recording notes dont leave out information"). On any
// failure the first notes stand.
async function fillGaps(openai: OpenAI, transcript: string, notes: any, model: string) {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: NOTES_SYSTEM },
      { role: "user", content: `The transcript, with [time] marks where each stretch starts:
"""
${transcript}
"""

The notes written from it so far, as JSON:
${JSON.stringify({ todos: notes.todos, details: notes.details, sections: notes.sections, decisions: notes.decisions, questions: notes.questions })}

Read the transcript again, start to finish, and find everything that was said and carries
information but is NOT in these notes: a fact, an instruction, a number, a name, a date, a reason
or explanation the speaker gave, a warning, an option that was weighed, a question asked, an
answer given, a thing someone has to do. Compare meaning, not wording: something already in the
notes in other words is not missing. Greetings, filler and small talk are not missing either.

Return only the additions, each written like the notes (one short plain line, key words marked
with ==double equals==, exact details copied as said, "at" = the [time] mark of its stretch):
- todos, details, decisions, questions: new items for those lists.
- sections: a point that belongs under a heading the notes already have goes under that same
  heading, copied exactly; a topic the notes don't cover gets a new short heading.
Never repeat what the notes already say. Never invent. Empty lists when nothing is missing.

Return JSON:
{
  "todos": [{ "text": "...", "who": "you", "at": "0:00" }],
  "details": [{ "label": "...", "value": "...", "at": "0:00" }],
  "sections": [{ "heading": "...", "points": ["..."], "at": "0:00" }],
  "decisions": [{ "text": "...", "at": "0:00" }],
  "questions": [{ "text": "...", "at": "0:00" }]
}` },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: NOTES_EFFORT as any,
    max_completion_tokens: 32000,
  } as any);
  const extra = cleanNotes(JSON.parse(completion.choices[0]?.message?.content || "{}"));
  const norm = (s: string) => String(s || "").replace(/==/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const seen = new Set<string>();
  const take = (list: any[], key: (x: any) => string) => list.filter((x) => {
    const k = norm(key(x));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  for (const t of arr(notes.todos)) seen.add(norm(t?.text));
  for (const d of arr(notes.details)) seen.add(norm(`${d?.label} ${d?.value}`));
  for (const s of arr(notes.sections)) for (const p of arr(s?.points)) seen.add(norm(p));
  for (const d of arr(notes.decisions)) seen.add(norm(d?.text));
  for (const q of arr(notes.questions)) seen.add(norm(q?.text));
  const merged = { ...notes };
  merged.todos = [...arr(notes.todos), ...take(extra.todos, (t) => t.text)].slice(0, 60);
  merged.details = [...arr(notes.details), ...take(extra.details, (d) => `${d.label} ${d.value}`)].slice(0, 100);
  merged.decisions = [...arr(notes.decisions), ...take(extra.decisions, (d) => d.text)].slice(0, 40);
  merged.questions = [...arr(notes.questions), ...take(extra.questions, (q) => q.text)].slice(0, 40);
  const sections = arr(notes.sections).map((s: any) => ({ ...s, points: [...arr(s?.points)] }));
  for (const s of extra.sections) {
    const points = take(s.points, (p) => p);
    if (!points.length) continue;
    const same = sections.find((x: any) => norm(x.heading) === norm(s.heading));
    if (same) same.points = [...same.points, ...points].slice(0, 25);
    else sections.push({ heading: s.heading, points: points.slice(0, 25), at: s.at });
  }
  merged.sections = sections.slice(0, 40);
  const added = (merged.todos.length - arr(notes.todos).length) + (merged.details.length - arr(notes.details).length)
    + (merged.decisions.length - arr(notes.decisions).length) + (merged.questions.length - arr(notes.questions).length)
    + merged.sections.reduce((n: number, s: any) => n + s.points.length, 0) - arr(notes.sections).reduce((n: number, s: any) => n + arr(s?.points).length, 0);
  return { notes: merged, added };
}

async function notesMake(base44: any, user: any, body: any) {
  const recordId = String(body?.record_id || "");
  const rec = await getRecording(base44, recordId);
  if (!rec) return Response.json({ ok: false, error: "No such recording" }, { status: 404 });
  const parts: any[] = (Array.isArray(rec.transcript_parts) ? rec.transcript_parts : [])
    .slice().sort((a, b) => a.index - b.index);
  const transcript = parts
    .filter((p) => String(p?.text || "").trim())
    .map((p) => `[${clock(p.start_ms)}] ${String(p.text).trim()}`)
    .join("\n\n");

  const asked = questionsOf(rec);
  let notes;
  if (transcript.replace(/\[[^\]]*\]/g, "").trim().length < 20) {
    notes = cleanNotes({ title: rec.title || "Recording", gist: ["This recording didn't pick up any speech."] }, asked);
  } else {
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const when = whenRecorded(rec.started_at, user?.timezone);
    const length = lengthOf(rec.duration_ms);
    const aboutMe = String(user?.about_me || "").slice(0, 400);
    let wroteWith = NOTES_MODEL;
    try {
      notes = await writeNotes(openai, transcript, when, length, aboutMe, NOTES_MODEL, asked);
    } catch (e) {
      console.error(`[notes] ${NOTES_MODEL} failed for ${recordId}, trying ${NOTES_BACKUP_MODEL}:`, e?.message || e);
      try {
        notes = await writeNotes(openai, transcript, when, length, aboutMe, NOTES_BACKUP_MODEL, asked);
        wroteWith = NOTES_BACKUP_MODEL;
      } catch (e2) {
        console.error(`[notes] notes failed for ${recordId}:`, e2?.message || e2);
        await base44.entities.EnergyLog.update(recordId, { status: "notes_failed" });
        return Response.json({ ok: false, error: "notes_failed" }, { status: 502 });
      }
    }
    // The second read, for anything the first pass left out. Skipped for a
    // recording with barely anything in it.
    if (transcript.length > 1200) {
      try {
        const { notes: fuller, added } = await fillGaps(openai, transcript, notes, wroteWith);
        if (added > 0) console.log(`[notes] second read added ${added} line${added === 1 ? "" : "s"} to ${recordId}`);
        notes = fuller;
      } catch (e) {
        console.error(`[notes] second read failed for ${recordId}, keeping the first notes:`, e?.message || e);
      }
    }
  }
  const title = String(rec.title || "").trim() || notes.title || "Recording";
  // "Record more" on a finished recording (Anna, Oct 13 2026): this recording
  // is a follow-up to an earlier one. Its notes go onto the first recording's
  // notes as additions, under a heading with the time it was recorded, and
  // nothing already in those notes is touched. The follow-up keeps its own
  // notes and transcript too (the page shows its transcript under the first).
  const parentId = String(rec.parent_record_id || "");
  const parent = parentId ? await getRecording(base44, parentId) : null;
  if (parent && parent.id !== rec.id) {
    const merged = addNotesTo(parent.notes, notes, whenAdded(rec.started_at, user?.timezone));
    await base44.entities.EnergyLog.update(parent.id, { notes: merged, status: parent.status === "ready" ? "ready" : parent.status });
    await base44.entities.EnergyLog.update(recordId, { notes, title, status: "merged" });
    return Response.json({ ok: true, notes: merged, title: parent.title || title, merged_into: parent.id });
  }
  await base44.entities.EnergyLog.update(recordId, { notes, title, status: "ready" });
  return Response.json({ ok: true, notes, title });
}

// The clock time a follow-up recording started, in the person's zone ("12:40 PM").
function whenAdded(startedAt: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(startedAt || Date.now()));
  } catch (_) {
    return "";
  }
}

// The first recording's notes with a follow-up's added on: everything already
// there stays as it is, in the same order; the follow-up's gist becomes a
// section headed "Added <time>", its own sections follow with the same mark,
// and its to-dos, details, decisions and open questions go on the end of the
// matching lists (appended, so a to-do already marked "added" keeps its place).
function addNotesTo(existing: any, extra: any, when: string) {
  // Taken as saved, not re-cleaned: cleanNotes caps each list, and an earlier
  // addition may already have taken a list past its cap.
  const list = (v: any) => (Array.isArray(v) ? v : []);
  const base = {
    ...(existing && typeof existing === "object" ? existing : {}),
    gist: list(existing?.gist), todos: list(existing?.todos), details: list(existing?.details),
    sections: list(existing?.sections), decisions: list(existing?.decisions), questions: list(existing?.questions),
  };
  const mark = when ? `Added ${when}` : "Added later";
  const sections = [...(base.sections || [])];
  if (extra?.gist?.length) sections.push({ heading: mark, points: extra.gist.slice(0, 8), at: "" });
  for (const s of extra?.sections || []) sections.push({ heading: `${s.heading} (${mark.toLowerCase()})`, points: s.points, at: s.at || "" });
  return {
    ...base,
    sections,
    todos: [...(base.todos || []), ...(extra?.todos || [])],
    details: [...(base.details || []), ...(extra?.details || [])],
    decisions: [...(base.decisions || []), ...(extra?.decisions || [])],
    questions: [...(base.questions || []), ...(extra?.questions || [])],
  };
}

// The whole transcript of a recording, with [time] marks, cut at `max`.
function transcriptOf(rec: any, max = 60000): string {
  const parts: any[] = (Array.isArray(rec?.transcript_parts) ? rec.transcript_parts : [])
    .slice().sort((a, b) => a.index - b.index);
  const text = parts
    .filter((p) => String(p?.text || "").trim())
    .map((p) => `[${clock(p.start_ms)}] ${String(p.text).trim()}`)
    .join("\n\n");
  return text.length > max ? `${text.slice(0, max)}\n[…the rest is cut off]` : text;
}

// One model call answered in JSON, Luna first and Astra if Luna fails.
async function askJson(openai: OpenAI, system: string, prompt: string, maxTokens = 16000) {
  let lastError: any = null;
  for (const model of [NOTES_MODEL, NOTES_BACKUP_MODEL]) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        response_format: { type: "json_object" },
        reasoning_effort: NOTES_EFFORT as any,
        max_completion_tokens: maxTokens,
      } as any);
      return JSON.parse(completion.choices[0]?.message?.content || "{}");
    } catch (e) {
      lastError = e;
      console.error(`[notes] ${model} failed:`, (e as any)?.message || e);
    }
  }
  throw lastError;
}

// ── A typed change to the notes ────────────────────────────────────────────
// The Notes page's one box instead of editing every line by hand (Anna, Oct 12
// 2026: "the user could just type 'add ___' and it would just be added to the
// right part of the notes automatically").
async function notesChange(base44: any, user: any, body: any) {
  const recordId = String(body?.record_id || "");
  const request = String(body?.request || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!request) return Response.json({ ok: false, error: "Nothing to change" }, { status: 400 });
  const rec = await getRecording(base44, recordId);
  if (!rec || !rec.notes) return Response.json({ ok: false, error: "No such notes" }, { status: 404 });
  const asked = questionsOf(rec);
  const before: any = { ...rec.notes, title: String(rec.title || rec.notes.title || "").trim() };
  delete before.edited;
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  let out: any;
  try {
    out = await askJson(openai, NOTES_SYSTEM, `These are the notes from a recording they made (${whenRecorded(rec.started_at, user?.timezone)}), as JSON:
${JSON.stringify(before)}

They typed this about their notes:
"${request}"

Make that change, and only that change, and return the whole notes.
- Everything they didn't ask to change stays exactly as it is, word for word, with its ==highlights== and its "at".
- Something to add goes in the part of the notes where it belongs: a thing someone has to do in todos (written as one line that works on its own as a task; "who" is "you" unless they say whose it is), an exact detail to look up later (a number, dose, price, date, time, name, phone number, address) in details, something decided in decisions, something still unanswered in questions, anything else as a point under the section it fits, or a new short section when none fits. Into the gist only when they ask for it there.
- Write anything you add like the rest of the notes: short and plain, one idea per line, key words marked with ==double equals==. Turn relative days into real dates using the date it was recorded.
- Add only what they told you. When they point at something in the recording ("add what she said about the dose"), take it from the transcript below, copying exact details as said; if it isn't there, change nothing and say so.
- To remove or fix something, remove or fix just that.
- The title changes only when they ask for a new one.${asked.length ? `
- "asked" (the questions they wrote down beforehand) keeps every question as written; change an answer only when they ask.` : ""}
- If what they typed isn't a change to these notes (a question, say), change nothing.

The transcript, for anything they point at:
"""
${transcriptOf(rec, 40000) || "(no transcript)"}
"""

Return JSON:
{ "changed": true or false, "said": "one short plain line saying what you changed (or why nothing changed)", "notes": { the whole notes, same shape as above } }`);
  } catch (_) {
    return Response.json({ ok: false, error: "change_failed" }, { status: 502 });
  }
  const said = String(out?.said || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (out?.changed !== true || !out?.notes || typeof out.notes !== "object") {
    return Response.json({ ok: true, changed: false, said: said || "Nothing changed.", notes: rec.notes, title: rec.title });
  }
  const cleaned: any = cleanNotes(out.notes, asked);
  // Kept from before: which to-dos were already put on their list.
  const oldTodos: any[] = Array.isArray(rec.notes.todos) ? rec.notes.todos : [];
  cleaned.todos = cleaned.todos.map((t: any) => {
    const was = oldTodos.find((o) => String(o?.text || "").trim() === t.text);
    return was?.added ? { ...t, added: true } : t;
  });
  cleaned.edited = true;
  const newTitle = cleaned.title && cleaned.title !== before.title ? cleaned.title : "";
  await base44.entities.EnergyLog.update(recordId, { notes: cleaned, ...(newTitle ? { title: newTitle } : {}) });
  return Response.json({ ok: true, changed: true, said: said || "Updated.", notes: cleaned, title: newTitle || rec.title });
}

// ── A question about their recordings ──────────────────────────────────────
// "When did my boss say the report was due?" (Anna, Oct 12 2026). First the
// recordings that could hold the answer are picked from their notes, then the
// answer comes from those recordings in full, transcripts included.
async function notesAsk(base44: any, user: any, body: any) {
  const question = String(body?.question || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!question) return Response.json({ ok: false, error: "No question" }, { status: 400 });
  const rows: any[] = (await base44.entities.EnergyLog.filter({ kind: "note_recording" }, "-started_at", 100)) || [];
  const recs = rows.filter((r) => r?.notes || (Array.isArray(r?.transcript_parts) && r.transcript_parts.length));
  if (!recs.length) return Response.json({ ok: true, answer: "You don't have any recordings with notes yet.", sources: [] });
  const tz = user?.timezone || undefined;
  const today = whenRecorded(new Date().toISOString(), tz);
  const brief = (r: any) => {
    const n = r.notes || {};
    return {
      title: String(r.title || n.title || "Recording"),
      recorded: whenRecorded(r.started_at, tz),
      gist: n.gist || [],
      todos: (n.todos || []).map((t: any) => `${t.who && t.who !== "you" ? `${t.who}: ` : ""}${t.text}`),
      details: (n.details || []).map((d: any) => [d.label, d.value].filter(Boolean).join(": ")),
      topics: (n.sections || []).map((x: any) => ({ heading: x.heading, points: x.points })),
      decided: (n.decisions || []).map((x: any) => x.text),
      open: (n.questions || []).map((x: any) => x.text),
    };
  };
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const SYSTEM = "You help someone with ADHD find things in recordings they made of meetings, appointments, classes and conversations. Answer with JSON only.";

  // 1. Which recordings could answer it.
  let index = recs.map((r, i) => JSON.stringify({ n: i + 1, ...brief(r) })).join("\n");
  if (index.length > 120000) index = index.slice(0, 120000);
  let picks: number[] = [];
  try {
    const got = await askJson(openai, SYSTEM, `Today is ${today}. They asked: "${question}"

Their recordings, newest first, each with its notes:
${index}

Which recordings could hold the answer? Think about what the question is really about, not just its words: "my boss" may be a manager named in the notes, "the report" may be called something else there. Pick up to 3, most likely first; none if no recording could.

Return JSON: { "picks": [recording n, ...] }`, 2000);
    picks = (Array.isArray(got?.picks) ? got.picks : []).map((x: any) => Number(x)).filter((x: number) => x >= 1 && x <= recs.length);
  } catch (_) {
    return Response.json({ ok: false, error: "ask_failed" }, { status: 502 });
  }
  const picked = [...new Set(picks)].slice(0, 3).map((n) => recs[n - 1]);
  if (!picked.length) {
    return Response.json({ ok: true, answer: "I couldn't find that in your recordings.", sources: [] });
  }

  // Their tasks, so the answer can name the one it's about as it appears in their list.
  let taskLines = "";
  try {
    const tasks: any[] = (await base44.entities.Task.filter({ status: "active" }, "-created_date", 200)) || [];
    taskLines = tasks
      .filter((t) => t?.title && !t.parent_task_id)
      .slice(0, 150)
      .map((t) => `- ${t.title}${t.due_date ? ` (due ${whenRecorded(t.due_date, tz).replace(/ at .*$/, "")})` : ""}`)
      .join("\n");
  } catch (_) { /* answer without them */ }

  // 2. The answer, from those recordings in full.
  const material = picked.map((r, i) => `RECORDING ${i + 1}: "${String(r.title || r.notes?.title || "Recording")}", recorded ${whenRecorded(r.started_at, tz)}
Notes: ${JSON.stringify(brief(r))}
Transcript:
"""
${transcriptOf(r, 50000) || "(no transcript)"}
"""`).join("\n\n");
  let out: any;
  try {
    out = await askJson(openai, SYSTEM, `Today is ${today}. They asked: "${question}"

${material}
${taskLines ? `\nTheir task list right now:\n${taskLines}\n` : ""}
Answer from these recordings only.
- The answer first, in one to three short plain sentences, with the exact details as said (dates, times, numbers, names). Turn relative days into real dates using the day the recording was made ("by Friday" said on Wednesday, October 7 is Friday, October 9).
- Then who said it and in which recording, briefly ("Your boss said it in the budget meeting on October 7").
- If one of their tasks is the same thing, name it as it appears in their list.
- If these recordings don't answer it, say so plainly. Never guess and never fill in from general knowledge.
- Talk to them as "you". No jargon.

Return JSON: { "answer": "...", "sources": [the RECORDING numbers the answer came from] }`, 4000);
  } catch (_) {
    return Response.json({ ok: false, error: "ask_failed" }, { status: 502 });
  }
  const answer = String(out?.answer || "").trim().slice(0, 1200) || "I couldn't find that in your recordings.";
  const used = (Array.isArray(out?.sources) ? out.sources : []).map((x: any) => Number(x)).filter((x: number) => x >= 1 && x <= picked.length);
  const sources = [...new Set(used)].map((n) => picked[n - 1]).map((r) => ({ id: r.id, title: String(r.title || r.notes?.title || "Recording"), started_at: r.started_at }));
  return Response.json({ ok: true, answer, sources });
}

// ── The second read, on request ─────────────────────────────────────────────────
async function notesFill(base44: any, user: any, body: any) {
  const recordId = String(body?.record_id || "");
  const rec = await getRecording(base44, recordId);
  if (!rec || !rec.notes) return Response.json({ ok: false, error: "No such notes" }, { status: 404 });
  const transcript = transcriptOf(rec, 200000);
  if (transcript.replace(/\[[^\]]*\]/g, "").trim().length < 20) {
    return Response.json({ ok: true, added: 0, notes: rec.notes, said: "There's no transcript to check against." });
  }
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  // Taken as saved (cleanNotes would re-cap lists and drop the edited flag).
  const list = (v: any) => (Array.isArray(v) ? v : []);
  const saved = { ...rec.notes, todos: list(rec.notes.todos), details: list(rec.notes.details), sections: list(rec.notes.sections), decisions: list(rec.notes.decisions), questions: list(rec.notes.questions) };
  let result;
  try {
    result = await fillGaps(openai, transcript, saved, NOTES_MODEL);
  } catch (e) {
    try {
      result = await fillGaps(openai, transcript, saved, NOTES_BACKUP_MODEL);
    } catch (e2) {
      console.error(`[notes] fill failed for ${recordId}:`, (e2 as any)?.message || e2);
      return Response.json({ ok: false, error: "fill_failed" }, { status: 502 });
    }
  }
  const { notes, added } = result;
  if (added > 0) await base44.entities.EnergyLog.update(recordId, { notes });
  return Response.json({ ok: true, added, notes: added > 0 ? notes : rec.notes,
    said: added > 0 ? `Added ${added} line${added === 1 ? "" : "s"} the notes had missed.` : "Nothing was missing. The notes already cover everything that was said." });
}

// ── A question about ONE recording, answered in the speaker's own words ─────
// "What did my doctor say about the dose?" on that recording's page (Anna,
// Oct 27 2026: "comprehensive enough to just be able to ask... and then using
// actual quotes from the transcript"). The whole transcript is read, the
// answer comes with the exact stretches it rests on, and every quote is
// checked against the transcript before it's shown: one the model reworded
// or made up is dropped, never shown as the speaker's words.
function quoteKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9%$.,:;!?\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function notesAskOne(base44: any, user: any, body: any) {
  const recordId = String(body?.record_id || "");
  const question = String(body?.question || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!question) return Response.json({ ok: false, error: "No question" }, { status: 400 });
  // __try: a transcript handed in by the admin self-test (notesTry), no record.
  const rec = base44?.__try && recordId === "try" ? base44.__try : await getRecording(base44, recordId);
  if (!rec) return Response.json({ ok: false, error: "No such recording" }, { status: 404 });
  // A follow-up recorded onto this one ("Record more") is part of the same
  // conversation: its transcript is read too, after this one's.
  let followUps: any[] = [];
  try {
    followUps = ((await base44.entities.EnergyLog.filter({ kind: "note_recording", parent_record_id: rec.id }, "started_at", 20)) || [])
      .filter((r: any) => r?.id !== rec.id);
  } catch (_) { followUps = []; }
  const tz = user?.timezone || undefined;
  const pieces = [rec, ...followUps].map((r, i) => {
    const t = transcriptOf(r, 120000);
    return t ? `${i === 0 ? "" : `\n[Recorded again ${whenAdded(r.started_at, tz)}]\n`}${t}` : "";
  }).filter(Boolean);
  const transcript = pieces.join("\n\n");
  if (transcript.replace(/\[[^\]]*\]/g, "").trim().length < 20) {
    return Response.json({ ok: true, answer: "This recording didn't pick up any speech, so there's nothing to look in.", quotes: [] });
  }
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const SYSTEM = "You help someone with ADHD find what was said in a recording they made of an appointment, meeting, class or conversation. You answer only from the transcript, and you quote it exactly. Answer with JSON only.";
  let out: any;
  try {
    out = await askJson(openai, SYSTEM, `The recording: "${String(rec.title || rec.notes?.title || "Recording")}", made ${whenRecorded(rec.started_at, tz)}.${user?.about_me ? `\nAbout the person who made it: ${String(user.about_me).slice(0, 300)}` : ""}

The full transcript, with [time] marks where each stretch starts:
"""
${transcript}
"""

They asked: "${question}"

Read the whole transcript before answering; the answer may be spread over several places, and the
last mention can change the first ("actually, make that twice a day").
- answer: what was said about it, told in your own plain words (no quotation marks here; the
  exact words go in "quotes" below), two to six short sentences, every exact detail as said
  (doses, numbers, dates, names, what to do and when). Say who said it when the transcript
  makes that clear ("the doctor", "Dr. Patel", "your boss"). Talk to them as "you". If it never
  came up, say so plainly in one sentence. Never guess, never add general knowledge, never
  soften or interpret what was said.
- quotes: the exact words from the transcript the answer rests on, copied character for
  character from the transcript (no cleaning up, no paraphrase, no "..."), each one a single
  continuous stretch of 5 to 60 words, with "at" = the [time] mark of the stretch it sits in.
  Up to 6, the most telling first. Empty if it never came up.

Return JSON: { "answer": "...", "quotes": [{ "text": "...", "at": "0:00" }] }`, 6000);
  } catch (_) {
    return Response.json({ ok: false, error: "ask_failed" }, { status: 502 });
  }
  const answer = String(out?.answer || "").replace(/\s+/g, " ").trim().slice(0, 1500) || "I couldn't find that in this recording.";
  const haystack = quoteKey(transcript);
  const quotes: any[] = [];
  let dropped = 0;
  for (const q of (Array.isArray(out?.quotes) ? out.quotes : []).slice(0, 10)) {
    const text = String(q?.text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    const key = quoteKey(text);
    if (!text || key.length < 12) continue;
    if (!haystack.includes(key)) { dropped++; continue; }
    quotes.push({ text, at: String(q?.at || "").trim().slice(0, 12) });
    if (quotes.length >= 6) break;
  }
  if (dropped) console.log(`[notes] ask_one: dropped ${dropped} quote${dropped === 1 ? "" : "s"} not found word for word in ${recordId}`);
  return Response.json({ ok: true, answer, quotes });
}

async function notesTry(user: any, body: any) {
  if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const transcript = String(body?.transcript || "");
  const model = TRY_MODELS.includes(body?.model) ? body.model : NOTES_MODEL;
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const started = Date.now();
  // { question } instead: the one-recording ask (notes_ask_one) run on this
  // transcript, quotes checked the same way, nothing saved.
  if (body?.question) {
    const fake = { id: "try", title: String(body?.title || "Test recording"), started_at: body?.started_at || new Date().toISOString(),
      transcript_parts: [{ index: 0, start_ms: 0, text: transcript }] };
    const stub = { entities: { EnergyLog: { filter: async () => [] } } };
    const res = await notesAskOne({ ...stub, __try: fake }, user, { record_id: "try", question: body.question });
    const out = await res.json();
    return Response.json({ model: NOTES_MODEL, seconds: Math.round((Date.now() - started) / 100) / 10, ...out });
  }
  const first = await writeNotes(openai, transcript, whenRecorded(body?.started_at, user?.timezone),
    lengthOf(Number(body?.duration_ms) || 30 * 60000), String(body?.about_me || ""), model, questionsOf(body));
  // The second read too, so a test shows what ships.
  let notes = first, added = 0;
  if (transcript.length > 1200 && body?.second_read !== false) {
    try {
      const r = await fillGaps(openai, transcript, first, model);
      notes = r.notes; added = r.added;
    } catch (e) {
      console.error("[notes] try: second read failed:", (e as any)?.message || e);
    }
  }
  return Response.json({ model, seconds: Math.round((Date.now() - started) / 100) / 10, second_read_added: added, notes });
}

// ── Entry ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await whoIsAsking(base44);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body?.mode === "notes_part") return await notesPart(base44, user, body);
    if (body?.mode === "notes_make") return await notesMake(base44, user, body);
    if (body?.mode === "notes_change") return await notesChange(base44, user, body);
    if (body?.mode === "notes_ask") return await notesAsk(base44, user, body);
    if (body?.mode === "notes_ask_one") return await notesAskOne(base44, user, body);
    if (body?.mode === "notes_fill") return await notesFill(base44, user, body);
    if (body?.mode === "notes_try") return await notesTry(user, body);

    // Voice typing (Parking Lot), as before.
    const { audio_base64, filename } = body || {};
    if (!audio_base64) return Response.json({ error: "audio_base64 is required" }, { status: 400 });
    const bytes = decodeBase64(String(audio_base64));
    const audioFile = new File([bytes], filename || "audio.webm", { type: "audio/webm" });
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const transcription = await openai.audio.transcriptions.create({ file: audioFile, model: "whisper-1" });
    return Response.json({ text: transcription.text });
  } catch (error) {
    console.error("[transcribeAudioNew] error:", error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});