
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
      const prompt = `You are a brain-science-savvy friend sharing productivity tips. Generate ONE actionable tip grounded in real neuroscience.

CRITICAL REQUIREMENTS:
1. MUST reference actual brain science (prefrontal cortex, dopamine, working memory, etc.) but explain it casually
2. Write in second person ("you") - conversational, friendly, relatable
3. 2-3 sentences MAX - get to the point fast
4. Give ONE specific, concrete action someone can try right now
5. NEVER mention time of day, current energy, or "right now" 
6. Acknowledge the struggle first, then explain the brain mechanism, then give the solution
7. Sound like a smart friend, not a doctor or therapist
8. Make it universal - helpful for anyone with a busy brain, not targeting a specific group

CONTEXT (use subtly - don't explicitly mention these numbers):
- Active tasks: ${activeTasks.length}
- Snoozed tasks: ${snoozedTasks.length}
- Completed today: ${completedToday.length}
- Streak: ${currentStreak} days

EXAMPLES OF THE EXACT TONE I WANT:

"Starting feels impossible when you can't see the steps? That's your brain struggling with task initiation because the prefrontal cortex needs a clear first action. Pick ONE tiny step - like 'put 3 dishes in sink' instead of 'clean kitchen' - set a 10-minute timer, and just do that one thing."

"Waiting for deadline pressure leaves you scrambling with no quality time. Your brain craves urgency for dopamine, so manufacture it - ask someone to review your work 2 days early, or bet a friend $20 you'll finish by Friday. Artificial deadlines work just as well as real ones."

"Boring task making you want to crawl out of your skin? That's low dopamine from lack of novelty. Keep the task the same but change everything around it - new coffee shop, colored pens, work with a friend, or relate it to something you actually care about."

"Half-done projects feel harder than new ones because novelty wears off and your brain stops getting that dopamine hit. When you can't change the task, change the context - different location, different time of day, audiobook instead of reading, or get someone to work alongside you."

"Brain holding too many things at once? Working memory maxes out at about 4 items, so anything beyond that just... disappears. Write every task down immediately - it's not a crutch, it's how you free up mental space for actually doing the work."

"Can't get started? That's because the prefrontal cortex needs activation energy. Physical movement literally increases blood flow and dopamine - stand up, do 5 jumping jacks, then immediately start the task while your brain is revved up."

"Task feels massive and overwhelming? Big tasks trigger avoidance because your brain can't sequence all the steps. Break it into 2-minute chunks - not 'do taxes,' but 'open tax software and find last year's return.' That's it. One tiny step."

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
        tip_text: "Can't get started? Physical movement increases blood flow and dopamine to the prefrontal cortex. Stand up, do 5 jumping jacks, then immediately start your task while your brain is revved up.",
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
