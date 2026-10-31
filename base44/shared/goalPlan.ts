// Goals (ported from Anna's Goals app, Oct 31 2026; GOALS_PORT.md): the one
// rule for a plan step's due_date, shared by goalPlannerChat (apply_edit) and
// createRemainingGoalSteps so a new plan and an edited plan are dated the same.
//
// As in the Goals app's createRemainingGoalSteps: a step's due_date is the day
// its WEEK STARTS, aligned to calendar weeks from the goal's start date.
// Week 1 = the start date itself (a short first week that ends that Sunday);
// Week 2 = the Monday of the next calendar week; Week N = that Monday + (N-2)
// weeks. The cumulative week comes from the phase ("Month 2, Week 3" = week 7);
// with no readable phase, the step's place in the list is used (i + 1).
// No start date: the date the plan itself gave (or none).
export function stepDueDate(startDate: string | null | undefined, phase: string | null | undefined, i: number, fallback?: string | null): string {
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const m = String(phase || '').match(/Month\s*(\d+)[,\s]+Week\s*(\d+)/i);
    const weekNum = m ? (parseInt(m[1], 10) - 1) * 4 + parseInt(m[2], 10) : (i + 1);
    const d = new Date(startDate + 'T00:00:00Z');
    if (weekNum > 1) {
      const dow = d.getUTCDay();                          // 0=Sun .. 6=Sat
      const daysToFirstMonday = ((1 - dow + 7) % 7) || 7; // start → next calendar week's Monday
      d.setUTCDate(d.getUTCDate() + daysToFirstMonday + (weekNum - 2) * 7);
    }
    return d.toISOString().split('T')[0];
  }
  return fallback || '';
}
