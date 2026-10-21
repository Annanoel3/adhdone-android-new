// Which alarm rings first when two or more alarms at times they set fall in
// the same minute.
//
// The phone shows one alarm at a time: the first rings, the next one rings the
// moment the first is answered. Which went first used to be chance. Anna, Oct
// 21 2026: her 10 AM call ("Call (210) 621-7099 at 10:00 tomorrow") and "Set
// watch to record continuously" were both at 10:00, and the watch rang first:
// "They both said 10 am... but which one sounds more important..... a
// scheduled phone call involving another persons time or a watch setting".
//
// So when a task with a time they set is made or changed, any minute its
// alarms share with another of their alarms at a time they set is put in
// order by the model (gpt-6-astra: it judges for them), once per set of tasks.
// Each task keeps its place by clock time (Task.alarm_order, "HH:MM" in their
// time zone → { rank, with, why }), and every alarm list (phoneAlarmsFor here,
// alarmSetFor in the app) has each one after the first ring a few seconds
// later (reminderTitle.ORDER_STEP_MS), so the one that matters rings on the
// minute and the rest follow it the moment it's answered. Nothing is moved
// otherwise: every one still rings within its minute unless the first is left
// ringing.
import OpenAI from 'npm:openai';
import { phoneAlarmsFor, pushPhoneAlarms, clockKey } from './reminderTitle.ts';
import { DEFAULT_TIME_ZONE } from './quietHours.ts';

const MODEL = 'gpt-6-astra';
const MAX_GROUPS = 10;

// The minutes (ms, on the minute) this task rings at a time they set. An
// alarm's id keeps its own time, before any wait for its place in line.
function setTimeMinutes(task: any, owner: any, nowMs: number): number[] {
  const out = new Set<number>();
  for (const a of phoneAlarmsFor(task, owner, nowMs)) {
    if (!a?.theirTime) continue;
    const ms = Number(String(a.id || '').split(':').pop());
    if (Number.isFinite(ms)) out.add(Math.floor(ms / 60000) * 60000);
  }
  return Array.from(out);
}

type Item = { key: string; task: any };

export function alarmOrderPrompt(groups: { id: string; when: string; items: Item[] }[]): string {
  const show = (t: any) => {
    const title = String(t?.title || '').trim();
    const bits = [`"${title.slice(0, 120)}"`];
    const said = String(t?.original_input || '').trim().replace(/\s+/g, ' ');
    if (said && said.toLowerCase() !== title.toLowerCase()) bits.push(`they said: "${said.slice(0, 200)}"`);
    if (t?.classification === 'event') bits.push('an event');
    if (t?.location) bits.push(`at ${String(t.location).slice(0, 80)}`);
    if (t?.urgency) bits.push(`priority ${t.urgency}`);
    const notes = [t?.description, t?.notes].map((x: any) => String(x || '').trim()).filter(Boolean).join(' / ').replace(/\s+/g, ' ');
    if (notes) bits.push(`notes: ${notes.slice(0, 160)}`);
    return bits.join(', ');
  };
  return `A reminder app for people with ADHD has several of one person's alarms set for the very same minute, each at a time they chose themselves. The phone can show only one alarm at a time: the first rings right on time, and each next one rings the moment the one before it is answered (seconds later, at most a minute). Put each group in the order they should ring.

First goes the one it would cost them most to be late for or to miss at that minute: one where someone else is waiting on them or their time (a call, a meeting, an appointment, picking someone up), one that only works at that exact moment, or one with real consequences if it slips. Later go the ones that work just as well a minute later. Judge by what each one actually is and what is at stake, not by how it is worded.

${groups.map((g) => `Group ${g.id} (${g.when}):\n${g.items.map((i) => `- ${i.key}: ${show(i.task)}`).join('\n')}`).join('\n\n')}

Answer with JSON only: {"groups": [{"id": "<the group's id>", "order": ["<every key in the group, the one to ring first first>"], "why": "<one short plain sentence a person would understand>"}]}`;
}

// The model's order for each group, by group id. A group whose answer isn't a
// full order of its own keys is left out (it stays as it was).
export async function judgeAlarmOrder(
  groups: { id: string; when: string; items: Item[] }[],
  timeoutMs = 25000,
): Promise<Record<string, { order: string[]; why: string }>> {
  const out: Record<string, { order: string[]; why: string }> = {};
  const list = (groups || []).filter((g) => g?.id && Array.isArray(g.items) && g.items.length > 1).slice(0, MAX_GROUPS);
  if (!list.length) return out;
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  const ask = openai.chat.completions.create({
    model: MODEL,
    reasoning_effort: 'low',
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: alarmOrderPrompt(list) }],
  });
  ask.catch(() => {});
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const res: any = await Promise.race([ask, late]);
  if (!res) {
    console.error('[alarmOrder] no answer in time');
    return out;
  }
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  for (const g of Array.isArray(parsed?.groups) ? parsed.groups : []) {
    const id = String(g?.id ?? '').replace(/^group\s*/i, '').trim();
    const mine = list.find((x) => x.id === id);
    if (!mine) continue;
    const keys = mine.items.map((i) => i.key);
    const order = (Array.isArray(g?.order) ? g.order : []).map((k: any) => String(k).trim());
    if (order.length !== keys.length || new Set(order).size !== keys.length || !order.every((k: string) => keys.includes(k))) continue;
    out[id] = { order, why: String(g?.why || '').slice(0, 160) };
  }
  if (!Object.keys(out).length) console.error('[alarmOrder] no usable answer:', JSON.stringify(parsed).slice(0, 400));
  return out;
}

// After a task is made or changed: puts in order every minute its alarms at a
// time they set share with another of the owner's, keeps each task's place,
// and sends the phone the new alarm list of any OTHER task whose place
// changed. Returns this task as it now is (its own list is sent by the caller).
export async function orderSameMinuteAlarms(
  base44: any,
  task: any,
  owner: any,
  nowMs: number = Date.now(),
  judge: typeof judgeAlarmOrder = judgeAlarmOrder,
): Promise<any> {
  if (!task?.id || !owner || task.status !== 'active') return task;
  const timeZone = owner.timezone || DEFAULT_TIME_ZONE;
  const svc = base44.asServiceRole.entities;
  const mine = setTimeMinutes(task, owner, nowMs);
  const hadOrder = task.alarm_order && typeof task.alarm_order === 'object' && Object.keys(task.alarm_order).length > 0;
  if (!mine.length && !hadOrder) return task;

  let others: any[] = [];
  if (mine.length) {
    const rows = await svc.Task.filter({ created_by: task.created_by, status: 'active' }, '-updated_date', 500).catch(() => []);
    others = (rows || []).filter((t: any) => t && t.id && t.id !== task.id);
  }
  const minutesOf = new Map<string, number[]>();
  const groups: { minute: number; clock: string; members: any[]; sig: string }[] = [];
  for (const minute of mine) {
    const members = [task];
    for (const o of others) {
      let ms = minutesOf.get(o.id);
      if (!ms) { ms = setTimeMinutes(o, owner, nowMs); minutesOf.set(o.id, ms); }
      if (ms.includes(minute)) members.push(o);
    }
    if (members.length < 2) continue;
    const clock = clockKey(minute, timeZone);
    if (groups.some((g) => g.clock === clock)) continue; // a repeating task: one place per clock time
    groups.push({ minute, clock, members, sig: members.map((m) => m.id).sort().join('|') });
  }

  const updates = new Map<string, any>();
  const orderOf = (t: any) => updates.get(t.id)
    ?? (t.alarm_order && typeof t.alarm_order === 'object' ? { ...t.alarm_order } : {});
  // Its places at clock times it no longer shares with anyone go.
  const shared = new Set(groups.map((g) => g.clock));
  const own = orderOf(task);
  let ownChanged = false;
  for (const k of Object.keys(own)) {
    if (!shared.has(k)) { delete own[k]; ownChanged = true; }
  }
  if (ownChanged) updates.set(task.id, own);

  // Already in order: every member holds this clock time with the same tasks.
  const toJudge = groups.filter((g) => !g.members.every((m) => orderOf(m)[g.clock]?.with === g.sig)).slice(0, MAX_GROUPS);
  if (toJudge.length) {
    const asked = toJudge.map((g, gi) => ({
      id: String(gi + 1),
      when: new Date(g.minute).toLocaleString('en-US', { timeZone, weekday: 'long', hour: 'numeric', minute: '2-digit' }),
      items: g.members.map((m, mi) => ({ key: String.fromCharCode(65 + mi), task: m })),
    }));
    const got = await judge(asked).catch((e) => {
      console.error('[alarmOrder] judgment failed:', (e as any)?.message || e);
      return {} as Record<string, { order: string[]; why: string }>;
    });
    asked.forEach((a, gi) => {
      const ans = got[a.id];
      if (!ans) return; // no answer: the minute stays as it was
      const g = toJudge[gi];
      ans.order.forEach((key, rank) => {
        const m = g.members[key.charCodeAt(0) - 65];
        if (!m) return;
        const ao = orderOf(m);
        ao[g.clock] = { rank, with: g.sig, why: ans.why };
        updates.set(m.id, ao);
      });
      console.log(`[alarmOrder] ${g.clock} for ${task.created_by}: ${ans.order.map((k) => g.members[k.charCodeAt(0) - 65]?.title).join(' → ')} (${ans.why})`);
    });
  }

  let fresh = task;
  for (const [id, alarm_order] of updates) {
    const t = id === task.id ? task : others.find((o) => o.id === id);
    if (!t || JSON.stringify(t.alarm_order || {}) === JSON.stringify(alarm_order)) continue;
    try {
      await svc.Task.update(id, { alarm_order });
    } catch (e) {
      console.error('[alarmOrder] could not save the order on', id, (e as any)?.message || e);
      continue;
    }
    if (id === task.id) {
      fresh = { ...task, alarm_order };
    } else {
      await pushPhoneAlarms({ ...t, alarm_order }, owner, { before: t, changedAt: nowMs, source: 'alarmOrder' });
    }
  }
  return fresh;
}
