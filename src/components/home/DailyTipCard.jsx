import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { generateSmartTipForUser, CURRENT_PROMPT_VERSION } from "../utils/dailyTipGenerator";

const isEvening = () => new Date().getHours() >= 17;

const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export default function DailyTipCard({ theme }) {
  const [todaysTip, setTodaysTip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const specialMode = typeof localStorage !== 'undefined' ? localStorage.getItem('special_mode') : 'normal';

  useEffect(() => {
    loadTodaysTip();
  }, []);

  // When another component (e.g. the energy check-in) generates a fresh tip,
  // reload the card so it shows the new one.
  useEffect(() => {
    const handler = () => { loadTodaysTip(); };
    window.addEventListener('daily-tip-regenerated', handler);
    return () => window.removeEventListener('daily-tip-regenerated', handler);
  }, []);

  const loadTodaysTip = async () => {
    const today = getLocalDateString();
    
    // Check if we already have a tip for today
    const existingTips = await base44.entities.DailyTip.filter({ shown_date: today });
    
    // Get current task completion count using local date comparison
    const tasks = await base44.entities.Task.list('-created_date', 50);
    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      const d = new Date(t.completed_at);
      const localDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return localDate === today;
    }).length;
    
    // If we have a tip but it's an old version OR context changed significantly, regenerate
    if (existingTips.length > 0) {
      const tip = existingTips[0];
      const needsRegeneration = 
        !tip.prompt_version || 
        tip.prompt_version < CURRENT_PROMPT_VERSION ||
        shouldRegenerateForContext(completedToday);
      
      if (needsRegeneration) {
        console.log('🔄 [DAILY TIP] Regenerating tip (context changed or old version)...');
        await base44.entities.DailyTip.delete(tip.id);
        await generateSmartTip(today);
      } else {
        setTodaysTip(tip);
        setIsLoading(false);
      }
    } else {
      // Generate a new tip for today
      await generateSmartTip(today);
    }
  };

  const shouldRegenerateForContext = (completedCount) => {
    // Regenerate at key milestones: 0→1 (first task), 2→3 (crushing it mode)
    const lastCheckKey = 'dailyTip_lastCompletedCount';
    const lastCount = parseInt(localStorage.getItem(lastCheckKey) || '0', 10);
    
    // Store current count
    localStorage.setItem(lastCheckKey, completedCount.toString());

    // Regenerate when it's evening and we haven't generated an evening tip yet
    const eveningKey = 'dailyTip_eveningGenerated';
    const eveningDate = localStorage.getItem(eveningKey);
    const today = getLocalDateString();
    if (isEvening() && eveningDate !== today) {
      localStorage.setItem(eveningKey, today);
      return true; // Switch to "Tonight's Tip"
    }
    
    // Regenerate when crossing thresholds
    if (lastCount === 0 && completedCount >= 1) return true; // Got started!
    if (lastCount < 3 && completedCount >= 3) return true; // Crushing it!
    
    return false;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const today = getLocalDateString();
    
    // Delete today's tip
    const existingTips = await base44.entities.DailyTip.filter({ shown_date: today });
    for (const tip of existingTips) {
      await base44.entities.DailyTip.delete(tip.id);
    }
    
    // Generate new one
    await generateSmartTip(today);
    setIsRefreshing(false);
  };

  const generateSmartTip = async (today) => {
    try {
      const newTip = await generateSmartTipForUser(today);
      setTodaysTip(newTip);
    } catch (error) {
      console.error("Error generating tip:", error);
      const fallbackTip = await base44.entities.DailyTip.create({
        tip_text: "Stuck in cement? Stand up, do 5 jumping jacks (seriously), then immediately dive into your task. Movement gets the blood flowing and tricks your brain into action mode.",
        category: "focus",
        shown_date: today,
        prompt_version: CURRENT_PROMPT_VERSION
      });
      setTodaysTip(fallbackTip);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
        specialMode === 'normal' ? (
          theme === 'minimalist' 
            ? 'bg-white/80 backdrop-blur-sm' 
            : theme === 'dark'
              ? 'bg-gray-800 border border-gray-700'
              : 'bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-yellow-200'
        ) : ''
      }`}>
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-amber-600" />
        </CardContent>
      </Card>
    );
  }

  if (!todaysTip) return null;

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-white/80 backdrop-blur-sm' 
          : theme === 'dark'
            ? 'bg-gray-800 border border-gray-700'
            : 'bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-yellow-200'
      ) : ''
    }`}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center justify-between text-lg ${theme === 'dark' ? 'text-white' : ''}`}>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${
              specialMode !== 'normal' ? '' :
              theme === 'minimalist' ? 'bg-amber-100' : theme === 'dark' ? 'bg-amber-900/30' : 'bg-yellow-200'
            }`}>
              <Sparkles className={`w-4 h-4 ${
                specialMode !== 'normal' ? '' :
                theme === 'minimalist' ? 'text-amber-600' : theme === 'dark' ? 'text-amber-400' : 'text-yellow-700'
              }`} />
            </div>
            <span>{isEvening() ? "Tonight's Tip" : "Today's Tip"}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 w-8"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`leading-relaxed ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
          {todaysTip.tip_text}
        </p>
      </CardContent>
    </Card>
  );
}