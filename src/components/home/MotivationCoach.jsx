import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvokeLLM } from "@/integrations/Core";
import { User } from "@/entities/User";
import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { motion, AnimatePresence } from "framer-motion";

export default function MotivationCoach({ theme }) {
  const [message, setMessage] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkForMotivation = async () => {
      try {
        const user = await User.me();
        const today = new Date().toISOString().split('T')[0];
        
        // Check if we've shown a message today
        if (user.last_motivation_date === today) {
          return;
        }

        // Show motivation after a delay
        setTimeout(() => {
          generateMotivation();
        }, 10000); // 10 seconds after page load
      } catch (error) {
        console.log("User not logged in");
      }
    };

    const generateMotivation = async () => {
      const user = await User.me();
      const today = new Date().toISOString().split('T')[0];
      
      // Get TODAY's completed tasks only
      const allTasks = await Task.list();
      const completedToday = allTasks.filter(t => {
        if (t.status !== 'completed' || !t.completed_at) return false;
        const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
        return completedDate === today;
      });
      
      const activeTasks = allTasks.filter(t => t.status === 'active');
      
      const summaries = await DailySummary.list('-date', 7);
      const recentStreak = summaries[0]?.streak_days || 0;

      const prompt = `You are a motivational coach for someone with ADHD. Generate a brief, personalized, encouraging message based on their current situation.

Context:
- Active tasks: ${activeTasks.length}
- Tasks completed TODAY: ${completedToday.length}
- Current streak: ${recentStreak} days
- User level: ${user.level || 1}
- Total points: ${user.total_points || 0}

Generate a warm, authentic, ADHD-friendly motivational message (2-3 sentences max). 
- If they have no tasks, encourage them to start
- If they're on a streak, celebrate it
- If they've been struggling, offer compassionate encouragement
- Be genuine, not cheesy or overly positive

DO NOT:
- Give generic advice
- Use clichés like "you got this"
- Be preachy or condescending`;

      const response = await InvokeLLM({ prompt });
      
      setMessage(response);
      setIsVisible(true);
      
      // Save that we showed a message today
      await User.updateMyUserData({ 
        last_motivation_message: response,
        last_motivation_date: today
      });
    };

    checkForMotivation();
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible || !message) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-6 right-6 max-w-md z-50"
      >
        <Card className={`border-none shadow-2xl ${
          theme === 'minimalist' 
            ? 'bg-white' 
            : 'bg-gradient-to-br from-purple-100 via-pink-100 to-orange-100'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${
                theme === 'minimalist' ? 'bg-purple-100' : 'bg-white/80'
              }`}>
                <Sparkles className={`w-6 h-6 ${
                  theme === 'minimalist' ? 'text-purple-600' : 'text-purple-700'
                }`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">Your Coach</h3>
                <p className="text-gray-700 leading-relaxed">{message}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}