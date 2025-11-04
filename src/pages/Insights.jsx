import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnergyLog } from "@/entities/EnergyLog";
import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { 
  TrendingUp, 
  Battery, 
  Clock, 
  Target,
  Calendar,
  Zap,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function Insights() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInsights();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadInsights = async () => {
    setIsLoading(true);

    // Get last 30 days of data
    const energyLogs = await EnergyLog.list('-logged_at', 100);
    const tasks = await Task.list('-created_date', 100);
    const summaries = await DailySummary.list('-date', 30);

    // Analyze energy patterns
    const morningEnergy = energyLogs.filter(log => {
      const hour = new Date(log.logged_at).getHours();
      return hour >= 6 && hour < 12;
    });

    const afternoonEnergy = energyLogs.filter(log => {
      const hour = new Date(log.logged_at).getHours();
      return hour >= 12 && hour < 18;
    });

    const eveningEnergy = energyLogs.filter(log => {
      const hour = new Date(log.logged_at).getHours();
      return hour >= 18 || hour < 6;
    });

    const getAverageEnergy = (logs) => {
      if (logs.length === 0) return 'medium';
      const scores = logs.map(l => l.energy_level === 'high' ? 3 : l.energy_level === 'medium' ? 2 : 1);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return avg >= 2.5 ? 'high' : avg >= 1.5 ? 'medium' : 'low';
    };

    // Analyze task completion by time
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_at);
    
    const morningCompletions = completedTasks.filter(t => {
      const hour = new Date(t.completed_at).getHours();
      return hour >= 6 && hour < 12;
    }).length;

    const afternoonCompletions = completedTasks.filter(t => {
      const hour = new Date(t.completed_at).getHours();
      return hour >= 12 && hour < 18;
    }).length;

    const eveningCompletions = completedTasks.filter(t => {
      const hour = new Date(t.completed_at).getHours();
      return hour >= 18 || hour < 6;
    }).length;

    // Best time of day
    const bestTime = 
      morningCompletions > afternoonCompletions && morningCompletions > eveningCompletions ? 'Morning' :
      afternoonCompletions > eveningCompletions ? 'Afternoon' : 'Evening';

    // Average completion rate
    const avgCompletionRate = summaries.length > 0
      ? Math.round(summaries.reduce((sum, s) => sum + (s.completion_rate || 0), 0) / summaries.length)
      : 0;

    // Most productive day
    const tasksByDay = {};
    completedTasks.forEach(t => {
      const day = new Date(t.completed_at).getDay();
      tasksByDay[day] = (tasksByDay[day] || 0) + 1;
    });
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mostProductiveDay = Object.keys(tasksByDay).length > 0
      ? dayNames[Object.keys(tasksByDay).reduce((a, b) => tasksByDay[a] > tasksByDay[b] ? a : b)]
      : 'Not enough data';

    setInsights({
      morningEnergy: getAverageEnergy(morningEnergy),
      afternoonEnergy: getAverageEnergy(afternoonEnergy),
      eveningEnergy: getAverageEnergy(eveningEnergy),
      morningCompletions,
      afternoonCompletions,
      eveningCompletions,
      bestTime,
      avgCompletionRate,
      mostProductiveDay,
      totalTasksCompleted: completedTasks.length,
      currentStreak: summaries[0]?.streak_days || 0
    });

    setIsLoading(false);
  };

  if (isLoading || !insights) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing your patterns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Insights</h1>
        <p className="text-gray-600">Understanding your productivity patterns</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Energy Patterns */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Battery className="w-5 h-5" />
              Energy Patterns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Morning (6 AM - 12 PM)</span>
                <Badge className={
                  insights.morningEnergy === 'high' ? 'bg-green-100 text-green-700' :
                  insights.morningEnergy === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }>
                  {insights.morningEnergy}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Afternoon (12 PM - 6 PM)</span>
                <Badge className={
                  insights.afternoonEnergy === 'high' ? 'bg-green-100 text-green-700' :
                  insights.afternoonEnergy === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }>
                  {insights.afternoonEnergy}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Evening (6 PM - 6 AM)</span>
                <Badge className={
                  insights.eveningEnergy === 'high' ? 'bg-green-100 text-green-700' :
                  insights.eveningEnergy === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }>
                  {insights.eveningEnergy}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task Completion Times */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              When You Get Things Done
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Morning</span>
                  <span className="font-medium">{insights.morningCompletions} tasks</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-teal-500"
                    style={{ 
                      width: `${(insights.morningCompletions / (insights.totalTasksCompleted || 1)) * 100}%` 
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Afternoon</span>
                  <span className="font-medium">{insights.afternoonCompletions} tasks</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ 
                      width: `${(insights.afternoonCompletions / (insights.totalTasksCompleted || 1)) * 100}%` 
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Evening</span>
                  <span className="font-medium">{insights.eveningCompletions} tasks</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                    style={{ 
                      width: `${(insights.eveningCompletions / (insights.totalTasksCompleted || 1)) * 100}%` 
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl mt-4 ${
              theme === 'minimalist' 
                ? 'bg-blue-50 border border-blue-100' 
                : 'bg-gradient-to-r from-blue-100 to-purple-100'
            }`}>
              <p className="text-sm font-medium text-gray-900">
                💡 You're most productive in the <span className="font-bold">{insights.bestTime}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Overall Stats */}
        <Card className="border-none shadow-lg md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Your Overall Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-xl text-center ${
                theme === 'minimalist' 
                  ? 'bg-green-50' 
                  : 'bg-gradient-to-br from-green-100 to-teal-100'
              }`}>
                <Target className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold text-gray-900">{insights.avgCompletionRate}%</div>
                <p className="text-xs text-gray-600 mt-1">Avg. Completion</p>
              </div>

              <div className={`p-4 rounded-xl text-center ${
                theme === 'minimalist' 
                  ? 'bg-orange-50' 
                  : 'bg-gradient-to-br from-orange-100 to-red-100'
              }`}>
                <Zap className="w-8 h-8 mx-auto mb-2 text-orange-600" />
                <div className="text-2xl font-bold text-gray-900">{insights.currentStreak}</div>
                <p className="text-xs text-gray-600 mt-1">Day Streak</p>
              </div>

              <div className={`p-4 rounded-xl text-center ${
                theme === 'minimalist' 
                  ? 'bg-blue-50' 
                  : 'bg-gradient-to-br from-blue-100 to-purple-100'
              }`}>
                <Calendar className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold text-gray-900">{insights.totalTasksCompleted}</div>
                <p className="text-xs text-gray-600 mt-1">Tasks Done</p>
              </div>

              <div className={`p-4 rounded-xl text-center ${
                theme === 'minimalist' 
                  ? 'bg-purple-50' 
                  : 'bg-gradient-to-br from-purple-100 to-pink-100'
              }`}>
                <Clock className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                <div className="text-base font-bold text-gray-900">{insights.mostProductiveDay}</div>
                <p className="text-xs text-gray-600 mt-1">Best Day</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actionable Recommendations */}
        <Card className={`border-none shadow-lg md:col-span-2 ${
          theme === 'minimalist' 
            ? 'bg-gradient-to-r from-purple-50 to-blue-50' 
            : 'bg-gradient-to-r from-purple-100 via-pink-100 to-orange-100'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Personalized Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />
              <p className="text-gray-700">
                Schedule your most important tasks during your <strong>{insights.bestTime.toLowerCase()}</strong> hours when you're most productive.
              </p>
            </div>
            {insights.afternoonEnergy === 'low' && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />
                <p className="text-gray-700">
                  Your energy dips in the afternoon. Try scheduling lower-energy tasks or taking a short break during this time.
                </p>
              </div>
            )}
            {insights.avgCompletionRate < 50 && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />
                <p className="text-gray-700">
                  Consider breaking down tasks into smaller steps to boost your completion rate.
                </p>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-600 mt-2 flex-shrink-0" />
              <p className="text-gray-700">
                Keep building that streak! Consistency is more important than perfection.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}