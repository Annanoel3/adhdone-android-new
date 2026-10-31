import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { Smile, Sparkles, Heart, ChevronRight, Check, Loader2 } from "lucide-react";
import { winLook } from "@/components/wins/winsTheme";
import { myEmail, dayOfMoment, localDateKey } from "@/components/wins/winsStore";
import { listDayMoods, moodInfo, isRoughMood, reasonLabel, MOOD_REASONS } from "@/components/wins/moodStore";

// "Mood and what got done" on Insights (Anna, Oct 31 2026): "It's a big
// accomplishment to be in a crappy mood and get stuff done... But also, it's
// reassuring to see why you might have not been that productive instead of
// just beating yourself up for being lazy."
//
// Counts only, no AI, nothing made up. Each day they answered "How did you
// feel today?" shows its face and how many tasks they finished that day.
// A finished task belongs to the day of its completed_at on this phone's
// clock, with the day turning over in the middle of their quiet hours and
// named the way the evening card names it (winsStore.dayOfMoment), so a task
// finished at 12:30 AM counts with the evening it belongs to. Never
// updated_date: a bulk edit on Oct 16 2026 touched every finished task. Same
// tasks as the page's other counts: no steps (subtasks), no birthdays.
//
// The two callouts wait for 5 check-ins in all (before that, one line asking
// for the evening answer):
// - Rough days (Rough or Low) with at least one thing finished: the proud part.
// - Slower days (fewer finished than the middle day of the range's check-ins)
//   that came with chips or a note: what was going on, in their words.
//
// Props: days = the Insights window (7, 30, 365, or null for all time, the
// same value LifeAreasCard gets); theme = the page's theme.

const MIN_CHECKINS = 5;
const TITLES_SHOWN = 15;

function keyToDate(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function shiftKey(key, delta) {
  const d = keyToDate(key);
  if (!d) return key;
  return localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
}
// Strip label: Today, Mon, Oct 27.
function shortLabel(key, todayKey) {
  const d = keyToDate(key);
  if (!d) return "";
  if (key === todayKey) return "Today";
  const t = keyToDate(todayKey);
  const ago = t ? Math.round((t - d) / 86400000) : 99;
  if (ago > 0 && ago < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
// Popup label: Tue, Oct 27 (with the year when it isn't this year).
function longLabel(key) {
  const d = keyToDate(key);
  if (!d) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function median(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function loadMoodDone(days) {
  const [user, moods, email] = await Promise.all([
    base44.auth.me().catch(() => null),
    listDayMoods(1000),
    myEmail(),
  ]);
  const now = new Date();
  const todayKey = dayOfMoment(user, now);
  const startKey = days == null ? "" : shiftKey(todayKey, -(days - 1));
  const inRange = moods
    .filter((m) => m.day <= todayKey && (!startKey || m.day >= startKey))
    .sort((a, b) => a.day.localeCompare(b.day));

  const base = { total: moods.length, todayKey, days: [], rough: null, slower: null };
  if (moods.length < MIN_CHECKINS || inRange.length === 0) return base;

  // Finished tasks from a little before the first day in view (a day can
  // start the evening before on the calendar).
  const first = keyToDate(inRange[0].day);
  const sinceIso = new Date(first.getFullYear(), first.getMonth(), first.getDate() - 2).toISOString();
  const query = { created_by: email, status: "completed", completed_at: { $gte: sinceIso } };
  const tasks = (await base44.entities.Task.filter(query, "-completed_at", 2000)) || [];

  const byDay = new Map(inRange.map((m) => [m.day, { ...m, done: 0, titles: [] }]));
  for (const t of tasks) {
    if (!t?.completed_at || t.parent_task_id || t.birthday_person) continue;
    const day = dayOfMoment(user, t.completed_at);
    const entry = byDay.get(day);
    if (!entry) continue;
    entry.done += 1;
    entry.titles.push(String(t.title || "").trim() || "A task");
  }
  const list = inRange.map((m) => byDay.get(m.day));

  const roughDays = list.filter((d) => isRoughMood(d.mood) && d.done >= 1);
  const rough = roughDays.length
    ? { days: roughDays.slice().reverse(), tasks: roughDays.reduce((s, d) => s + d.done, 0) }
    : null;

  const usual = median(list.map((d) => d.done));
  const said = (d) => (Array.isArray(d.reasons) && d.reasons.length > 0) || !!String(d.note || "").trim();
  const slowerDays = list.filter((d) => d.done < usual && said(d));
  let slower = null;
  if (slowerDays.length) {
    const counts = {};
    for (const d of slowerDays) for (const r of d.reasons || []) counts[r] = (counts[r] || 0) + 1;
    const order = MOOD_REASONS.map((r) => r.key);
    const tally = Object.entries(counts)
      .filter(([k]) => order.includes(k))
      .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
    slower = {
      days: slowerDays.slice().reverse(),
      tally,
      notes: slowerDays.some((d) => String(d.note || "").trim()),
    };
  }

  return { ...base, days: list, rough, slower };
}

export default function MoodDoneCard({ days = null, theme = "minimalist" }) {
  const [state, setState] = useState({ key: null, data: null, error: false });
  const [openList, setOpenList] = useState(null); // "rough" | "slower" | null
  const stripRef = useRef(null);
  const dark = theme === "dark";
  const look = winLook(theme);
  const key = days == null ? "all" : String(days);

  useEffect(() => {
    let alive = true;
    loadMoodDone(days).then(
      (data) => { if (alive) setState({ key, data, error: false }); },
      (e) => {
        console.error("[Insights] Mood and what got done could not load:", e);
        if (alive) setState({ key, data: null, error: true });
      }
    );
    return () => { alive = false; };
  }, [days, key]);

  const current = state.key === key ? state : { data: null, error: false };
  const data = current.data;

  // Newest day in view.
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [data]);

  const muted = dark ? "text-gray-300" : "text-gray-600";
  const tile = dark ? "bg-white/10" : "bg-gray-50 border border-gray-100";
  const callout = theme === "minimalist"
    ? "bg-purple-50 border border-purple-100"
    : dark
      ? "bg-white/5 border border-white/10"
      : "bg-gradient-to-r from-purple-100 to-pink-100";
  const accent = dark ? "text-purple-300" : "text-purple-600";

  let body;
  if (!data && !current.error) {
    body = (
      <p className={`text-sm flex items-center gap-2 ${muted}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your check-ins…
      </p>
    );
  } else if (current.error) {
    body = <p className={`text-sm ${muted}`}>Couldn&apos;t load this right now. Check back later.</p>;
  } else if (data.total === 0) {
    body = <p className={`text-sm ${muted}`}>Answer &ldquo;How did you feel today?&rdquo; in the evening, and this fills in after 5 days.</p>;
  } else if (data.total < MIN_CHECKINS) {
    body = <p className={`text-sm ${muted}`}>{data.total} of 5 so far. Keep answering &ldquo;How did you feel today?&rdquo; in the evening.</p>;
  } else if (data.days.length === 0) {
    body = <p className={`text-sm ${muted}`}>No check-ins in this stretch yet.</p>;
  } else {
    const reasonsText = data.slower
      ? data.slower.tally.map(([k, n]) => `${reasonLabel(k).toLowerCase()} (${n})`).join(", ")
      : "";
    body = (
      <div className="space-y-3">
        <div
          ref={stripRef}
          className="flex gap-1.5 overflow-x-auto pb-1"
          role="list"
          aria-label="Days you checked in"
        >
          {data.days.map((d) => {
            const info = moodInfo(d.mood);
            return (
              <div
                key={d.day}
                role="listitem"
                aria-label={`${longLabel(d.day)}: felt ${info?.label || ""}, ${plural(d.done, "task", "tasks")} finished`}
                className={`flex-shrink-0 w-12 flex flex-col items-center gap-1 rounded-xl py-2 ${tile}`}
              >
                <span className={`text-[10px] leading-none whitespace-nowrap ${muted}`}>{shortLabel(d.day, data.todayKey)}</span>
                <span className="text-xl leading-none" aria-hidden="true">{info?.face}</span>
                <span className="text-xs font-semibold leading-none flex items-center gap-0.5" aria-hidden="true">
                  <Check className="w-3 h-3" />
                  {d.done}
                </span>
              </div>
            );
          })}
        </div>

        {data.rough && (
          <button
            type="button"
            onClick={() => setOpenList("rough")}
            className={`w-full text-left rounded-xl p-3 flex items-start gap-3 ${callout}`}
          >
            <Sparkles className={`w-4 h-4 mt-0.5 flex-shrink-0 ${accent}`} />
            <span className="flex-1 min-w-0 text-sm font-medium text-gray-900">
              On {plural(data.rough.days.length, "rough day", "rough days")}, you still got {plural(data.rough.tasks, "thing", "things")} done.
            </span>
            <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${muted}`} />
          </button>
        )}

        {data.slower && (
          <button
            type="button"
            onClick={() => setOpenList("slower")}
            className={`w-full text-left rounded-xl p-3 flex items-start gap-3 ${callout}`}
          >
            <Heart className={`w-4 h-4 mt-0.5 flex-shrink-0 ${accent}`} />
            <span className="flex-1 min-w-0 text-sm font-medium text-gray-900">
              {plural(data.slower.days.length, "slower day", "slower days")}, and what was going on
              {reasonsText
                ? `: ${reasonsText}${data.slower.notes ? ", plus your notes" : ""}.`
                : ", in your words."}
            </span>
            <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${muted}`} />
          </button>
        )}
      </div>
    );
  }

  const listDays = openList === "rough" ? data?.rough?.days || [] : openList === "slower" ? data?.slower?.days || [] : [];

  return (
    <Card className="border-none shadow-lg md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smile className="w-5 h-5" />
          Mood and what got done
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>

      <Dialog open={!!openList} onOpenChange={(o) => { if (!o) setOpenList(null); }}>
        <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look.surface}`}>
          <DialogHeader className="text-left">
            <DialogTitle>{openList === "rough" ? "Your rough days" : "Your slower days"}</DialogTitle>
            <DialogDescription className={look.muted}>
              {openList === "rough" ? "What you still got done." : "What was going on."}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {listDays.map((d) => {
              const info = moodInfo(d.mood);
              const reasons = (d.reasons || []).map(reasonLabel).filter(Boolean);
              const note = String(d.note || "").trim();
              return (
                <li key={d.day} className={`rounded-xl border p-3 ${look.row}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none" aria-hidden="true">{info?.face}</span>
                    <span className="text-sm font-medium">{longLabel(d.day)}</span>
                    <span className={`text-xs ml-auto whitespace-nowrap ${look.muted}`}>
                      {info?.label} · {d.done} done
                    </span>
                  </div>
                  {openList === "rough" && d.titles.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {d.titles.slice(0, TITLES_SHOWN).map((title, i) => (
                        <li key={`${d.day}-${i}`} className="flex items-start gap-1.5 break-words min-w-0">
                          <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${look.accent}`} />
                          <span className="min-w-0">{title}</span>
                        </li>
                      ))}
                      {d.titles.length > TITLES_SHOWN && (
                        <li className={`text-xs ${look.muted}`}>and {d.titles.length - TITLES_SHOWN} more</li>
                      )}
                    </ul>
                  )}
                  {openList === "slower" && reasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {reasons.map((r) => (
                        <span key={r} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${look.tag}`}>{r}</span>
                      ))}
                    </div>
                  )}
                  {openList === "slower" && note && (
                    <p className="mt-2 text-sm whitespace-pre-wrap break-words">&ldquo;{note}&rdquo;</p>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
