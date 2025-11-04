import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Calendar } from "lucide-react";
import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { Progress } from "@/components/ui/progress";

export default function OverwhelmWarning({ taskCount, theme }) {
  const [avgTasksPerDay, setAvgTasksPerDay] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    calculateAverage();
  }, []);

  const calculateAverage = async () => {
    try {
      const summaries = await DailySummary.list('-date', 30);
      
      if (summaries.length === 0) {
        setAvgTasksPerDay(5);
        setIsLoading(false);
        return;
      }

      const totalCompleted = summaries.reduce((sum, s) => sum + (s.tasks_completed || 0), 0);
      const avg = Math.max(1, Math.round(totalCompleted / summaries.length));
      setAvgTasksPerDay(avg);
    } catch (error) {
      console.error("Error calculating average:", error);
      setAvgTasksPerDay(5);
    }
    
    setIsLoading(false);
  };

  if (isLoading || avgTasksPerDay === null) {
    return null;
  }

  // Only show warning if tasks exceed 150% of typical daily completion
  // This prevents false alarms for normal task loads
  const threshold = Math.max(3, Math.ceil(avgTasksPerDay * 1.5));
  
  if (taskCount < threshold) {
    return null;
  }

  const capacity = Math.min(100, Math.round((taskCount / threshold) * 100));
  const isOverwhelming = capacity >= 90;

  return (
    <Card className={`border-2 ${
      isOverwhelming
        ? theme === 'minimalist'
          ? 'border-amber-400 bg-amber-50'
          : theme === 'dark'
            ? 'border-amber-600 bg-amber-900/20'
            : 'border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50'
        : theme === 'minimalist'
          ? 'border-blue-300 bg-blue-50'
          : theme === 'dark'
            ? 'border-blue-700 bg-blue-900/20'
            : 'border-blue-300 bg-gradient-to-r from-blue-50 to-purple-50'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            isOverwhelming
              ? theme === 'minimalist' ? 'bg-amber-200' : 'bg-amber-200'
              : theme === 'minimalist' ? 'bg-blue-200' : 'bg-blue-200'
          }`}>
            {isOverwhelming ? (
              <AlertTriangle className="w-5 h-5 text-amber-700" />
            ) : (
              <Calendar className="w-5 h-5 text-blue-700" />
            )}
          </div>
          
          <div className="flex-1">
            <h3 className={`font-semibold mb-1 ${
              theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
            }`}>
              {isOverwhelming ? "Your schedule is getting full" : "Getting busy today"}
            </h3>
            <p className={`text-sm mb-3 ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {isOverwhelming 
                ? "You might want to prioritize only the most important tasks for today"
                : "You're adding more tasks than usual. Make sure to prioritize!"}
            </p>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  Schedule capacity
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{taskCount} tasks</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    isOverwhelming 
                      ? 'bg-amber-200 text-amber-800'
                      : 'bg-blue-200 text-blue-800'
                  }`}>
                    {capacity}%
                  </span>
                </div>
              </div>
              
              <Progress 
                value={capacity} 
                className={`h-2 ${
                  isOverwhelming
                    ? '[&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-orange-500'
                    : '[&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-purple-500'
                }`}
              />
              
              <p className={`text-xs ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                💡 You typically complete ~{avgTasksPerDay} tasks per day
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}