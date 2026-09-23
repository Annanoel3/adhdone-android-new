// The single endpoint the NATIVE share sheet / quick-capture calls.
//
// POST { text, timezone? }  →  { success, tasks: [{ id, title }] }
//
// Native does nothing but hand over the raw text: this parses it, splits it if
// it holds several separate errands, creates the Task records, and schedules
// the reminder pushes — all server-side, so the app never has to open and the
// save is silent and instant. (Last redeployed so the toll answer from Places
// reaches the drive-time reminder, bundled from the shared files below.)

import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { runTaskParse } from "../../shared/runTaskParse.ts";
import { buildTaskParsePrompt } from "../../shared/taskParsePrompt.ts";
// Shared files are bundled into this function when it is deployed, so a change
// to the shared prompt (taskParsePrompt.ts) only reaches users after this
// function is saved and redeployed again.
import {
  splitCapture,
  buildTaskRecord,
  scheduleTaskReminders,
  classifyCapture,
  createParkingLotIdeas,
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
    const { text, timezone, capture_id } = await req.json();
    // The platform occasionally rejects a perfectly good call outright
    // ("Admin permissions required") and then accepts the identical one a
    // moment later. That turned into a 500 the phone had to back off from
    // for ten seconds or more; a couple of quick retries here absorb it.
    const user = await retryBrief(() => base44.auth.me());
    if (!user?.email) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
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

    // Task or idea? Asked once, on the WHOLE capture, before any splitting —
    // exactly where the in-app Add button asks it. An idea is not an errand and
    // must never be chopped into several; the splitter is for errands only.
    const category = await classifyCapture(base44, raw);
    if (category.category === "parking_lot") {
      const ideas = await createParkingLotIdeas(base44, category, raw, capture_id);
      if (capture_id && ideas.length) {
        const winner = await lostCaptureRace(base44, capture_id, { entity: "ParkingLotIdea", ids: ideas.map((i: any) => i.id) });
        if (winner) {
          console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
          return duplicateResponse(winner);
        }
      }
      console.log(`[captureText] ${ideas.length} parking lot idea(s) from ${raw.length} chars`);
      return Response.json({
        success: true,
        duplicate: false,
        kind: "idea",
        count: ideas.length,
        tasks: ideas,
        ideas,
      });
    }

    const split = await splitCapture(base44, raw);
    // When it's a single task, parse the ORIGINAL text — never the splitter's
    // echo of it. The splitter paraphrases, and a dropped word there is a
    // dropped date ("Saturday" vanished, so the task saved with no day at all).
    const pieces = split.length > 1 ? split : [raw];
    const created: Record<string, unknown>[] = [];

    for (const piece of pieces) {
      // about_me goes in here too, exactly like the in-app add path — otherwise
      // a task shared from the phone gets classified for a generic person.
      const parsed = await runTaskParse(base44, buildTaskParsePrompt(piece, tz), tz, user.about_me);
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

      // First task of this capture: make sure no parallel delivery beat us to
      // it before any reminders get scheduled.
      if (capture_id && created.length === 0) {
        const winner = await lostCaptureRace(base44, capture_id, { entity: "Task", ids: [task.id] });
        if (winner) {
          console.log(`[captureText] ${capture_id} already handled by a parallel delivery; removed this copy`);
          return duplicateResponse(winner);
        }
      }

      // Reminder failures must not lose the task — the record is already safe,
      // and the refill cron picks up anything left without notifications.
      let reminderResult: unknown = null;
      try {
        reminderResult = await scheduleTaskReminders(base44, task, parsed, user.email, tz);
      } catch (e) {
        reminderResult = { error: e?.message, body: e?.response?.data };
        console.error("[captureText] reminder scheduling failed:", e.message);
      }

      created.push({ id: task.id, title: task.title, reminders: reminderResult });
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
      count: created.length,
      tasks: created,
    });
  } catch (error) {
    console.error("[captureText] error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});