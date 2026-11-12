// Calendar entries: how often a series on someone's calendar really repeats,
// and what an all-day entry is. One place, used by the calendar import
// (syncGoogleCalendar) and the hourly job (cronRefillReminders).
//
// For anyone who brings their phone calendar in (Anna, Nov 12 2026, about a
// new account whose calendar held her work shifts, days off, appointments
// with the time typed into the title and things that repeat every 2, 4 and 6
// weeks: "fix all of the issues on kimmeesnotes account and make sure it
// doesn't keep happening").

import OpenAI from 'npm:openai';
import { lean } from './aiCost.ts';

const freqOf = (rule: string): '' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' => {
  const r = String(rule || '').toUpperCase();
  return r.includes('FREQ=DAILY') ? 'DAILY'
    : r.includes('FREQ=WEEKLY') ? 'WEEKLY'
    : r.includes('FREQ=MONTHLY') ? 'MONTHLY'
    : r.includes('FREQ=YEARLY') ? 'YEARLY' : '';
};

// The number after INTERVAL= in a calendar rule: every 2 weeks, every 30
// days. 1 when the rule has none.
export function seriesEvery(rule: string): number {
  const m = /(?:^|[;:])INTERVAL=(\d+)/i.exec(String(rule || ''));
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// The step of a series as the date helpers take it.
export function seriesUnit(rule: string): 'day' | 'week' | 'month' {
  const f = freqOf(rule);
  return f === 'WEEKLY' ? 'week' : f === 'MONTHLY' ? 'month' : 'day';
}

// What the import saved until Nov 12 2026: the unit alone, with the number
// thrown away. "Every 2 weeks" became weekly and "every 30 days" became
// daily, so once the first date passed the hourly job moved the entry and its
// reminders to the next week or the next day: reminders on days the thing
// doesn't happen, and none on the day it does (Julianna's every-other-week
// appointments, reminded on the off week Nov 5 and 6 2026). Kept only so the
// entries saved that way can be told apart from ones a person set themselves.
export function oldSeriesPattern(rule: string): string {
  const f = freqOf(rule);
  return f === 'DAILY' ? 'daily' : f === 'WEEKLY' ? 'weekly' : f === 'MONTHLY' ? 'monthly' : f === 'YEARLY' ? 'yearly' : 'none';
}

// The app's own repeat for a calendar series, with the number read. A step
// the app has no repeat for (every 6 weeks, every 28 or 30 days) is 'none':
// the entry is one date, and the calendar itself supplies the next one (the
// import moves the entry and re-plans its reminders when the calendar's next
// date changes; see patchExistingTaskDates).
export function seriesPattern(rule: string): string {
  const f = freqOf(rule);
  if (!f) return 'none';
  const n = seriesEvery(rule);
  if (f === 'DAILY') return n === 1 ? 'daily' : n === 2 ? 'every_other_day' : n === 7 ? 'weekly' : n === 14 ? 'every_other_week' : 'none';
  if (f === 'WEEKLY') return n === 1 ? 'weekly' : n === 2 ? 'every_other_week' : 'none';
  if (f === 'MONTHLY') return n === 1 ? 'monthly' : n === 12 ? 'yearly' : 'none';
  return n === 1 ? 'yearly' : 'none';
}

// What an all-day calendar entry is, judged by what it means, never by words
// in its name:
//  - 'attend'  something they go to, do or must not miss: the usual reminders;
//  - 'shift'   only their work hours for that day: one heads-up the night
//              before, nothing else (the leave-for-work alert covers the day);
//  - 'none'    a day off, a public holiday, a payday, a label for the day:
//              nothing to do, so no reminder at all;
//  - 'private' personal body or health tracking: never on a lock screen.
// No answer in time, or any doubt, is 'attend' (the usual reminders).
export type DayEntryKind = 'attend' | 'shift' | 'none' | 'private';

export async function dayEntryKind(title: string, notes = '', caller = 'dayEntryKind'): Promise<DayEntryKind> {
  const name = String(title || '').trim().slice(0, 200);
  if (!name) return 'attend';
  try {
    const openai = lean(new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') }), { name: caller });
    const note = String(notes || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const ask = openai.chat.completions.create({
      model: 'gpt-6-luna',
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: "You sort all-day entries from a person's own calendar for a reminder app. Answer with JSON only." },
        { role: 'user', content: `All-day calendar entry: "${name}"${note ? `\nTheir note on it: "${note}"` : ''}

Which one is it?
- "shift": only their work hours for that day, written as times or a time range ("9-5", "2pm-10pm", "Closing shift", "Work 8-4").
- "none": there is nothing to do and nowhere to be because of it: a day off work, a public holiday or observance (even one people celebrate), a payday or other money coming in, a school-closed note, daylight saving time, a label for the day.
- "private": personal body or health tracking they would not want shown on a lock screen (a cycle or fertility tracker entry, for example).
- "attend": anything else: something they go to, do, prepare for or must not miss (an appointment, a class, a party or anniversary of their own, a trip, a deadline, a bill, a child's early dismissal, a visit). When in doubt, "attend".

Return {"kind": "shift"} or {"kind": "none"} or {"kind": "private"} or {"kind": "attend"}.` },
      ],
    });
    const late = new Promise((resolve) => setTimeout(() => resolve(null), 8000));
    const res: any = await Promise.race([ask, late]);
    if (!res) return 'attend';
    const kind = String(JSON.parse(res.choices?.[0]?.message?.content || '{}')?.kind || '').trim().toLowerCase();
    return kind === 'shift' || kind === 'none' || kind === 'private' ? kind : 'attend';
  } catch (e) {
    console.log('[calendarEntry] could not sort an all-day entry, usual reminders:', (e as any)?.message || e);
    return 'attend';
  }
}

// "10:30" from a parser's target_time, or null.
export function clockOf(v: unknown): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 ? { hh, mm } : null;
}
