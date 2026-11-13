// Re-saved Nov 10 2026 so the bundled shared/taskParsePrompt.ts is picked up: a shared or pasted confirmation gets a short calendar-style title (no order numbers, order dates, hours or fine print), and a dated visit for care or tests is an event.
// Re-saved Nov 6 2026 (night) so the bundled shared/aiCost.ts is picked up: AI token counts per feature (counting only, nothing else changes).
// Re-saved Nov 6 2026 (night) so the bundled shared/captureToTasks.ts is picked up: the tracker look runs on the private OpenAI key (shared/privateAi.ts), never used for training.
// Re-saved Nov 4 2026 (evening) so the bundled shared/runTaskParse.ts, shared/taskParsePrompt.ts and shared/captureToTasks.ts are picked up: prep_worthy (an appointment with something to get ready first) is parsed and saved, its night-before reminder asks for the prep note, and a capture too late for that gets one "anything to prep?" push (shared/prepNote.ts).
// Re-saved Nov 4 2026 so the bundled shared/captureToTasks.ts is picked up: a captured event at a place has its "leave now" measured from where they'll be (the event before it, work, or home: shared/leaveOrigin.ts via generateReminderSchedule's ownerEmail/taskId).
// Re-saved Nov 1 2026 so the bundled shared/runTaskParse.ts, shared/taskParsePrompt.ts and shared/captureToTasks.ts are picked up: worth_breaking_down, a several-steps job, saved on the task so the card offers "Break it into steps" right on the row.
// Re-saved Oct 21 2026 so the bundled shared/captureToTasks.ts is picked up: something they describe about a tracked thing (no reading) is kept as a note, never charted.
// Re-saved Oct 19 2026 (night) so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: a link the task needs (a video-session or meeting link) goes in the task's notes, never its title, and the time zone of a time stays out of the title.
// Re-saved Oct 19 2026 so the bundled shared/runTaskParse.ts is picked up: a time picked from a part of the day ("morning medication") is never marked as one the person stated, so it can't ring inside their quiet hours.
// Re-saved Oct 17 2026 (evening) so the bundled shared/taskParsePrompt.ts and shared/runTaskParse.ts are picked up: an event that runs past midnight (7 PM–2 AM) is one night, not a two-day range, and a day counted from the real date instead of the said-at day gets a last look.
// Re-saved Oct 17 2026 so the bundled shared/runTaskParse.ts, shared/taskParsePrompt.ts and shared/captureToTasks.ts are picked up: the parser and the tracker look run on gpt-6-astra, the parser's calendar beats the real date astra is given, and "tomorrow morning" / "Sunday night" get a time.
// Re-saved Oct 16 2026 so the bundled shared/captureToTasks.ts is picked up: the tracker look runs on the parser's model and never logs words that aren't about the tracker (or the word "null").
// Re-saved Oct 14 2026 (night, again after the shared file itself was saved) so the bundled shared/captureToTasks.ts is picked up: a reading for a tracker they already have is logged to it the moment the capture lands, not when the Parking Lot page next opens.
// Re-saved Oct 14 2026 (afternoon) so the bundled shared/captureToTasks.ts is picked up: a "by" deadline ("sometime this week") gets start_date = now, so it sits under Today every day until the deadline.
// Re-saved Oct 14 2026 so the bundled shared/taskParsePrompt.ts is picked up: needs_date_pick is always false (the app never asks "when?"; a task with no day is made with no day, as this path always did).
// Re-saved Oct 13 2026 (night) so the bundled shared/captureToTasks.ts is picked up: a captured event's pushes carry an event's buttons (Snooze only), not a task's.
// Re-saved Oct 13 2026 (evening) so the bundled shared/captureToTasks.ts is picked up: a heads-up moved off another push's minute is saved at the minute it really goes.
// Re-saved Oct 13 2026 so the bundled shared/runTaskParse.ts is picked up: one more ask when words that name a part of the day ("tonight") came back with no time.
// Re-saved Oct 13 2026 so the bundled shared/taskParsePrompt.ts is picked up: a phone number, address or amount they typed stays in the title.
// Re-saved Oct 13 2026 so the bundled captureToTasks.ts is picked up (the reminder at a task's own time saves the words schedulePush sent it with).
// Re-saved Oct 12 2026 so the bundled captureToTasks.ts is picked up (an event with no clock time gets the day before and the morning of, not "It's time" at 9 AM).
// Re-saved Oct 8 2026 (bare "ASAP" with no due date = start now). Re-saved Oct 7 2026 so the bundled shared parse files are picked up (a rhythm needs quoted pace words — repeat_words;
// Oct 6: "ASAP" / "first thing" are the task's timing, never a reminder wish).
// The single endpoint the NATIVE share sheet / quick-capture calls.
//
// POST { text, timezone? }  →  { success, tasks: [{ id, title }] }
//
// Native does nothing but hand over the raw text: this parses it, splits it if
// it holds several separate errands, creates the Task records, and schedules
// the reminder pushes — all server-side, so the app never has to open and the
// save is silent and instant. Ideas go to the Parking Lot, birthdays become
// yearly birthday records, and anything meant for ADHDone itself is kept in the
// Parking Lot with an offer to send it to the developer (see captureToTasks).
// (Last redeployed Oct 12 2026 for the parser's time_stated flag and the
// user's quiet hours in its prompt, and before that Oct 3 2026 for the parser's takes_time flag — the card's Time
// it button — and before that Sept 27 2026 for the parse fixes in the shared files bundled
// below: a clock time with no day gets its day, "Grandma" stays in the title,
// "next Tuesday" is next week's Tuesday, a failed kind check says why in this
// function's log, and splitting asks detectMultipleTasks, the same check the
// app uses. Redeployed again the same day so an appointment captured from outside
// the app can get reminders worded for recording notes.)

import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { runTaskParse } from "../../shared/runTaskParse.ts";
import { buildTaskParsePrompt } from "../../shared/taskParsePrompt.ts";
import { resolveQuietHours } from "../../shared/quietHours.ts";
// Shared files are bundled into this function when it is deployed, so a change
// to the shared prompt (taskParsePrompt.ts) only reaches users after this
// function is saved and redeployed again.
import {
  splitCapture,
  buildTaskRecord,
  scheduleTaskReminders,
  classifyCapture,
  createParkingLotIdeas,
  foldIdeaIntoTrackers,
  createBirthdayTask,
  queueFeedbackPrompt,
  localToday,
  TASK_KIND,
} from "../../shared/captureToTasks.ts";

// Two deliveries of the SAME capture can arrive at once — the phone re-sending
// while the first attempt is still being worked on. Both pass the capture_id
// check at the top before either has saved anything, so that check alone can't
// stop a double. Ownership is settled after saving instead: the earliest row
// (task or idea) carrying this capture_id wins, and any later arrival removes
// what it just made. Checked twice, the second time after a short pause, so two
// saves landing in the same instant still agree on a single winner.
async function retryBrief<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.log(`[captureText] platform call failed (${i + 1}/${attempts}): ${e?.message}`);
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw last;
}

const byAge = (a: any, b: any) =>
  String(a.created_date || "").localeCompare(String(b.created_date || "")) ||
  String(a.id).localeCompare(String(b.id));

// ── One capture, several ids ────────────────────────────────────────────────
// The app names a capture "pending-…" and each part of one it has split
// "<id>#<n>" (TaskCaptureProcessor.partId). What was made under the whole id
// and what was made under a part id are the same words, so each counts as the
// other already being made: a part arriving after the whole was made here
// makes nothing, and neither does the whole arriving after a part. Ids from
// outside the app (the share sheet, the pinned notification) are only ever
// themselves.
const APP_CAPTURE_RE = /^pending-/;
const PART_RE = /^(.+)#\d+$/;
function sameCaptureIds(captureId: string): string[] {
  if (!APP_CAPTURE_RE.test(captureId)) return [captureId];
  const part = PART_RE.exec(captureId);
  if (part) return [captureId, part[1]];
  return [captureId, ...Array.from({ length: 12 }, (_, i) => `${captureId}#${i}`)];
}
const byIds = (ids: string[]) => (ids.length > 1 ? { capture_id: { $in: ids } } : { capture_id: ids[0] });

// ── The app's safety copy ───────────────────────────────────────────────────
// (Nov 13 2026) A task typed in the app is set up by the app, and handed here
// only when the app goes off screen. An app that stops without that moment
// (killed, crashed, frozen, the phone dying) handed nothing over, and the task
// waited for the next open: a new user's second task, typed at 12:34 PM that
// day, was never made. Now the app gives the phone's own background sender a
// copy the moment it starts on the words, under
// "<capture id>~g~<account tag>" (ShareBridge.handOffCapture, the sender that
// already carries hand-offs: kept on the phone, sent again until it lands).
// That copy is answered here:
//   - the capture was made (by the app, or by a hand-off): done, nothing made;
//   - the app may still be working on it: "not yet" (success false), which the
//     phone's sender takes as "send again later" (10 s, 20 s, 40 s, …);
//   - a minute after this function first saw the copy, with nothing made and
//     the app silent: the capture is made here, as any hand-off is.
// The minute is counted on the server's clock, from a CaptureTrace row
// (captureGuard) written the first time the copy is seen, never from the
// phone's clock. The app itself stops making a capture 40 seconds in and asks
// here instead, so the two never save the same words at once; if they ever
// do, the earliest saved row wins (lostCaptureRace over sameCaptureIds).
const GUARD_RE = /^(.+)~g(?:~([0-9a-f]{8}))?$/;
const GUARD_TAKEOVER_MS = 60 * 1000;
// A trace from their app this recently: it is alive, and it will ask here
// itself. Past the cap the copy is made anyway.
const GUARD_APP_ALIVE_MS = 20 * 1000;
const GUARD_HARD_CAP_MS = 5 * 60 * 1000;
// Which account typed it. Same as accountTag in TaskCaptureProcessor.jsx
// (FNV-1a, 32 bit, hex): the phone's stored sign-in can be an earlier
// account's until the app is next brought to the front.
function accountTag(email: string): string {
  let h = 0x811c9dc5;
  const s = String(email || "").trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const rowMs = (r: any) => {
  const s = String(r?.created_date || "");
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};
const notYet = () => Response.json({ success: false, waiting: true, error: "safety copy: the app still has this one" });

async function lostCaptureRace(base44: any, sameIds: string[], mine: { entity: string; ids: string[] }) {
  for (const pause of [0, 1500]) {
    if (pause) await new Promise((r) => setTimeout(r, pause));
    const [tasks, ideas] = await Promise.all([
      base44.entities.Task.filter(byIds(sameIds)).catch(() => []),
      base44.entities.ParkingLotIdea.filter(byIds(sameIds)).catch(() => []),
    ]);
    const rows = [...(tasks || []), ...(ideas || [])].sort(byAge);
    const first = rows[0];
    if (first && !mine.ids.includes(first.id)) {
      await Promise.all(mine.ids.map((id) => base44.entities[mine.entity].delete(id).catch(() => {})));
      return {
        tasks: (tasks || []).filter((t: any) => !mine.ids.includes(t.id)),
        ideas: (ideas || []).filter((i: any) => !mine.ids.includes(i.id)),
      };
    }
  }
  return null;
}

function duplicateResponse(winner: { tasks: any[]; ideas: any[] }) {
  if (winner.ideas.length) {
    const ideas = winner.ideas.map((i: any) => ({ id: i.id, title: i.idea }));
    return Response.json({ success: true, duplicate: true, kind: "idea", count: ideas.length, tasks: ideas, ideas });
  }
  const tasks = winner.tasks.map((t: any) => ({ id: t.id, title: t.title }));
  return Response.json({ success: true, duplicate: true, kind: "task", count: tasks.length, tasks });
}

Deno.serve(async (req) => {
  try {
    const base44 = await createClientFromRequest(req);
    const { text, timezone, capture_id: sentId, said_at, foldIdea, guardProbe } = await req.json();
    // When the words were said (ms), for a capture the phone held on to and
    // delivered later (no signal, app killed): "tomorrow" counts from then.
    const saidRaw = Number(said_at);
    const saidAt = Number.isFinite(saidRaw) && saidRaw > Date.now() - 60 * 24 * 60 * 60 * 1000 && saidRaw <= Date.now() + 60 * 1000
      ? saidRaw : undefined;
    // The platform occasionally rejects a perfectly good call outright
    // ("Admin permissions required") and then accepts the identical one a
    // moment later. That turned into a 500 the phone had to back off from
    // for ten seconds or more; a couple of quick retries here absorb it.
    const user = await retryBrief(() => base44.auth.me());
    if (!user?.email) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // { guardProbe: true }: the app asks whether this copy of the function
    // knows safety copies (see "The app's safety copy" above) before it sends
    // one. A copy from before Nov 13 2026 answers "text is required", and
    // would have made a second task out of an id it didn't know.
    if (guardProbe) return Response.json({ success: true, guard: 1 });

    // { foldIdea: <id> }: the in-app Add box saved an idea of theirs; give it
    // the same tracker look a captured idea gets, right now (see
    // foldIdeaIntoTrackers). Only their own row, and only a plain new one.
    if (foldIdea) {
      const row = await base44.entities.ParkingLotIdea.get(String(foldIdea)).catch(() => null);
      if (!row || row.tracker || row.parent_idea_id || row.converted_to_task) {
        return Response.json({ success: true, folded: false });
      }
      const fold = await foldIdeaIntoTrackers(base44, { id: row.id, title: String(row.idea || "") });
      return Response.json({ success: true, folded: !!fold?.folded, logged: fold?.logged || [] });
    }

    if (!text || !String(text).trim()) {
      return Response.json({ success: false, error: "text is required" }, { status: 400 });
    }

    const raw = String(text).trim();
    const tz = timezone || user.timezone || "America/Chicago";

    // A safety copy is asked about under the capture's own id.
    let capture_id: string | undefined = sentId ? String(sentId).trim() : undefined;
    let guardBase: string | null = null;
    const guard = capture_id ? GUARD_RE.exec(capture_id) : null;
    if (guard) {
      if (guard[2] && guard[2] !== accountTag(user.email)) {
        console.log(`[captureText] safety copy ${guard[1]}: typed under another account, dropped`);
        return Response.json({ success: true, duplicate: true, kind: "task", count: 0, tasks: [], guard: "other_account" });
      }
      guardBase = guard[1];
      capture_id = guardBase;
    }
    const sameIds = capture_id ? sameCaptureIds(capture_id) : [];

    // Idempotency: native retries after a network failure, and a lost response
    // would otherwise double-create. The same capture_id returns what the first
    // attempt already made instead of parsing and creating all over again.
    if (capture_id) {
      const existingIdeas = await retryBrief(() => base44.entities.ParkingLotIdea.filter(byIds(sameIds)));
      if (existingIdeas?.length) {
        return Response.json({
          success: true,
          duplicate: true,
          kind: "idea",
          count: existingIdeas.length,
          tasks: existingIdeas.map((i: any) => ({ id: i.id, title: i.idea })),
          ideas: existingIdeas.map((i: any) => ({ id: i.id, title: i.idea })),
        });
      }
      const existing = await retryBrief(() => base44.entities.Task.filter(byIds(sameIds)));
      if (existing?.length) {
        return Response.json({
          success: true,
          duplicate: true,
          kind: "task",
          count: existing.length,
          tasks: existing.map((t: any) => ({ id: t.id, title: t.title })),
        });
      }
    }

    // A safety copy with nothing made yet: the app's to finish for the first
    // minute, this function's after it (see "The app's safety copy" above).
    if (guardBase) {
      const traces = base44.asServiceRole.entities.CaptureTrace;
      const now = Date.now();
      let recent: any[] | null = null;
      try {
        recent = await retryBrief(() => traces.filter(
          { user_email: user.email, created_date: { $gte: new Date(now - 24 * 60 * 60 * 1000).toISOString() } }, "-created_date", 200));
      } catch (e) {
        console.error("[captureText] safety copy: could not read the traces:", e?.message);
      }
      // Can't tell how long it has been: never made blind.
      if (!recent) return notYet();
      const mark = recent.filter((r: any) => r.step === "captureGuard" && String(r.detail || "").includes(`"${guardBase}"`)).sort(byAge)[0];
      if (!mark) {
        await traces.create({ step: "captureGuard", detail: JSON.stringify({ id: guardBase }), user_email: user.email })
          .catch((e: any) => console.error("[captureText] safety copy: could not note it:", e?.message));
        return notYet();
      }
      const age = now - rowMs(mark);
      const appRow = recent.find((r: any) => r.step !== "captureGuard" && r.step !== "captureGuardTook");
      const appQuietFor = appRow ? now - rowMs(appRow) : Infinity;
      if (!(age >= GUARD_TAKEOVER_MS) || (appQuietFor < GUARD_APP_ALIVE_MS && age < GUARD_HARD_CAP_MS)) return notYet();
      console.log(`[captureText] safety copy ${guardBase}: the app never finished it (${Math.round(age / 1000)} s), making it here`);
      await traces.create({ step: "captureGuardTook", detail: JSON.stringify({ id: guardBase, after_s: Math.round(age / 1000) }), user_email: user.email }).catch(() => {});
    }

    // What kind of thing is it? Asked once, on the WHOLE capture, before any
    // splitting — exactly where the in-app Add button asks it. An idea is not
    // an errand and must never be chopped into several; the splitter is for
    // errands only.
    const today = localToday(tz);
    const sortOpts = { today, aboutMe: user.about_me || "" };
    const category = await classifyCapture(base44, raw, sortOpts);
    console.log(`[captureText] ${category.category}: ${category.why || ""}`);
    // How it was sorted, sent back with the answer so a misfiled capture can
    // be traced (the phone ignores it). No content beyond the kind and reason.
    const sorted: { whole: string; why: string; fields: string[]; pieces: { kind: string; why: string }[] } = {
      whole: category.category,
      why: String(category.why || ""),
      fields: Object.keys(category || {}),
      pieces: [],
    };

    // An idea, or something meant for ADHDone itself: kept in the Parking Lot
    // (feedback too, so it is never lost), and for feedback the app offers to
    // send it to the developer the next time it opens.
    if (category.category === "parking_lot" || category.category === "app_feedback") {
      const feedback = category.category === "app_feedback";
      const ideas = await createParkingLotIdeas(base44, feedback ? { is_list: false } : category, raw, capture_id, !feedback);
      if (capture_id && ideas.length) {
        const winner = await lostCaptureRace(base44, sameIds, { entity: "ParkingLotIdea", ids: ideas.map((i: any) => i.id) });
        if (winner) {
          console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
          return duplicateResponse(winner);
        }
      }
      if (feedback) await queueFeedbackPrompt(base44, raw);
      // A reading for a tracker they already have goes straight onto it, now,
      // instead of sitting in the Parking Lot as an idea until the page's own
      // look folds it in (Anna, Oct 14 2026). See foldIdeaIntoTrackers.
      const fold = !feedback && ideas.length === 1 ? await foldIdeaIntoTrackers(base44, ideas[0]) : null;
      console.log(`[captureText] ${ideas.length} parking lot idea(s) from ${raw.length} chars${fold?.folded ? " — logged to a tracker" : ""}`);
      return Response.json({
        success: true,
        duplicate: false,
        kind: "idea",
        count: ideas.length,
        tasks: ideas,
        ideas,
        ...(fold?.folded ? { logged: fold.logged } : {}),
      });
    }

    // Someone's birthday: the yearly birthday record, not a one-off task. With
    // no usable day it carries on below as a task instead of being lost.
    if (category.category === "birthday") {
      const birthday = await createBirthdayTask(base44, category, raw, { email: user.email, tz, captureId: capture_id });
      if (birthday) {
        if (capture_id) {
          const winner = await lostCaptureRace(base44, sameIds, { entity: "Task", ids: [birthday.id] });
          if (winner) {
            console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
            return duplicateResponse(winner);
          }
        }
        return Response.json({
          success: true,
          duplicate: false,
          kind: "task",
          count: 1,
          tasks: [{ id: birthday.id, title: birthday.title }],
        });
      }
    }

    // Tasks, or a mix of kinds. A mix comes apart into the pieces the
    // classifier found, and each piece is sorted on its own.
    let pieces: string[];
    const mixed = category.category === "mixed";
    if (mixed) {
      pieces = Array.isArray(category.parts) && category.parts.length > 1 ? category.parts : await splitCapture(base44, raw);
    } else {
      const split = await splitCapture(base44, raw);
      // When it's a single task, parse the ORIGINAL text — never the splitter's
      // echo of it. The splitter paraphrases, and a dropped word there is a
      // dropped date ("Saturday" vanished, so the task saved with no day at all).
      pieces = split;
    }
    if (pieces.length <= 1) pieces = [raw];
    const sortPieces = mixed && pieces.length > 1;
    const created: Record<string, unknown>[] = [];
    const parked: { id: string; title: string }[] = [];
    let first = true;

    // The first thing this capture saves settles who handles it when two
    // deliveries of it arrive at once.
    const claim = async (entity: string, ids: string[]) => {
      if (!capture_id || !first || !ids.length) return null;
      first = false;
      return await lostCaptureRace(base44, sameIds, { entity, ids });
    };

    for (const piece of pieces) {
      let kind: any = TASK_KIND;
      if (sortPieces) {
        kind = await classifyCapture(base44, piece, sortOpts);
        sorted.pieces.push({ kind: kind.category, why: String(kind.why || "") });
        if (kind.category === "mixed") kind = TASK_KIND;
      }

      if (kind.category === "parking_lot" || kind.category === "app_feedback") {
        const feedback = kind.category === "app_feedback";
        const ideas = await createParkingLotIdeas(base44, feedback ? { is_list: false } : kind, piece, capture_id, !feedback);
        const winner = await claim("ParkingLotIdea", ideas.map((i: any) => i.id));
        if (winner) {
          console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
          return duplicateResponse(winner);
        }
        if (feedback) await queueFeedbackPrompt(base44, piece);
        // A reading for a tracker they already have: onto it now (see above).
        if (!feedback && ideas.length === 1) await foldIdeaIntoTrackers(base44, ideas[0]);
        parked.push(...ideas);
        continue;
      }

      if (kind.category === "birthday") {
        const birthday = await createBirthdayTask(base44, kind, piece, { email: user.email, tz, captureId: capture_id });
        if (birthday) {
          const winner = await claim("Task", [birthday.id]);
          if (winner) {
            console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
            return duplicateResponse(winner);
          }
          created.push({ id: birthday.id, title: birthday.title });
          continue;
        }
      }

      // about_me goes in here too, exactly like the in-app add path — otherwise
      // a task shared from the phone gets classified for a generic person.
      // Quiet hours too: a time the model picks itself lands outside them, a
      // night one about two hours before they start
      // (runTaskParse.keepPickedTimeOutOfQuietHours, RULES.md §9 Q4).
      const parsed = await runTaskParse(base44, buildTaskParsePrompt(piece, tz, saidAt), tz, user.about_me, saidAt,
        resolveQuietHours(user));
      if (!parsed?.title) continue;

      // original_input keeps the user's verbatim words (the whole shared text
      // when it was one thing, that portion when it was split) so a bad parse
      // can always be audited against what they actually sent.
      const record = buildTaskRecord(parsed, {
        rawText: pieces.length > 1 ? piece : raw,
        email: user.email,
        tz,
      });
      if (capture_id) record.capture_id = capture_id;

      // Created as the USER, not the service role: Task RLS keys off created_by,
      // so a service-role insert saves a record the user can never see.
      const task = await base44.entities.Task.create(record);

      // First thing saved from this capture: make sure no parallel delivery
      // beat us to it before any reminders get scheduled.
      const winner = await claim("Task", [task.id]);
      if (winner) {
        console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
        return duplicateResponse(winner);
      }

      // Reminder failures must not lose the task — the record is already safe,
      // and the refill cron picks up anything left without notifications.
      // Only an event gets a plan; any other task gets one reminder at its own
      // time, or none (captureToTasks.scheduleTaskReminders, Oct 12 2026).
      let reminderResult: unknown = null;
      try {
        reminderResult = await scheduleTaskReminders(base44, task, parsed, user.email, tz);
      } catch (e) {
        reminderResult = { error: e?.message, body: e?.response?.data };
        console.error("[captureText] reminder scheduling failed:", e.message);
      }

      created.push({ id: task.id, title: task.title, reminders: reminderResult });
    }

    if (!created.length && parked.length) {
      console.log(`[captureText] ${parked.length} parking lot idea(s) from ${raw.length} chars`);
      return Response.json({ success: true, duplicate: false, kind: "idea", count: parked.length, tasks: parked, ideas: parked, sorted });
    }

    console.log(`[captureText] ${created.length} task(s) from ${raw.length} chars`);
    // kind/count let the phone show an honest confirmation without inspecting
    // the array itself. kind is "task" here and "idea" on the parking lot
    // branch above; `tasks` is populated either way so an older phone build
    // that only reads the array still shows the right count.
    return Response.json({
      success: true,
      duplicate: false,
      kind: "task",
      count: created.length + parked.length,
      tasks: created,
      ...(parked.length ? { ideas: parked } : {}),
      sorted,
    });
  } catch (error) {
    console.error("[captureText] error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
// Redeployed Nov 4 2026: shared/reminderTitle.ts lets the iPhone app ring (phoneCanRing).

// Redeployed Nov 5 2026: the parser now judges goes_somewhere (shared/runTaskParse.ts).

// Re-saved Nov 12 2026: shared/reminderTitle.ts (the alarm of their own young child's birthday has no "Write a text" button; birthday_no_text).

// Nov 13 2026: the app's safety copy (a task whose app stopped mid-way is made here a minute later), and a part of a capture counts as made once the whole was.
