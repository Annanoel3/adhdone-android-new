// "Actually used the app", not just opened it (Anna, Nov 9 2026: "People who
// actually used the app!!! Not just opened get the 'how did today go'").
// Between two moments (no end: up to now), the person did one of these:
// finished a task (any way, Done on an alarm included: logTaskCompletion logs
// every one as AppEvent task_completed), added one (the app's add-task
// pipeline logs task_created; a capture, in the app or from outside it,
// carries a capture_id), saved a Parking Lot idea, recorded notes, ran the
// focus timer, or saved a win or a mood.
//
// Read by the evening push (cronDailyDigest: who gets "How did today go?")
// and the owner alerts (cronRefillReminders check 17: a come-back-style push
// to someone who used the app that day). When a lookup can't run, the answer
// is `onError`, which each caller picks so a failure never leads to the wrong
// push or a false alert.
export async function usedAppBetween(
  base44: any,
  email: string,
  sinceISO: string,
  untilISO: string | null,
  onError: boolean,
): Promise<boolean> {
  const svc = base44.asServiceRole.entities;
  const when = untilISO ? { $gte: sinceISO, $lte: untilISO } : { $gte: sinceISO };
  const checks: (() => Promise<any>)[] = [
    () => svc.AppEvent.filter({ user_email: email, event: { $in: ['task_completed', 'task_created', 'pomodoro'] }, created_date: when }, '-created_date', 1),
    () => svc.Task.filter({ created_by: email, capture_id: { $ne: null }, created_date: when }, '-created_date', 1),
    () => svc.ParkingLotIdea.filter({ created_by: email, created_date: when }, '-created_date', 1),
    () => svc.EnergyLog.filter({ created_by: email, kind: 'note_recording', created_date: when }, '-created_date', 1),
    () => svc.Win.filter({ created_by: email, created_date: when }, '-created_date', 1),
    () => svc.DayMood.filter({ created_by: email, created_date: when }, '-created_date', 1),
  ];
  for (const check of checks) {
    try {
      const rows = await check();
      if (Array.isArray(rows) && rows.length > 0) return true;
    } catch (e) {
      console.error(`[usedApp] check failed for ${email}:`, (e as any)?.message || e);
      return onError;
    }
  }
  return false;
}
