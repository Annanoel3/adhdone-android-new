import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Zap, Loader2 } from "lucide-react";
import { createPageUrl } from "@/utils";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";

export default function TaskNotification() {
  const navigate = useNavigate();
  const location = useLocation();
  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSnoozeOption, setShowSnoozeOption] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadTask();
  }, [location]);

  const loadTask = async () => {
    try {
      // Get taskId from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const taskId = urlParams.get('taskId');

      if (!taskId) {
        console.error("No taskId in URL");
        navigate(createPageUrl("Home"));
        return;
      }

      const tasks = await base44.entities.Task.filter({ id: taskId });
      
      if (tasks.length === 0) {
        console.error("Task not found");
        navigate(createPageUrl("Home"));
        return;
      }

      setTask(tasks[0]);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading task:", error);
      navigate(createPageUrl("Home"));
    }
  };

  const handleComplete = async () => {
    if (!task) return;

    setIsProcessing(true);

    try {
      const now = new Date();
      const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();

      await base44.entities.Task.update(task.id, {
        status: 'completed',
        completed_at: localISOString
      });

      await updateTodaysSummary();

      // Navigate to home with success
      navigate(createPageUrl("Home"), { 
        state: { 
          reload: true,
          message: "Great job! Task completed! 🎉"
        } 
      });
    } catch (error) {
      console.error("Error completing task:", error);
      setIsProcessing(false);
    }
  };

  const handleNotNow = () => {
    // For recurring tasks, just go back - they'll get reminded again on schedule
    if (task.reminder_interval && task.reminder_interval !== 'once') {
      navigate(createPageUrl("Home"));
      return;
    }

    // For one-time reminders, offer snooze
    setShowSnoozeOption(true);
  };

  const handleSnooze = async () => {
    if (!task) return;

    setIsProcessing(true);

    try {
      const nextReminder = new Date();
      nextReminder.setMinutes(nextReminder.getMinutes() + 30);

      await base44.entities.Task.update(task.id, {
        snooze_count: (task.snooze_count || 0) + 1,
        consecutive_snoozes: (task.consecutive_snoozes || 0) + 1,
        status: 'snoozed',
        next_reminder: nextReminder.toISOString()
      });

      // Navigate to home with snooze message
      navigate(createPageUrl("Home"), { 
        state: { 
          reload: true,
          message: "No problem! Reminder set for 30 minutes ⏰"
        } 
      });
    } catch (error) {
      console.error("Error snoozing task:", error);
      setIsProcessing(false);
    }
  };

  const getUrgencyColor = (urgency) => {
    if (theme === 'minimalist') {
      return {
        low: 'bg-gray-100 text-gray-600 border-gray-200',
        medium: 'bg-blue-100 text-blue-700 border-blue-200',
        high: 'bg-amber-100 text-amber-700 border-amber-200',
        urgent: 'bg-red-100 text-red-700 border-red-200'
      }[urgency];
    } else {
      return {
        low: 'bg-teal-200 text-teal-800 border-teal-300 font-medium',
        medium: 'bg-purple-200 text-purple-800 border-purple-300 font-medium',
        high: 'bg-orange-200 text-orange-800 border-orange-300 font-medium',
        urgent: 'bg-red-300 text-red-900 border-red-400 font-bold'
      }[urgency];
    }
  };

  const isRecurringTask = task && task.reminder_interval && task.reminder_interval !== 'once';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <div className={`min-h-screen p-4 flex items-center justify-center ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-purple-50 via-white to-orange-50'
    }`}>
      <Card className={`w-full max-w-md border-none shadow-2xl ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-8">
          {showSnoozeOption ? (
            <>
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  theme === 'dark' ? 'bg-blue-900/30' : 'bg-gradient-to-br from-blue-100 to-purple-100'
                }`}>
                  <Clock className={`w-8 h-8 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                  }`} />
                </div>
                <h2 className={`text-2xl font-bold mb-2 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Would you like to snooze?
                </h2>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Get reminded again in 30 minutes
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleSnooze}
                  disabled={isProcessing}
                  className={`w-full h-14 text-lg ${
                    theme === 'minimalist'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Clock className="w-5 h-5 mr-2" />
                  )}
                  Yes, remind me in 30 minutes
                </Button>

                <Button
                  onClick={() => navigate(createPageUrl("Home"))}
                  disabled={isProcessing}
                  variant="outline"
                  className={`w-full h-14 text-lg ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-white'
                      : ''
                  }`}
                >
                  No, go back
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  theme === 'dark' ? 'bg-purple-900/30' : 'bg-gradient-to-br from-purple-100 to-pink-100'
                }`}>
                  <Clock className={`w-8 h-8 ${
                    theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                  }`} />
                </div>
                <h2 className={`text-2xl font-bold mb-2 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Task Reminder
                </h2>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {isRecurringTask ? "It's time for this task" : "One-time reminder"}
                </p>
              </div>

              <div className={`p-4 rounded-xl mb-6 ${
                theme === 'dark' ? 'bg-gray-900/50' : 'bg-gradient-to-r from-purple-50/50 to-orange-50/50'
              }`}>
                <h3 className={`text-lg font-semibold mb-3 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  {task.title}
                </h3>

                <div className="flex flex-wrap gap-2">
                  {task.urgency && (
                    <Badge className={`${getUrgencyColor(task.urgency)} border`}>
                      {task.urgency}
                    </Badge>
                  )}
                  {task.energy_required && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {task.energy_required} energy
                    </Badge>
                  )}
                </div>

                {task.description && (
                  <p className={`mt-3 text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {task.description}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Button
                  onClick={handleComplete}
                  disabled={isProcessing}
                  className={`w-full h-14 text-lg ${
                    theme === 'minimalist'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                  )}
                  Yes, I did this!
                </Button>

                <Button
                  onClick={handleNotNow}
                  disabled={isProcessing}
                  variant="outline"
                  className={`w-full h-14 text-lg ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-white'
                      : ''
                  }`}
                >
                  {isRecurringTask ? "Not yet" : "I need more time"}
                </Button>
              </div>

              <button
                onClick={() => navigate(createPageUrl("Home"))}
                className={`w-full mt-4 text-sm ${
                  theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Back to Home
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}