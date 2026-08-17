import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Clock, Repeat, Timer, Plus } from "lucide-react";
import ManualFocusTimeDialog from "./ManualFocusTimeDialog";

// Aggregates FocusSessionLog records into per-task patterns: how often each
// task gets done and the average time it takes to finish it.

function formatDuration(sec) {
  if (!sec || sec < 1) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function FocusModeStats({ logs, tasks, theme, cardClass, textClass, subTextClass, onManualAdded }) {
  const [showManual, setShowManual] = useState(false);
  const { rows, totalSessions, totalTime } = useMemo(() => {
    const byTitle = {};
    (logs || []).forEach((l) => {
      const title = l.task_title || "Untitled task";
      if (!byTitle[title]) byTitle[title] = { count: 0, total: 0 };
      byTitle[title].count += 1;
      byTitle[title].total += l.duration_seconds || 0;
    });
    const list = Object.entries(byTitle)
      .map(([title, d]) => ({
        title,
        count: d.count,
        total: d.total,
        avg: d.count ? Math.round(d.total / d.count) : 0,
      }))
      .sort((a, b) => b.count - a.count || b.total - a.total);

    const totalSessions = list.reduce((acc, r) => acc + r.count, 0);
    const totalTime = list.reduce((acc, r) => acc + r.total, 0);
    return { rows: list, totalSessions, totalTime };
  }, [logs]);

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <Card className={cardClass}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={`flex items-center gap-2 ${textClass}`}>
            <Target className="w-5 h-5" />
            Focus Mode — Task Patterns
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add time
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {totalSessions === 0 ? (
          <p className={subTextClass}>
            No completed Focus Mode sessions yet. Use Focus Mode on a task to start collecting how
            long things actually take you.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className={`p-3 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Repeat className={`w-4 h-4 ${subTextClass}`} />
                  <span className={`text-xs ${subTextClass}`}>Sessions</span>
                </div>
                <p className={`text-2xl font-bold ${textClass}`}>{totalSessions}</p>
              </div>
              <div className={`p-3 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className={`w-4 h-4 ${subTextClass}`} />
                  <span className={`text-xs ${subTextClass}`}>Time focused</span>
                </div>
                <p className={`text-2xl font-bold ${textClass}`}>{formatDuration(totalTime)}</p>
              </div>
              <div className={`p-3 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Timer className={`w-4 h-4 ${subTextClass}`} />
                  <span className={`text-xs ${subTextClass}`}>Tasks tracked</span>
                </div>
                <p className={`text-2xl font-bold ${textClass}`}>{rows.length}</p>
              </div>
            </div>

            <div className="space-y-3">
              {rows.slice(0, 10).map((r) => {
                const pct = Math.round((r.count / maxCount) * 100);
                return (
                  <div key={r.title}>
                    <div className="flex justify-between items-center mb-1 gap-2">
                      <span className={`text-sm font-medium truncate ${textClass}`} title={r.title}>
                        {r.title}
                      </span>
                      <span className={`text-xs whitespace-nowrap ${subTextClass}`}>
                        {r.count}× · avg {formatDuration(r.avg)}
                      </span>
                    </div>
                    <div className={`h-2 rounded-full ${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
                      <div
                        className="h-2 rounded-full bg-green-500"
                        style={{ width: `${pct}%`, transition: "width 0.5s ease" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <ManualFocusTimeDialog
        open={showManual}
        onOpenChange={setShowManual}
        tasks={tasks}
        theme={theme}
        onSaved={onManualAdded}
      />
    </Card>
  );
}