import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Calendar, Zap, Clock, Target, CheckCircle2, BarChart2, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StreakCard from "../components/home/StreakCard";
import TodaysAccomplishments from "../components/home/TodaysAccomplishments";
import { base44 } from "@/api/base44Client";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid
} from "recharts";

export default function Progress() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [tasks, setTasks] = useState([]);
  const [todaysSummary, setTodaysSummary] = useState(null);
  const [summaries, setSummaries] = useState([]);
  const [energyLogs, setEnergyLogs] = useState([]);
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setTheme(localStorage.getItem('adhd_theme') || 'minimalist');
      setSpecialMode(localStorage.getItem('special_mode') || 'normal');
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      await updateTodaysSummary();

      const allTasks = await base44.entities.Task.list('-updated_date');
      setTasks(allTasks);

      const today = new Date().toISOString().split('T')[0];
      const todaySummaries = await base44.entities.DailySummary.filter({ date: today });
      if (todaySummaries.length > 0) setTodaysSummary(todaySummaries[0]);

      const allSummaries = await base44.entities.DailySummary.list('-date', 30);
      setSummaries(allSummaries);

      const logs = await base44.entities.EnergyLog.list('-logged_at', 60);
      setEnergyLogs(logs);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const handleTaskUncomplete = async (task) => {
    await base44.entities.Task.update(task.id, { status: 'active', completed_at: null });
    await loadData();
  };

  const isSeasonalTheme = () =>
    ['christmas', 'valentines', 'newyears', 'stpatricks', 'fourthjuly', 'summer', 'spring'].includes(specialMode);

  const cardClass = `${isSeasonalTheme() ? `${specialMode}-card` : ''} border-none shadow-md ${
    !isSeasonalTheme()
      ? theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      : ''
  }`;

  const textClass = theme === 'dark' ? 'text-gray-100' : 'text-gray-900';
  const subTextClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';

  // ── Stats ──────────────────────────────────────────────────────────────────
  const completedTasks = tasks.filter(t => t.status === 'completed' && !t.parent_task_id);
  const activeTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id);

  // Helper: get local date string YYYY-MM-DD from a task's completed_at
  const getLocalDate = (isoString) => {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Build a map of completions per local date from real task data
  const completionsByDate = {};
  completedTasks.forEach(t => {
    if (t.completed_at) {
      const dateStr = getLocalDate(t.completed_at);
      completionsByDate[dateStr] = (completionsByDate[dateStr] || 0) + 1;
    }
  });

  // Last 14 days — computed purely from real task completion data
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const completed = completionsByDate[dateStr] || 0;
    last14.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateStr,
      completed,
      rate: 0, // completion rate requires knowing total tasks that day — see below
    });
  }

  // Avg completion rate: completed / (completed + active tasks due today or earlier, or with no due date)
  // Excludes tasks with a future next_reminder / due date so they don't drag the rate down
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const relevantActiveTasks = activeTasks.filter(t => {
    if (!t.next_reminder) return true; // no due date — count it
    const dueDate = t.next_reminder.split('T')[0];
    return dueDate <= todayStr;
  });

  const relevantTotal = completedTasks.length + relevantActiveTasks.length;
  const avgCompletionRate = relevantTotal > 0
    ? Math.round((completedTasks.length / relevantTotal) * 100)
    : 0;

  const currentStreak = todaysSummary?.streak_days || 0;

  // Tasks completed by day of week (from real data)
  const byDayOfWeek = Array(7).fill(0).map((_, i) => ({
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
    count: 0
  }));
  completedTasks.forEach(t => {
    if (t.completed_at) {
      const dow = new Date(t.completed_at).getDay();
      byDayOfWeek[dow].count += 1;
    }
  });

  // Energy by time of day
  const energyByTime = { Morning: { total: 0, count: 0 }, Afternoon: { total: 0, count: 0 }, Evening: { total: 0, count: 0 } };
  energyLogs.forEach(log => {
    const hour = new Date(log.logged_at).getHours();
    const bucket = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    const val = log.energy_level === 'high' ? 3 : log.energy_level === 'medium' ? 2 : 1;
    energyByTime[bucket].total += val;
    energyByTime[bucket].count += 1;
  });
  const energyChartData = Object.entries(energyByTime).map(([label, d]) => ({
    label,
    avg: d.count > 0 ? Math.round((d.total / d.count) * 10) / 10 : 0,
  }));

  const bestEnergyTime = energyChartData.reduce((best, cur) => cur.avg > best.avg ? cur : best, { label: 'N/A', avg: 0 }).label;

  // Urgency breakdown
  const urgencyBreakdown = ['urgent', 'high', 'medium', 'low'].map(u => ({
    label: u.charAt(0).toUpperCase() + u.slice(1),
    count: completedTasks.filter(t => t.urgency === u).length,
  }));

  const chartColors = theme === 'dark'
    ? { primary: '#4ade80', secondary: '#60a5fa', muted: '#6b7280' }
    : { primary: '#16a34a', secondary: '#3b82f6', muted: '#9ca3af' };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${
      theme === 'spicybrains' ? 'bg-gradient-to-br from-green-300 via-green-400 to-green-500'
        : theme === 'dark' ? 'bg-gray-900' : ''
    }`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <Card className={`${isSeasonalTheme() ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
          !isSeasonalTheme()
            ? theme === 'minimalist' ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark' ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-br from-blue-50 to-indigo-50'
            : ''
        }`}>
          <CardContent className="p-6">
            <h1 className={`text-3xl font-bold mb-1 ${isSeasonalTheme() ? `${specialMode}-title` : textClass}`}>
              Your Progress
            </h1>
            <p className={isSeasonalTheme() ? `${specialMode}-text` : subTextClass}>
              Track your task habits and energy patterns
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className={`grid w-full max-w-md grid-cols-2 mb-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Today
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Insights
            </TabsTrigger>
          </TabsList>

          {/* ── TODAY TAB ──────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Completed today', value: todaysSummary?.tasks_completed ?? 0, icon: CheckCircle2 },
                { label: 'Still active', value: activeTasks.length, icon: Clock },
                { label: 'Current streak', value: `${currentStreak}d`, icon: Flame },
                { label: 'Avg completion', value: `${avgCompletionRate}%`, icon: Target },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className={cardClass}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${subTextClass}`} />
                      <span className={`text-xs ${subTextClass}`}>{label}</span>
                    </div>
                    <p className={`text-3xl font-bold ${textClass}`}>{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <TodaysAccomplishments tasks={tasks} theme={theme} onUncomplete={handleTaskUncomplete} />
            <StreakCard theme={theme} summary={todaysSummary} />
          </TabsContent>

          {/* ── INSIGHTS TAB ───────────────────────────────────────────────── */}
          <TabsContent value="insights" className="space-y-6">
            {/* All-time stats */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className={cardClass}>
                <CardContent className="p-5">
                  <p className={`text-xs mb-1 ${subTextClass}`}>Tasks completed (all time)</p>
                  <p className={`text-4xl font-bold ${textClass}`}>{completedTasks.length}</p>
                </CardContent>
              </Card>
              <Card className={cardClass}>
                <CardContent className="p-5">
                  <p className={`text-xs mb-1 ${subTextClass}`}>Avg daily completion rate</p>
                  <p className={`text-4xl font-bold ${textClass}`}>{avgCompletionRate}%</p>
                  <p className={`text-xs mt-1 ${subTextClass}`}>over last 30 days</p>
                </CardContent>
              </Card>
              <Card className={cardClass}>
                <CardContent className="p-5">
                  <p className={`text-xs mb-1 ${subTextClass}`}>Peak energy time</p>
                  <p className={`text-3xl font-bold ${textClass}`}>{bestEnergyTime}</p>
                  <p className={`text-xs mt-1 ${subTextClass}`}>based on check-ins</p>
                </CardContent>
              </Card>
            </div>

            {/* Tasks completed last 14 days */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                  <BarChart2 className="w-5 h-5" />
                  Tasks Completed — Last 14 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={last14} barSize={20}>
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartColors.muted }} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: theme === 'dark' ? '#1f2937' : '#fff', borderColor: '#e5e7eb' }}
                      labelStyle={{ color: theme === 'dark' ? '#d1d5db' : '#374151' }}
                    />
                    <Bar dataKey="completed" fill={chartColors.primary} radius={[4, 4, 0, 0]} name="Completed" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Completion rate trend */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                  <TrendingUp className="w-5 h-5" />
                  Daily Completion Rate — Last 14 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={last14}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#f3f4f6'} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartColors.muted }} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{ background: theme === 'dark' ? '#1f2937' : '#fff', borderColor: '#e5e7eb' }}
                      formatter={(v) => `${v}%`}
                    />
                    <Line type="monotone" dataKey="rate" stroke={chartColors.secondary} strokeWidth={2} dot={false} name="Rate" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tasks by day of week */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                  <Calendar className="w-5 h-5" />
                  Most Productive Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={byDayOfWeek} barSize={30}>
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: chartColors.muted }} />
                    <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: theme === 'dark' ? '#1f2937' : '#fff', borderColor: '#e5e7eb' }}
                      labelStyle={{ color: theme === 'dark' ? '#d1d5db' : '#374151' }}
                    />
                    <Bar dataKey="count" fill={chartColors.secondary} radius={[4, 4, 0, 0]} name="Tasks done" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Energy by time of day */}
            {energyLogs.length > 0 && (
              <Card className={cardClass}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                    <Zap className="w-5 h-5" />
                    Average Energy by Time of Day
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={energyChartData} barSize={50}>
                      <XAxis dataKey="label" tick={{ fontSize: 13, fill: chartColors.muted }} />
                      <YAxis tick={{ fontSize: 11, fill: chartColors.muted }} domain={[0, 3]} ticks={[1, 2, 3]}
                        tickFormatter={(v) => ['', 'Low', 'Med', 'High'][v]} />
                      <Tooltip
                        contentStyle={{ background: theme === 'dark' ? '#1f2937' : '#fff', borderColor: '#e5e7eb' }}
                        formatter={(v) => [v, 'Avg energy']}
                      />
                      <Bar dataKey="avg" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Avg energy" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Urgency breakdown */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                  <Target className="w-5 h-5" />
                  Completed Tasks by Priority
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {urgencyBreakdown.map(({ label, count }) => {
                    const max = Math.max(...urgencyBreakdown.map(x => x.count), 1);
                    const pct = Math.round((count / max) * 100);
                    const colors = { Urgent: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-blue-400', Low: 'bg-gray-400' };
                    return (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className={`text-sm font-medium ${textClass}`}>{label}</span>
                          <span className={`text-sm ${subTextClass}`}>{count} tasks</span>
                        </div>
                        <div className={`h-2 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          <div
                            className={`h-2 rounded-full ${colors[label]}`}
                            style={{ width: `${pct}%`, transition: 'width 0.5s ease' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Recent daily summaries — computed from real task data */}
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${textClass}`}>
                  <Calendar className="w-5 h-5" />
                  Recent Daily Summaries
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(completionsByDate).length === 0 ? (
                  <p className={subTextClass}>No completed tasks yet — complete tasks to build your history!</p>
                ) : (
                  <div className="space-y-3">
                    {Array.from({ length: 14 }, (_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      const completed = completionsByDate[dateStr] || 0;
                      return { dateStr, completed, d };
                    })
                    .filter(({ completed }) => completed > 0)
                    .slice(0, 7)
                    .map(({ dateStr, completed, d }) => (
                      <div key={dateStr} className={`p-4 rounded-lg border ${
                        theme === 'dark' ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                      }`}>
                        <div className="flex justify-between items-center">
                          <span className={`font-medium text-sm ${textClass}`}>
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-sm font-semibold text-green-500">
                            ✅ {completed} {completed === 1 ? 'task' : 'tasks'} done
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center" style={{ paddingBottom: 'max(1.5rem, calc(1.5rem + env(safe-area-inset-bottom)))' }}>
          <Button
            onClick={() => window.triggerEasterEgg?.('awesome')}
            variant="ghost" size="sm"
            className={`text-xs opacity-30 hover:opacity-100 transition-opacity ${
              theme === 'dark' ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Click me
          </Button>
        </div>
      </div>
    </div>
  );
}