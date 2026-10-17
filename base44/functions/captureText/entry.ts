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

async function lostCaptureRace(base44: any, captureId: string, mine: { entity: string; ids: string[] }) {
  for (const pause of [0, 1500]) {
    if (pause) await new Promise((r) => setTimeout(r, pause));
    const [tasks, ideas] = await Promise.all([
      base44.entities.Task.filter({ capture_id: captureId }).catch(() => []),
      base44.entities.ParkingLotIdea.filter({ capture_id: captureId }).catch(() => []),
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
    const { text, timezone, capture_id, said_at, foldIdea } = await req.json();
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

    // Idempotency: native retries after a network failure, and a lost response
    // would otherwise double-create. The same capture_id returns what the first
    // attempt already made instead of parsing and creating all over again.
    if (capture_id) {
      const existingIdeas = await retryBrief(() => base44.entities.ParkingLotIdea.filter({ capture_id }));
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
      const existing = await retryBrief(() => base44.entities.Task.filter({ capture_id }));
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
        const winner = await lostCaptureRace(base44, capture_id, { entity: "ParkingLotIdea", ids: ideas.map((i: any) => i.id) });
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
          const winner = await lostCaptureRace(base44, capture_id, { entity: "Task", ids: [birthday.id] });
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
      return await lostCaptureRace(base44, capture_id, { entity, ids });
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