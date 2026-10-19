// Do this person's quiet hours cover the hours they sleep?
//
// Anna, Oct 18 2026: "If someone says they work the night shift, prompt them to
// make new quiet hours." Michelle wrote "i work night shift" and works 10:30 PM
// to 7 AM five days a week, but kept the default quiet hours (10 PM to 8 AM):
// the app stayed silent through her shift and rang her alarms in the
// afternoon, when she was most likely asleep (the last ones went unanswered
// between 1:41 and 3:40 PM).
//
// Asked by the quiet-hours popup (QuietHoursReviewPrompt) on app open, and only
// when something it judges from has changed since its last answer: what they
// told the app about themselves, their quiet hours and their work hours. The
// model judges, no word lists, on gpt-6-astra like every judgment in the app.
// The answer is kept on the profile as quiet_hours_fit.
//
// { previewEmail } from the owner's account (Test Function) judges that person
// fresh and saves nothing.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';
import { secrets } from 'base44:runtime';

// The same as fitKey in src/components/shared/QuickCapturePrompt.jsx: change
// both together.
function fitKey(u: any): string {
  return JSON.stringify([
    String(u?.about_me || '').trim(),
    u?.quiet_hours_enabled !== false,
    u?.quiet_hours_start || '22:00',
    u?.quiet_hours_end || '08:00',
    u?.work_schedule_mode || 'fixed',
    (Array.isArray(u?.work_fixed_days) ? u.work_fixed_days : [])
      .map((d: any) => [Number(d?.day), d?.arrive_by || '', d?.ends_at || '']),
  ]);
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isHhmm = (s: any) => /^\d{1,2}:\d{2}$/.test(String(s || ''));
const clock = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// Their work hours in words: the same days every week, or the dated shifts
// coming up (WorkShift) when their schedule varies.
async function workLines(base44: any, u: any): Promise<string[]> {
  if ((u?.work_schedule_mode || 'fixed') === 'varies') {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await base44.asServiceRole.entities.WorkShift
      .filter({ created_by: u.email, shift_date: { $gte: today } }, 'shift_date', 14)
      .catch(() => []);
    return (rows || [])
      .filter((r: any) => isHhmm(r?.arrive_by))
      .map((r: any) => `${r.shift_date}: ${clock(r.arrive_by)}${isHhmm(r.ends_at) ? ` to ${clock(r.ends_at)}` : ''}`);
  }
  return (Array.isArray(u?.work_fixed_days) ? u.work_fixed_days : [])
    .filter((d: any) => isHhmm(d?.arrive_by))
    .map((d: any) => `${DAYS[Number(d.day)] || 'A day'}: ${clock(d.arrive_by)}${isHhmm(d.ends_at) ? ` to ${clock(d.ends_at)}` : ''}`);
}

async function judge(aboutMe: string, quietLine: string, work: string[]) {
  const prompt = `ADHDone is a reminder app for people with ADHD. Its quiet hours are the hours it stays silent: no reminders and no alarms. Outside them its reminders can come at any time, and for many people they ring as full-screen alarms.

This person's quiet hours: ${quietLine}
What they told the app about themselves, in their own words: ${aboutMe ? `"${aboutMe}"` : 'nothing'}
Their work hours: ${work.length ? `\n${work.map((l) => `- ${l}`).join('\n')}` : 'none saved'}

Do these quiet hours fit the hours this person most likely sleeps? Judge it the way a thoughtful person would, from what they said and their work hours together. Someone who works nights or overnight shifts, or who otherwise sleeps during the day, usually doesn't fit quiet hours of 10 PM to 8 AM: the app then stays silent while they're awake and rings while they sleep. An ordinary daytime schedule fits. When nothing they said or saved tells you anything about when they work or sleep, it fits: never guess at a problem.

If it doesn't fit, and what they said or their work hours make their sleep reasonably clear (for example, the stretch after a night shift ends), suggest quiet hours that would cover it. Otherwise leave the suggestion empty.

Answer in JSON only: {"fits": true or false, "suggest_start": "HH:MM" in 24-hour time or null, "suggest_end": "HH:MM" or null}`;

  const openai = new OpenAI({ apiKey: secrets.get('OPENAI_API_KEY') });
  const completion = await openai.chat.completions.create({
    model: 'gpt-6-astra',
    messages: [
      { role: 'system', content: 'You help a reminder app respect when its users sleep. Always respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    reasoning_effort: 'low',
    max_completion_tokens: 3000,
  });
  const out = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
  const fits = out?.fits !== false;
  const start = isHhmm(out?.suggest_start) ? String(out.suggest_start).padStart(5, '0') : null;
  const end = isHhmm(out?.suggest_end) ? String(out.suggest_end).padStart(5, '0') : null;
  const both = !fits && start && end && start !== end;
  return { fits, start: both ? start : null, end: both ? end : null };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body: any = await req.json().catch(() => ({}));

    const previewEmail = me.role === 'admin' && typeof body?.previewEmail === 'string' ? body.previewEmail.trim() : '';
    const user = previewEmail
      ? (await base44.asServiceRole.entities.User.filter({ email: previewEmail }))?.[0]
      : me;
    if (!user) return Response.json({ error: 'No such account' }, { status: 404 });

    const key = fitKey(user);
    const prev = user.quiet_hours_fit;
    if (!previewEmail && prev && prev.key === key && typeof prev.fits === 'boolean') return Response.json(prev);

    const aboutMe = String(user.about_me || '').trim();
    const work = await workLines(base44, user);
    const quietLine = user.quiet_hours_enabled === false
      ? 'turned off, so reminders can come at any hour'
      : `${clock(isHhmm(user.quiet_hours_start) ? user.quiet_hours_start : '22:00')} to ${clock(isHhmm(user.quiet_hours_end) ? user.quiet_hours_end : '08:00')}`;
    const verdict = !aboutMe && work.length === 0
      ? { fits: true, start: null, end: null }
      : await judge(aboutMe, quietLine, work);

    const fit = {
      key,
      fits: verdict.fits,
      start: verdict.start,
      end: verdict.end,
      at: new Date().toISOString(),
      // The key they last answered the popup for (QuietHoursReviewPrompt).
      answered_key: prev?.answered_key || null,
    };
    if (!previewEmail) await base44.asServiceRole.entities.User.update(user.id, { quiet_hours_fit: fit });
    return Response.json(previewEmail ? { ...fit, quietLine, aboutMe, work } : fit);
  } catch (error) {
    console.error('[checkQuietHoursFit] Error:', error);
    return Response.json({ error: String((error as any)?.message || error) }, { status: 500 });
  }
}
