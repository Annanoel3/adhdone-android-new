import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Repeat, Timer } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Titles for the same habit drift ("Do dishes" vs "Do the dishes" vs "Put up the
// laundry"), which used to split them into separate habits and orphan their
// timed sessions. Drop filler words so those all land on the same key.
const FILLER = new Set(['the', 'a', 'an', 'my', 'some', 'do', 'go', 'get', 'take', 'put', 'up', 'out', 'and', 'to', 'of']);
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(' ')
    .trim();

// "Put up Antonio's laundry" is still the laundry habit. If a key contains every
// word of a shorter key ("antonios laundry" ⊇ "laundry"), fold it into that one.
const canonicalizer = (keys) => {
  const uniq = [...new Set(keys)].sort((a, b) => a.split(' ').length - b.split(' ').length);
  const map = {};
  uniq.forEach((k) => {
    const words = k.split(' ');
    const parent = uniq.find((p) => p !== k && p.split(' ').length < words.length && p.split(' ').every((w) => words.includes(w)));
    map[k] = parent ? map[parent] || parent : k;
  });
  return (k) => map[k] || k;
};

const fmtDuration = (secs) => {
  const m = Math.round(secs / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

// How often a repeated task shows up, in plain language.
const fmtFrequency = (count, spanDays) => {
  const perWeek = count / Math.max(spanDays / 7, 1);
  if (perWeek >= 6) return 'about daily';
  if (perWeek >= 1.5) return `about ${Math.round(perWeek)}x a week`;
  if (perWeek >= 0.8) return 'about once a week';
  const perMonth = perWeek * 4.3;
  if (perMonth >= 1.5) return `about ${Math.round(perMonth)}x a month`;
  return 'about once a month';
};

// Typical = the MIDDLE session, not the mean. A single short 5-min sprint or an
// abandoned session used to drag the average way below what the task really
// takes, which made the number feel wrong.
const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// A habit has to be something you actually come back to: at least 3 SEPARATE
// days, spread over at least two weeks. Finishing the same one-off task a few
// times in one afternoon (or a task recreated during testing) isn't a habit.
const MIN_DAYS = 3;
const MIN_SPAN_DAYS = 14;

// Habits = things you've finished more than once. Duration comes only from
// Sprints / Launchpad sessions, since that's the only time we actually know
// how long something took.
export default function HabitPatterns({ theme }) {
  const [habits, setHabits] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const completed = await base44.entities.Task.filter({ status: 'completed' }, '-completed_at', 2000);
    const logs = await base44.entities.FocusSessionLog.list('-completed_at', 1000);

    const canon = canonicalizer([
      ...completed.map(t => norm(t.title)),
      ...logs.map(l => norm(l.task_title)),
    ].filter(Boolean));

    const groups = {};
    completed.forEach(t => {
      if (!t.completed_at || t.parent_task_id || t.birthday_person) return;
      const key = canon(norm(t.title));
      if (!key) return;
      const g = groups[key] || (groups[key] = { title: t.title, days: new Set() });
      // One per calendar day — repeated completions the same day are the same
      // instance of the task, not a repeat of the habit.
      const d = new Date(t.completed_at);
      g.days.add(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    });

    const durations = {};
    logs.forEach(l => {
      const key = canon(norm(l.task_title));
      if (!key || !l.duration_seconds) return;
      (durations[key] = durations[key] || []).push(l.duration_seconds);
    });

    const list = Object.entries(groups)
      .map(([key, g]) => {
        const days = [...g.days];
        return { key, title: g.title, days, spanDays: (Math.max(...days) - Math.min(...days)) / 86400000 };
      })
      .filter(g => g.days.length >= MIN_DAYS && g.spanDays >= MIN_SPAN_DAYS)
      .map(({ key, title, days, spanDays }) => {
        const d = durations[key];
        return {
          title,
          count: days.length,
          frequency: fmtFrequency(days.length, spanDays),
          avgDuration: d ? fmtDuration(median(d)) : null,
          // Show the spread too, so one quick sprint doesn't look like the whole story.
          range: d && d.length > 1 && Math.max(...d) - Math.min(...d) >= 120
            ? `${fmtDuration(Math.min(...d))}–${fmtDuration(Math.max(...d))}`
            : null,
          sessions: d ? d.length : 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    setHabits(list);
  };

  if (!habits) return null;

  return (
    <Card className="border-none shadow-lg md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="w-5 h-5" />
          Your Habits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {habits.length === 0 && (
          <p className="text-sm text-gray-600">
            No habits spotted yet. Once you've done the same thing on a few separate days over a couple of weeks, it'll show up here — and if you use a Sprint or the Launchpad, we'll learn how long it actually takes you.
          </p>
        )}

        {habits.map((h, i) => (
          <div key={i} className={`p-3 rounded-xl ${theme === 'minimalist' ? 'bg-gray-50' : 'bg-white/60'}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-gray-900 flex-1 break-words">{h.title}</span>
              <Badge className="bg-blue-100 text-blue-700 flex-shrink-0">{h.count}x done</Badge>
            </div>
            <p className="text-xs text-gray-600 mt-1">You do this {h.frequency}</p>
            {h.avgDuration ? (
              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Usually takes you {h.avgDuration}
                <span className="text-gray-400">
                  ({h.range ? `${h.range}, ` : ''}{h.sessions} timed {h.sessions === 1 ? 'session' : 'sessions'})
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-1">Time it with a Sprint or the Launchpad to learn how long this takes you</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}