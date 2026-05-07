import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const CURRENT_PROMPT_VERSION = 5; // Increment this when you update the prompt

export default function DailyTipCard({ theme }) {
  const [todaysTip, setTodaysTip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const specialMode = typeof localStorage !== 'undefined' ? localStorage.getItem('special_mode') : 'normal';

  useEffect(() => {
    loadTodaysTip();
  }, []);

  const loadTodaysTip = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if we already have a tip for today
    const existingTips = await base44.entities.DailyTip.filter({ shown_date: today });
    
    // Get current task completion count
    const tasks = await base44.entities.Task.list('-created_date', 20);
    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
      return completedDate === today;
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
    
    // Regenerate when crossing thresholds
    if (lastCount === 0 && completedCount >= 1) return true; // Got started!
    if (lastCount < 3 && completedCount >= 3) return true; // Crushing it!
    
    return false;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const today = new Date().toISOString().split('T')[0];
    
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
      const user = await base44.auth.me();
      const tasks = await base44.entities.Task.list('-created_date', 20);

      const summaries = await (async () => {
        try {
          return await base44.entities.DailySummary.list('-date', 7);
        } catch {
          return [];
        }
      })();

      const activeTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id);
      const snoozedTasks = tasks.filter(t => t.status === 'snoozed' && !t.parent_task_id);
      const completedToday = tasks.filter(t => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
        return completedDate === today;
      });

      const currentStreak = summaries.length > 0 ? summaries[0].streak_days || 0 : 0;

      // Read today's mood from check-in
      const todayDate = new Date().toISOString().split('T')[0];
      const moodDate = localStorage.getItem('today_mood_date');
      const todayMood = moodDate === todayDate ? localStorage.getItem('today_mood') : null;

      // Determine context-aware tone based on mood + progress
      let contextualGuidance = '';

      if (todayMood === 'not_great') {
        contextualGuidance = `
MOOD: The user said they're not feeling great about the day ahead. This is the most important thing to address.
TONE: Compassionate, zero pressure, focus on finding just ONE tiny foothold. Normalize struggling. Help them find the will to begin without guilt.
Examples:
"Rough start? That's okay - your only job right now is to do ONE tiny thing. Not the whole list. Just one. Pick the smallest possible task and let that be enough for this moment."
"Not feeling it today? That's your brain, not your worth. Try the 2-minute rule: work on something - anything - for just 2 minutes. You can stop after. But you probably won't."`;
      } else if (todayMood === 'feeling_ok') {
        contextualGuidance = `
MOOD: The user is feeling okay - not great, not amazing. Middle of the road.
TONE: Gentle encouragement. Help them turn "okay" into a quiet win. Steady, practical advice.
Examples:
"'Okay' is actually a great launching pad. Your brain isn't hyped up OR dragging - that's peak task-completion mode. Pick something medium-sized and just start."
"Feeling okay is underrated. No drama, no resistance - just you and the to-do list. A calm start often leads to a surprisingly productive day."`;
      } else if (todayMood === 'good') {
        contextualGuidance = `
MOOD: The user is feeling good today.
TONE: Positive and encouraging. Help them channel that good energy into tackling things that matter. Maybe nudge them toward a harder task they've been avoiding.
Examples:
"You're feeling good - use it! This is the perfect day to take on that one task you've been avoiding. Good energy is rare, don't waste it on easy stuff."
"Feeling good? Lean into it. Put your best energy toward your most meaningful task first, while the momentum is on your side."`;
      } else if (todayMood === 'lets_go') {
        contextualGuidance = `
MOOD: The user is fired up and ready to crush the day.
TONE: Match their energy! Celebrate it, give them tips on riding that momentum and making the most of peak motivation days.
Examples:
"You're fired up - love it! Strike while the iron is hot: batch your hardest tasks together while you're in this state. Motivation this good doesn't come every day."
"LET'S GO energy is precious. Make a quick list of your top 3 priorities and attack them in order. Don't let that drive get scattered - focus it!"`;
      } else if (completedToday.length >= 3) {
        contextualGuidance = `
TONE: They've completed ${completedToday.length} tasks today - they're ON FIRE! Give an encouraging tip about momentum.
Examples:
"You're on a roll with ${completedToday.length} wins today! Ride that dopamine wave - your brain's loving this success pattern."`;
      } else if (completedToday.length >= 1) {
        contextualGuidance = `
TONE: They've completed ${completedToday.length} task(s) today - good start! Keep it going.
Examples:
"Nice! You already checked one off today. Your brain's warmed up - what's the next tiny win you can grab?"`;
      } else {
        contextualGuidance = `
TONE: They haven't completed anything yet today. Gentle, no-judgment nudge to get started.
Examples:
"Start with just one small win - pick something that takes less than 5 minutes. Once you complete it, you'll feel ready to tackle the next one!"`;
      }

      // Use Base44's InvokeLLM for smart tips
      const prompt = `You're giving quick, practical advice to someone who needs help getting stuff done. Be warm and real - like texting a friend who's stuck.

      CRITICAL RULES:
      1. Keep it SHORT - 1-2 sentences max
      2. Be conversational and understanding (not clinical or diagnostic)
      3. One specific action they can take right now
      4. A touch of humor is good, but stay practical
      5. No "your ADHD brain" or othering language - just helpful tips anyone could use
      6. Make them feel understood, not analyzed

      ${contextualGuidance}

      CONTEXT:
      - Active tasks: ${activeTasks.length}
      - Snoozed tasks: ${snoozedTasks.length}
      - Completed today: ${completedToday.length}
      - Streak: ${currentStreak} days

      EXAMPLES OF THE VIBE:

      "Procrastinating until the last minute? Create fake urgency - tell a friend you'll send them your work by tomorrow. Sometimes you just need an audience to get moving."

      "Task too boring to start? Change the environment - move to a different spot, put on upbeat music, make a fancy drink. Sometimes your brain needs novelty more than motivation."

      "Drowning in your to-do list? Write everything down somewhere safe, then pick ONE thing. You can't hold it all in your head and actually do stuff at the same time."

      "Can't find the energy to start? Set a timer for 2 minutes and do the easiest possible version. Starting creates momentum - waiting for motivation doesn't."

      "Task feels overwhelming? Just do the first tiny step - open the document, grab the cleaning spray, pull out your phone. Once you start, continuing is easier."

      Return ONLY the tip text, nothing else.`;

      const tipText = await base44.integrations.Core.InvokeLLM({
        prompt: prompt
      });

      // Categorize the tip
      const categoryPrompt = `Categorize this tip into ONE category: "${tipText}"

Categories: focus, motivation, organization, self_care, time_management

Return ONLY the category name.`;

      const category = (await base44.integrations.Core.InvokeLLM({
        prompt: categoryPrompt
      })).trim().toLowerCase();

      const newTip = await base44.entities.DailyTip.create({
        tip_text: tipText,
        category: category,
        shown_date: today,
        prompt_version: CURRENT_PROMPT_VERSION
      });
      
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
            <span>Today's Tip</span>
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