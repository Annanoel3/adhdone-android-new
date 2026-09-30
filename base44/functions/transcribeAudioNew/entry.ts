import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import OpenAI, { toFile } from "npm:openai";

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

const NOTES_FREE_MINUTES = 60;
const TRANSCRIBE_MODEL = "gpt-transcribe";
// Luna wrote notes as good as Astra's in side-by-side tests (Sept 27 2026) at
// about a hundredth of the cost and twice the speed. Astra steps in if Luna fails.
const NOTES_MODEL = "gpt-6-luna";
const NOTES_BACKUP_MODEL = "gpt-6-astra";
const NOTES_EFFORT = "low";
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

function usageOf(user: any) {
  const month = monthKey(user?.timezone);
  const used = user?.notes_minutes_month === month ? Math.max(0, Number(user?.notes_seconds_used) || 0) : 0;
  const limit = NOTES_FREE_MINUTES * 60;
  return { month, used_seconds: used, limit_seconds: limit, left_seconds: Math.max(0, limit - used) };
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
  if (done) return Response.json({ ok: true, index, already: true, usage: usageOf(user) });

  const usage = usageOf(user);
  if (usage.left_seconds <= 0) {
    return Response.json({ ok: false, over_limit: true, usage });
  }

  const b64 = String(body?.audio_base64 || "");
  if (!b64) return Response.json({ ok: false, error: "audio_base64 is required" }, { status: 400 });
  const bytes = decodeBase64(b64);
  const startMs = Math.max(0, Number(body?.start_ms) || 0);
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
  return Response.json({
    ok: true,
    index,
    chars: text.length,
    usage: { ...usage, used_seconds: after, left_seconds: Math.max(0, usage.limit_seconds - after) },
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
one idea per line, and keep lines short. Skip small talk and anything that doesn't matter later.

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
    todos: list(r?.todos)
      .map((t) => ({ text: str(t?.text), who: str(t?.who, 60) || "you", at: str(t?.at, 12) }))
      .filter((t) => t.text).slice(0, 30),
    details: list(r?.details)
      .map((d) => ({ label: str(d?.label, 80), value: str(d?.value), at: str(d?.at, 12) }))
      .filter((d) => d.label || d.value).slice(0, 40),
    sections: list(r?.sections)
      .map((s) => ({
        heading: str(s?.heading, 80),
        points: list(s?.points).map((p) => str(p)).filter(Boolean).slice(0, 8),
        at: str(s?.at, 12),
      }))
      .filter((s) => s.heading && s.points.length).slice(0, 12),
    decisions: items(r?.decisions).slice(0, 20),
    questions: items(r?.questions).slice(0, 20),
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
    max_completion_tokens: 16000,
  } as any);
  return cleanNotes(JSON.parse(completion.choices[0]?.message?.content || "{}"), asked);
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
    try {
      notes = await writeNotes(openai, transcript, when, length, aboutMe, NOTES_MODEL, asked);
    } catch (e) {
      console.error(`[notes] ${NOTES_MODEL} failed for ${recordId}, trying ${NOTES_BACKUP_MODEL}:`, e?.message || e);
      try {
        notes = await writeNotes(openai, transcript, when, length, aboutMe, NOTES_BACKUP_MODEL, asked);
      } catch (e2) {
        console.error(`[notes] notes failed for ${recordId}:`, e2?.message || e2);
        await base44.entities.EnergyLog.update(recordId, { status: "notes_failed" });
        return Response.json({ ok: false, error: "notes_failed" }, { status: 502 });
      }
    }
  }
  const title = String(rec.title || "").trim() || notes.title || "Recording";
  await base44.entities.EnergyLog.update(recordId, { notes, title, status: "ready" });
  return Response.json({ ok: true, notes, title });
}

async function notesTry(user: any, body: any) {
  if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const transcript = String(body?.transcript || "");
  const model = TRY_MODELS.includes(body?.model) ? body.model : NOTES_MODEL;
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  const started = Date.now();
  const notes = await writeNotes(openai, transcript, whenRecorded(body?.started_at, user?.timezone),
    lengthOf(Number(body?.duration_ms) || 30 * 60000), String(body?.about_me || ""), model, questionsOf(body));
  return Response.json({ model, seconds: Math.round((Date.now() - started) / 100) / 10, notes });
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
