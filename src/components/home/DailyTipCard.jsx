import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { generateSmartTipForUser, CURRENT_PROMPT_VERSION } from "../utils/dailyTipGenerator";
import { isTheirTipEvening, tipEveningLabel } from "../utils/reminderCopy";

// Their evening, from their quiet hours, not 5 PM on the clock: 5 PM is the
// start of the day for someone who sleeps days (Oct 12 2026).
const isEvening = () => isTheirTipEvening(new Date());

// Shown when a tip could not be generated (backend down, network gone). It is
// never saved: a saved fallback would sit there as "today's tip" until tomorrow
// even after the backend came back, which is exactly what happened Sept 18-20
// 2026. Kept as one constant so an old saved copy can be recognised and replaced.
const FALLBACK_TIP_TEXT = "Stuck in cement? Stand up, do 5 jumping jacks (seriously), then immediately dive into your task. Movement gets the blood flowing and tricks your brain into action mode.";

const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

import HomeSecretLink from "./HomeSecretLink";

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

  // A new tip every time a task gets finished (Anna, Oct 26 2026: "Can
  // today's tip update anytime a user finishes a task?"). Every way of
  // finishing one ends in a 'tasks-changed' event, so the card recounts
  // today's finished tasks on each and makes a fresh tip when the count went
  // up (a count going down is an Undo: the tip stays). A short wait lets the
  // save land and folds a quick run of taps into one tip. Tasks finished on
  // another page catch up the next time Home opens (loadTodaysTip).
  const recheck = useRef(null);
  const checking = useRef(false);
  useEffect(() => {
    const handler = () => {
      clearTimeout(recheck.current);
      recheck.current = setTimeout(() => { loadTodaysTip({ quiet: true }); }, 1500);
    };
    window.addEventListener('tasks-changed', handler);
    return () => {
      clearTimeout(recheck.current);
      window.removeEventListener('tasks-changed', handler);
    };
  }, []);

  // quiet: a recheck behind the card that is already showing a tip; the tip
  // on screen stays until the new one is ready (the refresh arrow spins).
  const loadTodaysTip = async ({ quiet = false } = {}) => {
    // One check at a time: a recheck that lands while a tip is being made
    // would delete it and make another.
    if (checking.current) return;
    checking.current = true;
    try {
      await loadTodaysTipNow({ quiet });
    } catch (error) {
      // A read that failed (phone offline, server hiccup) must not leave the
      // card spinning forever: keep the tip already on screen, or show the
      // fallback for this visit. The next open tries again.
      console.error("Error loading tip:", error);
      setTodaysTip(prev => prev || { tip_text: FALLBACK_TIP_TEXT, category: "focus", shown_date: getLocalDateString() });
      setIsRefreshing(false);
      setIsLoading(false);
    } finally {
      checking.current = false;
    }
  };

  const loadTodaysTipNow = async ({ quiet = false } = {}) => {
    const today = getLocalDateString();
    
    // Check if we already have a tip for today
    const existingTips = await base44.entities.DailyTip.filter({ shown_date: today });
    
    // Today's finished tasks, by the phone's own date. Steps of a task aren't
    // counted: checking off five steps is one task getting done, not five.
    const tasks = await base44.entities.Task.list('-created_date', 50);
    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at || t.parent_task_id) return false;
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
        shouldRegenerateForContext(completedToday) ||
        tip.tip_text === FALLBACK_TIP_TEXT;
      
      if (needsRegeneration) {
        console.log('🔄 [DAILY TIP] Regenerating tip (context changed or old version)...');
        if (quiet) setIsRefreshing(true);
        // The tip may already be gone (another open copy of the app got here
        // first). Seen on a real phone Oct 19 as "Entity DailyTip ... not found"
        // and it left the card stuck on loading. An already-gone tip is fine.
        await base44.entities.DailyTip.delete(tip.id).catch(() => {});
        await generateSmartTip(today);
        if (quiet) setIsRefreshing(false);
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
    const lastCheckKey = 'dailyTip_lastCompletedCount';
    const lastDayKey = 'dailyTip_lastCompletedDay';
    const today = getLocalDateString();
    // Yesterday's count means nothing today.
    const lastCount = localStorage.getItem(lastDayKey) === today
      ? parseInt(localStorage.getItem(lastCheckKey) || '0', 10)
      : 0;
    
    // Store current count
    localStorage.setItem(lastCheckKey, completedCount.toString());
    localStorage.setItem(lastDayKey, today);

    // Regenerate when it's evening and we haven't generated an evening tip yet
    const eveningKey = 'dailyTip_eveningGenerated';
    const eveningDate = localStorage.getItem(eveningKey);
    if (isEvening() && eveningDate !== today) {
      localStorage.setItem(eveningKey, today);
      return true; // Switch to "Tonight's Tip"
    }
    
    // One more task finished since the tip was made: a new tip for where
    // they are now (used to be only the first one and the third).
    return completedCount > lastCount;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const today = getLocalDateString();
    
    // Delete today's tip
    const existingTips = await base44.entities.DailyTip.filter({ shown_date: today });
    for (const tip of existingTips) {
      await base44.entities.DailyTip.delete(tip.id).catch(() => {});
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
      // Show the fallback for this visit only; the next open tries again.
      setTodaysTip({ tip_text: FALLBACK_TIP_TEXT, category: "focus", shown_date: today });
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
            <span>{isEvening() ? tipEveningLabel(new Date()) : "Today's Tip"}</span>
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
        <HomeSecretLink theme={theme} spot="tip" className="mt-2 text-right" />
      </CardContent>
    </Card>
  );
}