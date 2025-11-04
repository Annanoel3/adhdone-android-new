
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Share2,
  Download,
  Lightbulb // Added Lightbulb icon for improvements section
} from "lucide-react";
import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { EnergyLog } from "@/entities/EnergyLog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function EndOfDayReview({ isOpen, onClose, theme }) {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      generateSummary();
    }
  }, [isOpen]);

  const generateSummary = async () => {
    setIsLoading(true);

    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(today).toISOString();

    // Get today's tasks
    const allTasks = await Task.list();
    const todayTasks = allTasks.filter(t => {
      const createdDate = new Date(t.created_date).toISOString().split('T')[0];
      return createdDate === today || t.status === 'active' || t.status === 'snoozed'; // Include snoozed tasks for analysis
    });

    const completed = todayTasks.filter(t => {
      if (t.status !== 'completed') return false;
      const completedDate = new Date(t.completed_at || t.updated_date).toISOString().split('T')[0];
      return completedDate === today;
    });

    const remaining = todayTasks.filter(t => t.status === 'active');
    
    // SMART SNOOZE DETECTION: Only flag problematic snoozes
    const snoozedTasks = todayTasks.filter(t => {
      if (t.status !== 'snoozed') return false;
      
      // Don't flag recurring tasks (daily/every_other_day) - they're meant to be ongoing
      if (t.reminder_interval === 'daily' || t.reminder_interval === 'every_other_day') {
        return false;
      }
      
      // Only flag if snoozed 3+ times (shows it's actually stuck, not just needs timing adjustment)
      return (t.consecutive_snoozes || 0) >= 3;
    });

    const completionRate = todayTasks.length > 0
      ? Math.round((completed.length / todayTasks.length) * 100)
      : 0;

    // Get previous summaries for streak
    const previousSummaries = await DailySummary.list('-date', 30);
    let streakDays = 0;
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Check if yesterday's summary exists and had tasks completed to continue streak
    const yesterdaySummary = previousSummaries.find(s => s.date === yesterday);
    if (yesterdaySummary && yesterdaySummary.tasks_completed > 0) {
      streakDays = (yesterdaySummary.streak_days || 0) + 1;
    } else if (completed.length > 0) { // Start a new streak if no previous streak and tasks completed today
      streakDays = 1;
    }


    // Get energy logs
    const energyLogs = await EnergyLog.list('-logged_at', 10);
    const todayEnergy = energyLogs.filter(log => {
      const logDate = new Date(log.logged_at).toISOString().split('T')[0];
      return logDate === today;
    });

    // Generate highlights with more variety
    const highlights = [];
    const highlightVariations = {
      completedTasks: [
        `Completed ${completed.length} ${completed.length === 1 ? 'task' : 'tasks'} - that's real progress!`,
        `Got ${completed.length} things done today - you showed up and did the work!`,
        `Checked off ${completed.length} ${completed.length === 1 ? 'task' : 'tasks'} - momentum is building!`
      ],
      highCompletion: [
        "🌟 Outstanding completion rate - you're in the zone!",
        "⭐ Crushed your task list today - what a performance!",
        "💫 Your completion rate is incredible - keep this energy!"
      ],
      streak: [
        `🏆 ${streakDays} day streak maintained - consistency is your superpower!`,
        `🔥 ${streakDays} days in a row - you're building something special!`,
        `⚡ ${streakDays} day win streak - unstoppable momentum!`
      ],
      urgentDone: [
        "💪 Tackled urgent tasks head-on - that's courage!",
        "🎯 Handled the urgent stuff when it mattered - well done!",
        "⚡ Knocked out urgent tasks - you thrive under pressure!"
      ],
      onFire: [
        "🔥 You're absolutely on fire today!",
        "🚀 What a productive day - you're crushing it!",
        "⭐ Today was YOUR day - incredible work!"
      ]
    };

    if (completed.length > 0) {
      const variation = highlightVariations.completedTasks[Math.floor(Math.random() * highlightVariations.completedTasks.length)];
      highlights.push(variation);
    }
    if (completed.length >= 10) { // Condition changed from 5 to 10
      const variation = highlightVariations.onFire[Math.floor(Math.random() * highlightVariations.onFire.length)];
      highlights.push(variation);
    }
    if (completionRate >= 80) {
      const variation = highlightVariations.highCompletion[Math.floor(Math.random() * highlightVariations.highCompletion.length)];
      highlights.push(variation);
    }
    if (streakDays >= 3) { // Condition changed from > 0 to >= 3
      const variation = highlightVariations.streak[Math.floor(Math.random() * highlightVariations.streak.length)];
      highlights.push(variation);
    }
    // Assuming 'urgency' is a property of a Task object
    if (completed.some(t => t.urgency === 'urgent')) {
      const variation = highlightVariations.urgentDone[Math.floor(Math.random() * highlightVariations.urgentDone.length)];
      highlights.push(variation);
    }

    const improvements = [];
    const improvementVariations = {
      lowCompletion: [
        "💡 Try breaking tasks into smaller, 5-minute chunks tomorrow",
        "🎯 Focus on completing one thing at a time instead of juggling many",
        "⚡ Start with your easiest task to build momentum"
      ],
      problematicSnoozes: [
        `⚠️ ${snoozedTasks.length} task${snoozedTasks.length === 1 ? '' : 's'} stuck in snooze (3+ times) - might need breaking down!`,
        `💭 ${snoozedTasks.length} task${snoozedTasks.length === 1 ? ' keeps' : 's keep'} getting delayed - maybe ${snoozedTasks.length === 1 ? 'it\'s' : 'they\'re'} too big?`,
        `🔄 ${snoozedTasks.length} task${snoozedTasks.length === 1 ? ' is' : 's are'} really stuck - let's break ${snoozedTasks.length === 1 ? 'it' : 'them'} into smaller steps!`
      ],
      noCompleted: [
        "🎯 Tomorrow, aim for just ONE small win to start the momentum",
        "💪 Start tomorrow with your easiest task - build from there!",
        "🌟 One task completed tomorrow is still 100% better than today"
      ]
    };

    // total_tasks refers to todayTasks.length
    if (completionRate < 50 && todayTasks.length > 0) {
      const variation = improvementVariations.lowCompletion[Math.floor(Math.random() * improvementVariations.lowCompletion.length)];
      improvements.push(variation);
    }
    if (snoozedTasks.length > 0) {
      const variation = improvementVariations.problematicSnoozes[Math.floor(Math.random() * improvementVariations.problematicSnoozes.length)];
      improvements.push(variation);
    }
    if (completed.length === 0 && todayTasks.length > 0) {
      const variation = improvementVariations.noCompleted[Math.floor(Math.random() * improvementVariations.noCompleted.length)];
      improvements.push(variation);
    }


    const summaryData = {
      date: today,
      tasks_completed: completed.length,
      tasks_remaining: remaining.length,
      total_tasks: todayTasks.length,
      completion_rate: completionRate,
      streak_days: streakDays,
      energy_levels: todayEnergy.map(e => ({
        time: new Date(e.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        level: e.energy_level
      })),
      highlights: highlights.length > 0 ? highlights : ["Every small step counts!"],
      improvements: improvements.length > 0 ? improvements : ["Keep striving for your goals! You've got this!"] // Added a default message
    };

    // Save summary
    await DailySummary.create(summaryData);

    setSummary(summaryData);
    setIsLoading(false);
  };

  if (!summary || isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto flex flex-col items-center justify-center p-8">
          <Sparkles className="w-12 h-12 text-purple-600 animate-pulse" />
          <p className="mt-4 text-lg font-semibold text-gray-700">Generating your day's review...</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            Your Day in Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          {/* Main Stats */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Card className={`border-none ${
              theme === 'minimalist'
                ? 'bg-green-50'
                : 'bg-gradient-to-br from-green-100 to-teal-100'
            }`}>
              <CardContent className="p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                  {summary.tasks_completed}
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Completed</p>
              </CardContent>
            </Card>

            <Card className={`border-none ${
              theme === 'minimalist'
                ? 'bg-blue-50'
                : 'bg-gradient-to-br from-blue-100 to-purple-100'
            }`}>
              <CardContent className="p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                  {summary.tasks_remaining}
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Remaining</p>
              </CardContent>
            </Card>

            <Card className={`border-none ${
              theme === 'minimalist'
                ? 'bg-orange-50'
                : 'bg-gradient-to-br from-orange-100 to-red-100'
            }`}>
              <CardContent className="p-3 sm:p-4 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                  {summary.completion_rate}%
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Done</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress Bar */}
          <Card className="border-none shadow-md">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-sm sm:text-base text-gray-900">Today's Progress</span>
                <Badge className={
                  summary.completion_rate >= 80 ? 'bg-green-100 text-green-700' :
                  summary.completion_rate >= 50 ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }>
                  {summary.completion_rate >= 80 ? 'Excellent!' :
                   summary.completion_rate >= 50 ? 'Good work!' :
                   'Keep going!'}
                </Badge>
              </div>
              <Progress
                value={summary.completion_rate}
                className={`h-4 ${
                  theme === 'minimalist'
                    ? '[&>div]:bg-green-500'
                    : '[&>div]:bg-gradient-to-r [&>div]:from-green-500 [&>div]:to-teal-500'
                }`}
              />
            </CardContent>
          </Card>

          {/* Highlights */}
          <Card className={`border-none ${
            theme === 'minimalist'
              ? 'bg-purple-50'
              : 'bg-gradient-to-br from-purple-100 to-pink-100'
          }`}>
            <CardContent className="p-4 sm:p-6">
              <h3 className="font-semibold text-sm sm:text-base text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                Today's Highlights
              </h3>
              <ul className="space-y-2">
                {summary.highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm text-gray-700 break-words">{highlight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Improvements / Insights */}
          <Card className={`border-none ${
            theme === 'minimalist'
              ? 'bg-yellow-50' // New color for minimalist theme
              : 'bg-gradient-to-br from-yellow-100 to-orange-100' // New color for gradient theme
          }`}>
            <CardContent className="p-4 sm:p-6">
              <h3 className="font-semibold text-sm sm:text-base text-gray-900 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                Today's Insights
              </h3>
              <ul className="space-y-2">
                {summary.improvements.map((improvement, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm text-gray-700 break-words">{improvement}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Energy Pattern */}
          {summary.energy_levels.length > 0 && (
            <Card className="border-none shadow-md">
              <CardContent className="p-4 sm:p-6">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 mb-3">Energy Throughout the Day</h3>
                <div className="flex flex-wrap gap-2">
                  {summary.energy_levels.map((log, index) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className={`text-xs ${
                        log.level === 'high' ? 'border-green-300 bg-green-50' :
                        log.level === 'medium' ? 'border-amber-300 bg-amber-50' :
                        'border-red-300 bg-red-50'
                      }`}
                    >
                      {log.time}: {log.level}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                // TODO: Implement share functionality
                alert("Share feature coming soon!");
              }}
            >
              <Share2 className="w-4 h-4 mr-2" />
              <span className="text-sm">Share with Partner</span>
            </Button>
            <Button
              onClick={onClose}
              className={`flex-1 ${theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }`}
            >
              Great, Thanks!
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
