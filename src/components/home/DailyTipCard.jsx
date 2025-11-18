import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const CURRENT_PROMPT_VERSION = 4; // Increment this when you update the prompt

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
    
    // If we have a tip but it's an old version, delete it and regenerate
    if (existingTips.length > 0) {
      const tip = existingTips[0];
      if (!tip.prompt_version || tip.prompt_version < CURRENT_PROMPT_VERSION) {
        console.log('🔄 [DAILY TIP] Old prompt version detected, regenerating...');
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

      const activeTasks = tasks.filter(t => t.status === 'active');
      const snoozedTasks = tasks.filter(t => t.status === 'snoozed');
      const completedToday = tasks.filter(t => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
        return completedDate === today;
      });

      const currentStreak = summaries.length > 0 ? summaries[0].streak_days || 0 : 0;

      // Determine context-aware tone based on progress
      let contextualGuidance = '';
      if (completedToday.length >= 3) {
        contextualGuidance = `
TONE: They've completed ${completedToday.length} tasks today - they're ON FIRE! Give an encouraging tip about momentum, celebrating wins, or maintaining energy. NO tips about getting started or struggling - they're already crushing it!

Examples:
"You're on a roll with ${completedToday.length} wins today! Ride that dopamine wave - your brain's loving this success pattern. Take a victory lap (literal 5-minute walk counts), then pick what's next while you're still buzzing."

"${completedToday.length} tasks down? That's not luck, that's momentum. Your brain just proved it CAN focus. Keep the streak alive by tackling one more small thing before the day ends - future you will thank present you."

"Look at you go! ${completedToday.length} done today. When you're in the zone like this, your brain's actually rewiring itself to find productivity easier. Celebrate this win, then consider: what ONE more thing would make tomorrow you super grateful?"`;
      } else if (completedToday.length >= 1) {
        contextualGuidance = `
TONE: They've completed ${completedToday.length} task(s) today - good start! Give a tip about building on that momentum or keeping it going. Be encouraging but not over-the-top.

Examples:
"Nice! You already checked one off today. That first task is the hardest because it breaks the inertia. Your brain's warmed up now - what's the next tiny win you can grab before the momentum fades?"

"You've proven you can do stuff today - ${completedToday.length} down! Now ride that little spark of motivation while it's hot. Pick something that'll take under 10 minutes and knock it out before your brain remembers how to procrastinate."`;
      } else {
        contextualGuidance = `
TONE: They haven't completed anything yet today. Give a gentle, motivating tip about getting started. NO judgment - just helpful nudges.

Examples:
"Drowning in tasks and haven't finished anything? Start with just one small win - pick something that takes less than 5 minutes. It's like giving your motivation a shot of espresso; once you complete it, you'll feel ready to tackle the next one!"

"Staring at a task like it's a cryptic puzzle? Your brain needs a clear first step to get moving. Try this: write down literally the FIRST tiny thing (not 'do laundry' but 'pick up the basket'), set a timer for 5 minutes, and see what happens."`;
      }

      // Use Base44's InvokeLLM for smart tips
      const prompt = `You're that friend who gets it - the one who makes everything feel possible with a little humor and real talk. Generate ONE quick, helpful tip.

CRITICAL REQUIREMENTS:
1. Keep it SHORT - 1-2 sentences max
2. Add a touch of humor or wit (but stay genuinely helpful)
3. Talk like a warm, funny therapist - not clinical, just real
4. Give ONE specific thing someone can actually do
5. Skip the heavy brain science - just explain WHY it works in plain English
6. Make it feel like texting advice to a friend who's struggling

${contextualGuidance}

CONTEXT:
- Active tasks: ${activeTasks.length}
- Snoozed tasks: ${snoozedTasks.length}
- Completed today: ${completedToday.length}
- Streak: ${currentStreak} days

OTHER EXAMPLES OF THE VIBE (use for inspiration, not literally):

"Waiting until panic mode to start? (Same.) Your brain gets hooked on that last-minute adrenaline rush. Trick it by creating fake urgency - tell someone you'll send them the thing by tomorrow, or bet yourself $20 you'll finish by Friday."

"Task so boring you'd rather watch paint dry? Change everything AROUND the task - different spot, fun music, work near a friend, fancy drink. Your brain craves novelty, so give it that without changing what you actually need to do."

"Brain juggling seventeen things and dropping them all? You can only hold about 4 things at once before stuff just... vanishes. Do a brain dump - write every single thing down so your mind can stop white-knuckling the list and actually focus on doing."

"Motivation taking a permanent vacation? That's cool - motivation is flaky anyway. Start with just 2 minutes of the easiest possible version of the task. Action creates momentum, not the other way around."

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