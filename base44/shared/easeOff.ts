// Easing off a task that keeps getting put off (Anna, Oct 22 2026).
//
// Sally's chore rang every day for days and she pushed it away every time
// (Later, Home, Back, Later). Ringing the same way again isn't working, and it
// pushes people out of the app. Her rules:
//  - Put off = Later, any snooze, swiped away or closed (Home, Back, X), or it
//    rang out unanswered. Later counts the same as dismissing it: "its easy to
//    press any of those buttons just to get rid of the alarm". Stopping it
//    without a snooze (the alarm's Open button) is reported as a dismissal and
//    counts too. Only Done doesn't.
//  - Put off on 3 DIFFERENT DAYS without being done, the task moves to an
//    eased plan. Same-day repeats are already handled by the "not now" breaks.
//  - Which plan is the model's judgment, from context like every decision in
//    the app: what they typed, what the task is, its priority, whether it needs
//    doing today, whether someone else relies on it.
//      'daily_alarm'       it matters (high priority, needs doing today,
//                          someone relies on it): stays in the morning summary
//                          and gets one alarm a day, with only Done and Later.
//      'alarm_then_notice' an ordinary task ("go to grocery store"): the same,
//                          until that one alarm is put off on 2 more days, then
//                          one regular notification a day (level 2).
//      'digest'            low stakes: only the morning summary.
//  - Editing the task (its wording, priority or date) puts it back on normal
//    reminders: that's new information (onTaskUpdate clears both fields).
// Normal alarms keep every button; only the eased alarm is Done + Later.
//
// The days are the owner's own dates (YYYY-MM-DD) in their time zone.

import OpenAI from 'npm:openai';

export const PUT_OFF_CHOICES = ['later', 'snooze', 'dismiss', 'closed', 'ignored'];
export const EASE_AFTER_DAYS = 3;
export const NOTICE_AFTER_DAYS = 2;
export type EasePlanName = 'digest' | 'daily_alarm' | 'alarm_then_notice';
const PLANS: EasePlanName[] = ['digest', 'daily_alarm', 'alarm_then_notice'];

export function easeDay(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

// The day this put-off happened, added to the task's list. {} when that day is
// already on it (several put-offs in one day count once).
export function putOffFields(task: any, atMs: number, timeZone: string): any {
  const day = easeDay(atMs, timeZone);
  const days: string[] = Array.isArray(task?.put_off_days) ? task.put_off_days.filter((d: any) => typeof d === 'string') : [];
  if (days.includes(day)) return {};
  return { put_off_days: [...days, day].sort().slice(-30) };
}

// What a task's eased plan means right now, for Smart Reminders and the
// morning summary. null = normal reminders.
export function easeNow(task: any): { plan: EasePlanName; level: number; nudge: 'none' | 'alarm' | 'notice' } | null {
  const e = task?.ease_plan;
  if (!e || !PLANS.includes(e.plan)) return null;
  const level = Number(e.level) || 1;
  if (e.plan === 'digest') return { plan: e.plan, level, nudge: 'none' };
  if (e.plan === 'alarm_then_notice' && level >= 2) return { plan: e.plan, level, nudge: 'notice' };
  return { plan: e.plan, level, nudge: 'alarm' };
}

// After a put-off was recorded (task already carries the new put_off_days):
// the fields that move it onto the eased plan, or along it. {} = no change.
export async function easeStep(task: any, owner: any, nowMs: number): Promise<any> {
  if (!task || task.status !== 'active') return {};
  // Birthdays and events have their own reminders, not Smart Reminders.
  if (task.classification === 'event' || task.classification === 'birthday' || task.birthday_person) return {};
  const days: string[] = Array.isArray(task.put_off_days) ? [...task.put_off_days].sort() : [];
  const ease = task.ease_plan;
  if (!ease || !PLANS.includes(ease.plan)) {
    if (days.length < EASE_AFTER_DAYS) return {};
    const judged = await judgeEasePlan(task, owner, days.length);
    // No answer this time (the model timed out): the next put-off asks again.
    if (!judged) return {};
    return {
      ease_plan: { plan: judged.plan, level: 1, why: judged.why, since: days[days.length - 1], at: new Date(nowMs).toISOString() },
    };
  }
  if (ease.plan === 'alarm_then_notice' && (Number(ease.level) || 1) < 2) {
    const after = days.filter((d) => d > String(ease.since || ''));
    if (after.length >= NOTICE_AFTER_DAYS) {
      return { ease_plan: { ...ease, level: 2, notice_since: after[after.length - 1] } };
    }
  }
  return {};
}

export function easePrompt(): string {
  return `You help ADHDone, a to-do app for people with ADHD, decide how to keep reminding someone about a task they keep putting off.

This task's reminders were put off on several different days (they tapped Later, snoozed it, swiped it away, or let the alarm ring out) and it still isn't done. Ringing it the same way every day isn't working, and it drives people away from the app, so it moves to a lighter plan. Choose the plan the way a good personal assistant would: from what they actually typed, what the task is, its priority, its date, and who else it affects. Use judgment, not keywords.

- "daily_alarm": it really matters. It's high priority, it sounds like it has to be done today or very soon, or someone else is counting on them (a kid to pick up, a bill or payment, a call or message someone is waiting on, a client, a pet or person who needs care, medication). It stays in their morning summary and still gets one alarm a day.
- "alarm_then_notice": an ordinary task that still needs doing at some point, like going to the grocery store or doing laundry. It stays in their morning summary and gets one alarm later in the day; if they keep putting that off too, it becomes one regular notification a day.
- "digest": it doesn't sound like it matters much right now: low stakes, a nice-to-have, a someday idea. It only appears in their morning summary.

Priority the app assigned can be wrong; weigh what they typed over it. When it's truly unclear between two plans, pick the one that keeps them more informed.

Answer with JSON only: {"plan": "daily_alarm" | "alarm_then_notice" | "digest", "why": "one short plain sentence"}`;
}

export function easeFacts(task: any, owner: any, dayCount: number): string {
  const lines: string[] = [];
  const said = String(task.original_input || '').trim();
  if (said) lines.push(`What they typed or said: "${said.slice(0, 500)}"`);
  lines.push(`Task title: "${String(task.title || '').slice(0, 200)}"`);
  if (task.urgency) lines.push(`Priority the app gave it: ${task.urgency}`);
  if (task.due_date) lines.push(`Date: ${String(task.due_date).slice(0, 10)}${task.deadline_style === 'by' ? ' (a deadline: "by" then)' : ''}`);
  else lines.push('Date: none');
  const notes = [task.description, task.notes].map((s) => String(s || '').trim()).filter(Boolean).join(' / ');
  if (notes) lines.push(`Their notes on it: "${notes.slice(0, 400)}"`);
  const tag = Array.isArray(task.tag) ? task.tag.join(', ') : String(task.tag || '').trim();
  if (tag) lines.push(`Tag: ${tag.slice(0, 120)}`);
  lines.push(`Put off on ${dayCount} different days, still not done.`);
  const about = String(owner?.about_me || '').trim();
  if (about) lines.push(`What they told the app about their life: "${about.slice(0, 400)}"`);
  return lines.join('\n');
}

export async function judgeEasePlan(task: any, owner: any, dayCount: number, timeoutMs = 25000): Promise<{ plan: EasePlanName; why: string } | null> {
  try {
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const ask = openai.chat.completions.create({
      model: 'gpt-6-astra',
      messages: [
        { role: 'system', content: easePrompt() },
        { role: 'user', content: easeFacts(task, owner, dayCount) },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
    });
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const res: any = await Promise.race([ask, late]);
    if (!res) return null;
    const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const plan = String(parsed?.plan || '') as EasePlanName;
    if (!PLANS.includes(plan)) return null;
    return { plan, why: String(parsed?.why || '').slice(0, 300) };
  } catch (e) {
    console.error('[easeOff] plan judgment failed:', (e as any)?.message || e);
    return null;
  }
}
