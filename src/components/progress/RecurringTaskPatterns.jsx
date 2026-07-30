import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Repeat, Clock, CalendarClock } from "lucide-react";

function getLocalDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return null;
  const m = Math.round(sec / 60);
  if (m < 1) return "<1 min";
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `~${h}h ${rem}m` : `~${h}h`;
}

function frequencyLabel(avgDays, count) {
  if (avgDays <= 1.2) return "Daily";
  if (avgDays <= 2.5) return "Every couple days";
  if (avgDays <= 8) return "Weekly";
  if (avgDays <= 16) return "About every 2 weeks";
  if (avgDays <= 33) return "Monthly";
  return `Every ~${Math.round(avgDays)} days`;
}

// Learns recurring-task patterns from completion history + focus session logs.
//   tasks: all Task records (we use completed ones)
//   focusLogs: FocusSessionLog records (duration_seconds, task_id, task_title)
export default function RecurringTaskPatterns({ tasks, focusLogs, theme, cardClass, textClass, subTextClass }) {
  const patterns = useMemo(() => {
    const completed = (tasks || []).filter(
      (t) =>
        t.status === "completed" &&
        !t.parent_task_id &&
        t.completed_at &&
        // Birthdays are their own distinct feature — never surface them here.
        t.classification !== "birthday" &&
        !t.birthday_person
    );

    // Group completions by normalized title
    const groups = new Map();
    completed.forEach((t) => {
      const key = (t.title || "").trim().toLowerCase();
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { title: t.title.trim(), ids: new Set(), dates: [] });
      const g = groups.get(key);
      g.dates.push(new Date(t.completed_at).getTime());
      if (t.id) g.ids.add(t.id);
    });

    // Average focus duration per title (from FocusSessionLog, matched by title or task id)
    const durByTitle = new Map();
    const durById = new Map();
    (focusLogs || []).forEach((l) => {
      const dur = Number(l.duration_seconds) || 0;
      if (l.task_id) durById.set(l.task_id, [...(durById.get(l.task_id) || []), dur]);
      if (l.task_title) durByTitle.set(l.task_title.trim().toLowerCase(), [...(durByTitle.get(l.task_title.trim().toLowerCase()) || []), dur]);
    });

    const result = [];
    groups.forEach((g, key) => {
      if (g.dates.length < 2) return; // need at least 2 completions to spot a pattern
      g.dates.sort((a, b) => a - b);
      const spanDays = (g.dates[g.dates.length - 1] - g.dates[0]) / 86400000;
      const avgDays = g.dates.length > 1 ? spanDays / (g.dates.length - 1) : 0;

      // gather durations for this task (by id first, then by title)
      const durations = [];
      g.ids.forEach((id) => (durById.get(id) || []).forEach((d) => durations.push(d)));
      if (durations.length === 0) (durByTitle.get(key) || []).forEach((d) => durations.push(d));
      const avgDur = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;

      result.push({
        title: g.title,
        count: g.dates.length,
        firstAt: g.dates[0],
        lastAt: g.dates[g.dates.length - 1],
        avgDays,
        avgDur,
        freq: frequencyLabel(avgDays, g.dates.length),
      });
    });

    // Sort by how often they're done (most frequent first), then by count
    result.sort((a, b) => a.avgDays - b.avgDays || b.count - a.count);
    return result.slice(0, 12);
  }, [tasks, focusLogs]);

  if (patterns.length === 0) return null;

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${textClass}`}>
          <Repeat className="w-5 h-5" />
          Your Recurring Patterns
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xs mb-4 ${subTextClass}`}>
          Learned from your completion history{focusLogs?.length ? " & focus sessions" : ""}.
        </p>
        <div className="space-y-3">
          {patterns.map((p) => (
            <div
              key={p.title}
              className={`p-4 rounded-lg border ${theme === "dark" ? "border-gray-700 bg-gray-900/50" : "border-gray-200 bg-gray-50"}`}
            >
              <div className="flex justify-between items-start gap-3">
                <span className={`font-medium text-sm truncate flex-1 min-w-0 ${textClass}`}>
                  {p.title}
                </span>
                <span className="text-xs font-semibold text-green-500 flex-shrink-0">
                  {p.count}× done
                </span>
              </div>
              <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs ${subTextClass}`}>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {p.freq}
                </span>
                {p.avgDur != null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDuration(p.avgDur)} to do
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}