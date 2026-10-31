// Goals (ported Oct 31 2026 from Anna's Goals app, function of the same name;
// GOALS_PORT.md). Saves a new plan's steps for the goal the app just created.
//
// As in the Goals app: the steps are created with the caller's own client (so
// they belong to them), in one bulk call with a one-by-one fallback, and each
// step's due_date is the start of its week from the goal's start date
// (shared/goalPlan.ts). What changed: the Goals app then booked its own goal
// notifications (scheduleGoalNotifications); ADHDone has none — the app puts
// the current step on the task list itself (GoalStepSync). And a second call
// for the same goal (a retry after a timeout) never makes a second copy of a
// step: steps already saved, by order_index, are skipped.
//
// Body: { goal_id, steps: [...], start_order_index? } → { ok, created, total, skipped, failed }
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { stepDueDate } from '../../shared/goalPlan.ts';

const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body: any = await req.json().catch(() => ({}));
    const { goal_id, steps, start_order_index = 0 } = body || {};
    if (!goal_id || !Array.isArray(steps) || steps.length === 0) {
      return Response.json({ error: 'goal_id and steps required' }, { status: 400 });
    }

    // The caller's own goal (RLS: created_by = them).
    const goal = (await base44.entities.Goal.filter({ id: goal_id }))?.[0];
    if (!goal) return Response.json({ error: 'Goal not found' }, { status: 404 });

    const existing = await base44.entities.GoalStep.filter({ goal_id }, 'order_index', 1000).catch(() => []);
    const have = new Set((existing || []).map((s: any) => Number(s.order_index)));

    const payload = steps.map((step: any, i: number) => {
      const order = Number.isFinite(Number(step?.order_index)) ? Number(step.order_index) : (Number(start_order_index) + i);
      return {
        goal_id,
        title: String(step?.title || `Step ${i + 1}`),
        description: step?.description || '',
        phase: step?.phase || '',
        priority: PRIORITIES.has(step?.priority) ? step.priority : 'medium',
        due_date: stepDueDate(goal.start_date, step?.phase, i, step?.due_date) || null,
        order_index: order,
        status: 'pending',
        step_resources: Array.isArray(step?.step_resources) ? step.step_resources : [],
        success_criteria: Array.isArray(step?.success_criteria) ? step.success_criteria : [],
        tips_and_guidance: step?.tips_and_guidance || '',
        is_daily_habit: step?.is_daily_habit === true,
      };
    }).filter((s: any) => !have.has(s.order_index));

    const skipped = steps.length - payload.length;
    let created = 0;
    const failed: any[] = [];
    if (payload.length > 0) {
      try {
        await base44.entities.GoalStep.bulkCreate(payload);
        created = payload.length;
      } catch (bulkErr: any) {
        console.error(`[createRemainingGoalSteps] bulk create failed (${bulkErr?.message}), one by one`);
        for (const row of payload) {
          try {
            await base44.entities.GoalStep.create(row);
            created++;
          } catch (e: any) {
            failed.push({ order_index: row.order_index, error: String(e?.message || e) });
          }
        }
      }
    }
    console.log(`[createRemainingGoalSteps] goal ${goal_id}: created ${created}, already there ${skipped}, failed ${failed.length}, of ${steps.length}`);
    return Response.json({ ok: failed.length === 0, created, total: steps.length, skipped, failed: failed.length, failed_details: failed });
  } catch (error: any) {
    console.error('[createRemainingGoalSteps] failed:', error?.message);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
