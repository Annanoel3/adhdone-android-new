// How long a "not now" keeps one task quiet, judged from what the task is
// (Anna, Nov 16 2026).
//
// Pressing Later on a reminder, or snoozing it, gives the task a break: nothing
// about it reaches them until the break ends (cancelTaskNotifications, "Not
// now"). Until now the length came from a table by priority alone: 3 hours for
// low and medium, 2 for high, 1 for urgent, longer each time in a day. Anna:
// "Later just means, I acknowledge this needs to happen, but I'll do it later.
// So, the smart reminders will bring it back up later. (Remember, it's
// supposed to be smart, so how quick something comes back should be based on
// intelligence)", and "intelligence is not just following those minimums like
// a dumb bot": a daily routine marked medium should not wait three hours
// because of its label, a chore can.
//
// So the length is judged per task by the same model that judges everything
// else in the app, and her table becomes the LIMIT: the judged break can be
// shorter than the table, never longer ("sounds good as long as it doesn't go
// too long or overload with notifications"). Never under 20 minutes: pressing
// Later has to actually buy a break (her Later rule, Oct 20 2026). No answer in
// time, or anything wrong with it, and the table's own length is used, exactly
// as before.
//
// The break is only how long the task is left alone at the very least. When
// it ends, Smart Reminders still picks the moment (cronSmartTaskNudge), and a
// reminder at a time they set rings at that time either way.

import OpenAI from 'npm:openai';
import { lean } from './aiCost.ts';

export const BREAK_MIN_MINUTES = 20;

export function breakPrompt(): string {
  return `You help ADHDone, a to-do app for people with ADHD. Someone just said "not now" to a reminder about one task: they pressed Later, or snoozed it. Not now means "I know this needs doing, just not this minute." The task then gets a quiet stretch during which nothing about it reaches them. Decide how long that stretch should be for THIS task.

When the quiet stretch ends, the app still picks a good moment to bring the task back, so this is not the time of the next reminder. It is only how long the task must be left alone at the very least.

Judge it the way a good personal assistant would: from what the task actually is, the words they typed, its priority and its date, the time of day and how much of their day is left, and how many times they have already said not now to it today. Use judgment, not keywords. Some things should not be left long: something that has to happen today, something with a time on it, something another person or their health depends on. Most things can wait a few hours. Each further not now on the same day means the last gap was too short, so give more room than the time before.

Pressing Later has to actually buy a break: never under ${BREAK_MIN_MINUTES} minutes. Never longer than the limit you are given.

Answer with JSON only: {"minutes": <whole minutes, from ${BREAK_MIN_MINUTES} up to the limit>, "why": "<one short plain sentence>"}`;
}

function clockLabel(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function span(minutes: number): string {
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  const hrs = Math.round(minutes / 6) / 10;
  return `${hrs} hours`;
}

export interface BreakAsk {
  nowMs: number;
  timeZone: string;
  // Which "not now" this is for the task today (1 = the first).
  level: number;
  how: 'later' | 'snooze';
  // The table's own length for this priority and count: the most it may be.
  limitMinutes: number;
  // Their night, in minutes of their day; equal = no quiet hours.
  quietStartMin: number;
  quietEndMin: number;
  // Minutes of their day right now.
  localMin: number;
  // Seconds from the reminder going out to the press, when known.
  answeredSecs?: number | null;
}

export function breakFacts(task: any, owner: any, o: BreakAsk): string {
  const lines: string[] = [];
  const said = String(task?.original_input || '').trim().replace(/\s+/g, ' ');
  lines.push(`Task: "${String(task?.title || '').slice(0, 200)}"`);
  if (said && said.toLowerCase() !== String(task?.title || '').trim().toLowerCase()) lines.push(`What they typed or said when they added it: "${said.slice(0, 400)}"`);
  lines.push(`Priority the app gave it: ${task?.urgency || 'medium'}`);
  const due = task?.due_date ? String(task.due_date) : '';
  const dueMs = due ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(due) ? due : `${due}Z`) : NaN;
  if (Number.isFinite(dueMs)) {
    lines.push(due.length > 10 && !task?.day_only_task
      ? `Its time: ${task?.deadline_style === 'by' ? 'due by ' : ''}${clockLabel(dueMs, o.timeZone)}`
      : `Its date: ${task?.deadline_style === 'by' ? 'due by ' : ''}${new Intl.DateTimeFormat('en-US', { timeZone: o.timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(dueMs))}`);
  } else {
    lines.push('Its date: none');
  }
  if (task?.recurrence_pattern && task.recurrence_pattern !== 'none') lines.push(`It repeats: ${String(task.recurrence_pattern).replace(/_/g, ' ')}`);
  const wish = String(task?.reminder_wish || '').trim().replace(/\s+/g, ' ');
  if (wish && !/^asap, no due date: start now$/i.test(wish)) lines.push(`How they asked to be reminded of it: "${wish.slice(0, 200)}"`);
  const tag = Array.isArray(task?.tag) ? task.tag.join(', ') : String(task?.tag || '').trim();
  if (tag) lines.push(`Their tag on it: "${tag.slice(0, 80)}"`);
  const notes = [task?.description, task?.notes].map((s: any) => String(s || '').trim()).filter(Boolean).join(' / ').replace(/\s+/g, ' ');
  if (notes) lines.push(`Their notes on it: "${notes.slice(0, 300)}"`);
  if (task?.classification === 'payment') lines.push('It is a bill or payment.');
  lines.push(`Right now for them: ${clockLabel(o.nowMs, o.timeZone)}.`);
  if (o.quietStartMin !== o.quietEndMin) {
    const left = (o.quietStartMin - o.localMin + 24 * 60) % (24 * 60);
    lines.push(`Their night starts at ${hhmm(o.quietStartMin)} (${span(left)} from now) and their morning at ${hhmm(o.quietEndMin)}.`);
  }
  lines.push(o.how === 'snooze'
    ? 'What they did: snoozed its reminder. The snooze has its own ring; this quiet stretch starts after that ring.'
    : 'What they did: pressed Later on its reminder.');
  if (o.how === 'later' && Number.isFinite(Number(o.answeredSecs)) && Number(o.answeredSecs) >= 0 && Number(o.answeredSecs) <= 60) {
    const s = Math.max(1, Math.round(Number(o.answeredSecs)));
    lines.push(`They pressed it about ${s} second${s === 1 ? '' : 's'} after the reminder came up.`);
  }
  lines.push(`This is not now number ${o.level} for this task today.`);
  lines.push(`The limit: ${Math.round(o.limitMinutes)} minutes (${span(o.limitMinutes)}).`);
  const about = String(owner?.about_me || '').trim();
  if (about) lines.push(`What they told the app about their life: "${about.slice(0, 400)}"`);
  return lines.join('\n');
}

// The judged length in minutes (BREAK_MIN_MINUTES up to the limit), or null
// when there is no usable answer in time: the caller then uses the table.
export async function judgeBreakMinutes(task: any, owner: any, o: BreakAsk, timeoutMs = 8000): Promise<{ minutes: number; why: string } | null> {
  try {
    if (!task || !Number.isFinite(o.limitMinutes) || o.limitMinutes <= BREAK_MIN_MINUTES) return null;
    const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: 'notNowBreak' });
    const ask = openai.chat.completions.create({
      // Whose call this is (Claude or OpenAI, shared/claudeAi.ts).
      ai_person: owner?.email || task?.notification_recipient_email || task?.created_by || '',
      model: 'gpt-6-astra',
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      max_completion_tokens: 1500,
      messages: [
        { role: 'system', content: breakPrompt() },
        { role: 'user', content: breakFacts(task, owner, o) },
      ],
    });
    // A late answer is dropped, not waited for.
    ask.catch(() => {});
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const res: any = await Promise.race([ask, late]);
    if (!res) return null;
    const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const raw = Number(parsed?.minutes);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const minutes = Math.min(Math.max(Math.round(raw), BREAK_MIN_MINUTES), Math.round(o.limitMinutes));
    return { minutes, why: String(parsed?.why || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
  } catch (e) {
    console.error('[notNowBreak] no judged length, the table stands:', (e as any)?.message || e);
    return null;
  }
}
