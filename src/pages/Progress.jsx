
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp, Calendar, Zap, Clock, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AchievementsCard from "../components/home/AchievementsCard";
import StreakCard from "../components/home/StreakCard";
import WeeklyChallenges from "../components/home/WeeklyChallenges";
import TodaysAccomplishments from "../components/home/TodaysAccomplishments";
import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { EnergyLog } from "@/entities/EnergyLog";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";
import { Button } from "@/components/ui/button";

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
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      // Update today's summary first
      await updateTodaysSummary();
      
      const allTasks = await Task.list('-updated_date');
      setTasks(allTasks);

      const today = new Date().toISOString().split('T')[0];
      const todaySummaries = await DailySummary.filter({ date: today });
      if (todaySummaries.length > 0) {
        setTodaysSummary(todaySummaries[0]);
      }

      const allSummaries = await DailySummary.list('-date', 30);
      setSummaries(allSummaries);

      const logs = await EnergyLog.list('-logged_at', 30);
      setEnergyLogs(logs);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const handleTaskUncomplete = async (task) => {
    try {
      await Task.update(task.id, { 
        status: 'active',
        completed_at: null
      });
      await loadData(); // Reload to update summaries
    } catch (error) {
      console.error("Error uncompleting task:", error);
    }
  };

  const calculateStats = () => {
    // Calculate from actual task data for accuracy
    const completedTasks = tasks.filter(t => t.status === 'completed');
    
    // Average completion rate from summaries (but only if they exist)
    const avgCompletionRate = summaries.length > 0
      ? Math.round(summaries.reduce((sum, s) => sum + (s.completion_rate || 0), 0) / summaries.length)
      : completedTasks.length > 0 ? 100 : 0;

    const energyByTime = energyLogs.reduce((acc, log) => {
      const hour = new Date(log.logged_at).getHours();
      const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
      if (!acc[timeOfDay]) acc[timeOfDay] = { total: 0, count: 0 };
      const energyValue = log.energy_level === 'high' ? 3 : log.energy_level === 'medium' ? 2 : 1;
      acc[timeOfDay].total += energyValue;
      acc[timeOfDay].count += 1;
      return acc;
    }, {});

    const bestTime = Object.entries(energyByTime).reduce((best, [time, data]) => {
      const avg = data.total / data.count;
      return avg > (best.avg || 0) ? { time, avg } : best;
    }, {}).time || 'Not enough data';

    return {
      totalCompleted: completedTasks.length,
      avgCompletionRate,
      bestTime
    };
  };

  const isSeasonalTheme = () => {
    return ['christmas', 'valentines', 'newyears', 'stpatricks', 'fourthjuly', 'summer', 'spring'].includes(specialMode);
  };

  const stats = calculateStats();

  return (
    <div className="p-4 md:p-8 w-full">
      <div className="max-w-7xl mx-auto">
        <Card className={`${isSeasonalTheme() ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
          !isSeasonalTheme() ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-blue-50 to-indigo-50'
          ) : ''
        }`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="text-center md:text-left flex-1">
                <h1 className={`text-3xl font-bold mb-2 ${
                  isSeasonalTheme() ? `${specialMode}-title` :
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Your Progress
                </h1>
                <p className={
                  isSeasonalTheme() ? `${specialMode}-text` :
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }>
                  Track your journey and celebrate your wins
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className={`grid w-full max-w-md grid-cols-2 mb-6 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Today's Accomplishments - Full Width */}
            <TodaysAccomplishments 
              tasks={tasks}
              theme={theme}
              onUncomplete={handleTaskUncomplete}
            />

            {/* Achievements, Streak, and Challenges - Stacked on Desktop */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AchievementsCard theme={theme} />
              <StreakCard theme={theme} summary={todaysSummary} />
              <WeeklyChallenges theme={theme} />
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            {/* Stats Cards - 3 columns */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
                specialMode === 'normal' ? (
                  theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                ) : ''
              }`}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
                    <Target className="w-5 h-5" />
                    Total Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-4xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {stats.totalCompleted}
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    tasks completed all time
                  </p>
                </CardContent>
              </Card>

              <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
                specialMode === 'normal' ? (
                  theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                ) : ''
              }`}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
                    <TrendingUp className="w-5 h-5" />
                    Avg Completion Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-4xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {stats.avgCompletionRate}%
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {summaries.length > 0 ? 'over the last 30 days' : 'based on your tasks'}
                  </p>
                </CardContent>
              </Card>

              <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
                specialMode === 'normal' ? (
                  theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                ) : ''
              }`}>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
                    <Zap className="w-5 h-5" />
                    Peak Energy Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {stats.bestTime}
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    when you're most productive
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Daily Summaries - Full Width */}
            <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
              specialMode === 'normal' ? (
                theme === 'dark' ? 'bg-gray-800' : 'bg-white'
              ) : ''
            }`}>
              <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
                  <Calendar className="w-5 h-5" />
                  Recent Daily Summaries
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summaries.length === 0 ? (
                  <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                    No daily summaries yet. Complete tasks to see your progress!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {summaries.slice(0, 7).map((summary) => (
                      <div
                        key={summary.id}
                        className={`p-4 rounded-lg border ${
                          theme === 'dark' ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                            {new Date(summary.date).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {summary.completion_rate}% completion
                          </span>
                        </div>
                        <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                          {summary.tasks_completed} of {summary.total_tasks} tasks completed
                        </div>
                        {summary.highlights && summary.highlights.length > 0 && (
                          <div className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                            {summary.highlights[0]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Easter Egg Button - Moved to bottom */}
        <div className="mt-8 text-center">
          <Button
            onClick={() => {
              if (window.triggerEasterEgg) {
                window.triggerEasterEgg('awesome');
              }
            }}
            variant="ghost"
            size="sm"
            className={`text-xs opacity-30 hover:opacity-100 transition-opacity ${
              theme === 'dark' || ['halloween', 'christmas', 'newyears', 'fourthjuly'].includes(specialMode)
                ? 'text-gray-500 hover:text-gray-400'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Click me
          </Button>
        </div>
      </div>
    </div>
  );
}
