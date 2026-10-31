// "Are your reminders helping?" (Anna, Oct 31 2026): the person's answer, and
// the way back from one a day.
//
// cronSmartTaskNudge asks once (ARE THEY HELPING? there) when a week of
// Later / snooze / Home-Back on Smart Reminders got next to nothing finished
// the same day. The app calls this with what they picked: the push's Yes / No
// buttons (OneSignalInit), or the in-app popup a tap on the push opens
// (RemindersHelpingPopup).
//   { mode: 'status' }               -> is the question waiting for an answer?
//   { mode: 'answer', answer: 'yes' | 'no' }
//        Yes changes nothing (not asked again for 30 days). No = one Smart
//        Reminder a day from now on (smart_nudge_one_a_day). The first answer
//        to a question counts: the same push on a second phone, or one tapped
//        days later, changes nothing and gets back what is in effect.
//   { mode: 'normal' }               -> "Back to normal" in Settings: off one a day.
// Only ever the signed-in person's own record.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { platformRequest } from '../../shared/sdkRetry.ts';

// Base44 timestamps can come back without a zone marker; they are UTC.
function utcMs(v: any): number {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

function stateOf(u: any) {
  const asked = utcMs(u?.smart_nudge_help_asked_at);
  const answered = utcMs(u?.smart_nudge_help_answered_at);
  return {
    pending: Number.isFinite(asked) && !(Number.isFinite(answered) && answered >= asked),
    answer: u?.smart_nudge_help_answer || null,
    one_a_day: u?.smart_nudge_one_a_day === true,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(platformRequest(req));
    let me: any = null;
    try { me = await base44.auth.me(); } catch { me = null; }
    if (!me?.email) return Response.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const users = await base44.asServiceRole.entities.User.filter({ email: me.email }, '-created_date', 1);
    const user = users?.[0];
    if (!user?.id) return Response.json({ success: false, error: 'Account not found' }, { status: 404 });
    const mode = String(body?.mode || 'status');
    const nowIso = new Date().toISOString();

    if (mode === 'status') return Response.json({ success: true, ...stateOf(user) });

    if (mode === 'answer') {
      const answer = body?.answer === 'yes' ? 'yes' : body?.answer === 'no' ? 'no' : '';
      if (!answer) return Response.json({ success: false, error: 'answer must be yes or no' }, { status: 400 });
      // Never asked, or already answered (another phone, an old tap): nothing changes.
      if (!stateOf(user).pending) return Response.json({ success: true, changed: false, ...stateOf(user) });
      const fields: any = { smart_nudge_help_answer: answer, smart_nudge_help_answered_at: nowIso };
      if (answer === 'no') {
        Object.assign(fields, {
          smart_nudge_one_a_day: true,
          smart_nudge_one_a_day_since: nowIso,
          // Smart Reminders looks again with one a day on its next run.
          smart_nudge_schedule_dirty: true,
          smart_nudge_dirty_at: nowIso,
        });
      }
      await base44.asServiceRole.entities.User.update(user.id, fields);
      console.log(`[remindersHelping] ${me.email} answered ${answer}`);
      return Response.json({ success: true, changed: true, ...stateOf({ ...user, ...fields }) });
    }

    if (mode === 'normal') {
      const fields: any = {
        smart_nudge_one_a_day: false,
        smart_nudge_one_a_day_since: null,
        smart_nudge_schedule_dirty: true,
        smart_nudge_dirty_at: nowIso,
      };
      // They're in the app, so a not-helping pause is over anyway.
      if (user.smart_nudge_paused_reason === 'not_helping') {
        fields.smart_nudge_paused_at = null;
        fields.smart_nudge_paused_reason = null;
      }
      await base44.asServiceRole.entities.User.update(user.id, fields);
      console.log(`[remindersHelping] ${me.email} went back to normal Smart Reminders`);
      return Response.json({ success: true, changed: true, ...stateOf({ ...user, ...fields }) });
    }

    return Response.json({ success: false, error: 'unknown mode' }, { status: 400 });
  } catch (e) {
    console.error('[remindersHelping] Error:', e);
    return Response.json({ success: false, error: String((e as any)?.message || e) }, { status: 500 });
  }
});
