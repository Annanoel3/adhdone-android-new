
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, TrendingUp } from "lucide-react";
import { DailySummary } from "@/entities/DailySummary";

export default function StreakCard({ theme, summary }) {
  const [streak, setStreak] = useState(0);
  const [weekProgress, setWeekProgress] = useState(0);

  useEffect(() => {
    loadStreakData();
  }, []);

  const loadStreakData = async () => {
    const summaries = await DailySummary.list('-date', 30);
    
    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    
    for (let i = 0; i < summaries.length; i++) {
      const summaryDate = new Date(summaries[i].date);
      const daysDiff = Math.floor((today - summaryDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === i && summaries[i].tasks_completed > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
    
    setStreak(currentStreak);

    // Calculate this week's progress
    const thisWeek = summaries.filter(s => {
      const summaryDate = new Date(s.date);
      const daysDiff = Math.floor((today - summaryDate) / (1000 * 60 * 60 * 24));
      return daysDiff < 7;
    });
    
    const avgCompletion = thisWeek.length > 0
      ? thisWeek.reduce((sum, s) => sum + (s.completion_rate || 0), 0) / thisWeek.length
      : 0;
    
    setWeekProgress(Math.round(avgCompletion));
  };

  const specialMode = localStorage.getItem('special_mode') || 'normal';

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-white/80 backdrop-blur-sm' 
          : theme === 'dark'
            ? 'bg-gray-800 border border-gray-700'
            : 'bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200'
      ) : ''
    }`}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-lg ${theme === 'dark' ? 'text-white' : ''}`}>
          <div className={`p-2 rounded-xl ${
            theme === 'minimalist' ? 'bg-orange-100' : theme === 'dark' ? 'bg-orange-900/30' : 'bg-orange-200'
          }`}>
            <Flame className={`w-4 h-4 ${
              theme === 'minimalist' ? 'text-orange-600' : theme === 'dark' ? 'text-orange-400' : 'text-orange-700'
            }`} />
          </div>
          <span>Your Streak</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className={`text-5xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {streak}
          </div>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
            {streak === 1 ? 'day' : 'days'} in a row! 🔥
          </p>
        </div>

        <div className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} p-4 rounded-xl ${
          specialMode === 'normal' ? (
            theme === 'minimalist' 
              ? 'bg-blue-50 border border-blue-100' 
              : theme === 'dark'
                ? 'bg-gray-900/50 border border-gray-700'
                : 'bg-gradient-to-r from-blue-100 to-teal-100 border border-blue-200'
          ) : ''
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium flex items-center gap-1 ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
              <TrendingUp className="w-4 h-4" />
              This Week
            </span>
            <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {weekProgress}%
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white/50'}`}>
            <div 
              className={`h-full transition-all duration-500 ${
                theme === 'minimalist' 
                  ? 'bg-blue-600' 
                  : theme === 'dark'
                    ? 'bg-blue-500'
                    : 'bg-gradient-to-r from-blue-600 to-teal-600'
              }`}
              style={{ width: `${weekProgress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
