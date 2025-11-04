import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const CURRENT_PROMPT_VERSION = 2; // Increment this when you update the prompt

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

      // Use Base44's InvokeLLM for smart tips
      const prompt = `You are a neuroscience-informed ADHD coach. Generate ONE evidence-based tip.

CRITICAL REQUIREMENTS:
1. MUST reference real neuroscience (prefrontal cortex, dopamine, working memory, executive function)
2. Use inclusive "our brains" / "we" language - never say "ADHD brains" or "people with ADHD"
3. Explain WHY it happens (the brain mechanism)
4. Offer ONE specific, actionable strategy
5. 2-3 sentences MAX
6. NEVER mention time of day, current energy, or "right now"
7. Sound like a friend, not a textbook
8. Focus on ONE specific technique, not generic advice

CONTEXT (subtle influence only - don't explicitly mention these numbers):
- Active tasks: ${activeTasks.length}
- Snoozed tasks: ${snoozedTasks.length}
- Completed today: ${completedToday.length}
- Streak: ${currentStreak} days

EXAMPLES OF GOOD TIPS:
"Task initiation is harder when our prefrontal cortex needs extra activation energy. Physical movement increases dopamine and blood flow - literally stand up, do 3 jumping jacks, then start the task."

"If our brains crave novelty for motivation, that's dopamine regulation at work. Change ONE thing: new location, background music, or set a timer for an odd number like 17 minutes."

"Our brains hold about 30% less in working memory. Writing things down isn't a crutch - it's compensating for a real neurological difference. Externalize tasks immediately or they'll vanish."

"Time blindness happens when our brain's internal clock works differently. Use timers, alarms, and visual progress trackers - these create external time structure we can actually perceive."

"Breaking tasks into 2-minute steps works because we struggle with task sequencing. You're not resisting 'doing dishes' - you're resisting the 15 invisible steps. Make step 1 visible: 'Put 3 plates in sink.'"

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
        tip_text: "Task initiation is harder when our prefrontal cortex needs extra activation energy. Physical movement increases dopamine - literally stand up, walk to the task, touch it. Movement before thinking.",
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