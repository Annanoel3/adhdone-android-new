// The single endpoint the NATIVE share sheet / quick-capture calls.
//
// POST { text, timezone? }  →  { success, tasks: [{ id, title }] }
//
// Native does nothing but hand over the raw text: this parses it, splits it if
// it holds several separate errands, creates the Task records, and schedules
// the reminder pushes — all server-side, so the app never has to open and the
// save is silent and instant.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.46";
import { runTaskParse } from "../../shared/runTaskParse.ts";
import { buildTaskParsePrompt } from "../../shared/taskParsePrompt.ts";
import {
  splitCapture,
  buildTaskRecord,
  scheduleTaskReminders,
} from "../../shared/captureToTasks.ts";

Deno.serve(async (req) => {
  try {
    const base44 = await createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { text, timezone } = await req.json();
    if (!text || !String(text).trim()) {
      return Response.json({ success: false, error: "text is required" }, { status: 400 });
    }

    const raw = String(text).trim();
    const tz = timezone || user.timezone || "America/Chicago";

    const split = await splitCapture(base44, raw);
    // When it's a single task, parse the ORIGINAL text — never the splitter's
    // echo of it. The splitter paraphrases, and a dropped word there is a
    // dropped date ("Saturday" vanished, so the task saved with no day at all).
    const pieces = split.length > 1 ? split : [raw];
    const created: Record<string, unknown>[] = [];

    for (const piece of pieces) {
      const parsed = await runTaskParse(base44, buildTaskParsePrompt(piece));
      if (!parsed?.title) continue;

      // original_input keeps the user's verbatim words (the whole shared text
      // when it was one thing, that portion when it was split) so a bad parse
      // can always be audited against what they actually sent.
      const record = buildTaskRecord(parsed, {
        rawText: pieces.length > 1 ? piece : raw,
        email: user.email,
        tz,
      });

      // Created as the USER, not the service role: Task RLS keys off created_by,
      // so a service-role insert saves a record the user can never see.
      const task = await base44.entities.Task.create(record);

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
    return Response.json({ success: true, tasks: created });
  } catch (error) {
    console.error("[captureText] error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});