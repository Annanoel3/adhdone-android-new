
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Trophy, Share2, Sparkles, Clock, Brain, CheckCircle2, Flame } from "lucide-react";
import { WeeklyChallenge } from "@/entities/WeeklyChallenge";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { sendOneSignalPush } from "@/functions/sendOneSignalPush";
import { User } from "@/entities/User";

const challengeIcons = {
  tasks_before_noon: Clock,
  daily_focus_sprint: Flame,
  daily_brain_dump: Brain,
  complete_5_tasks: CheckCircle2,
  maintain_streak: Trophy
};

const challengeColors = {
  tasks_before_noon: "from-blue-500 to-cyan-500",
  daily_focus_sprint: "from-orange-500 to-red-500",
  daily_brain_dump: "from-purple-500 to-pink-500",
  complete_5_tasks: "from-green-500 to-emerald-500",
  maintain_streak: "from-yellow-500 to-amber-500"
};

export default function WeeklyChallenges({ theme }) {
  const [challenges, setChallenges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    const currentWeekStart = getWeekStart();
    let weeklyChallenges = await WeeklyChallenge.filter({ 
      week_start: currentWeekStart,
      completed: false
    });

    // If no challenges exist for this week, create them
    if (weeklyChallenges.length === 0) {
      await createWeeklyChallenges(currentWeekStart);
      weeklyChallenges = await WeeklyChallenge.filter({ 
        week_start: currentWeekStart,
        completed: false
      });
    }

    setChallenges(weeklyChallenges);
    setIsLoading(false);
  };

  const getWeekStart = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split('T')[0];
  };

  const createWeeklyChallenges = async (weekStart) => {
    const challengeTemplates = [
      {
        challenge_type: "tasks_before_noon",
        title: "Morning Momentum",
        description: "Complete 3 tasks before noon, 5 days this week",
        target_count: 5
      },
      {
        challenge_type: "daily_focus_sprint",
        title: "Focus Sprint Streak",
        description: "Do a 25-minute focus timer every day this week",
        target_count: 7
      },
      {
        challenge_type: "daily_brain_dump",
        title: "Brain Dump Habit",
        description: "Add at least one idea to Parking Lot each day",
        target_count: 7
      }
    ];

    // Pick 2 random challenges for the week
    const shuffled = challengeTemplates.sort(() => 0.5 - Math.random());
    const selectedChallenges = shuffled.slice(0, 2);

    for (const template of selectedChallenges) {
      await WeeklyChallenge.create({
        ...template,
        week_start: weekStart,
        current_progress: 0,
        completed: false
      });
    }
  };

  const handleShareCompletion = async (challenge) => {
    try {
      const user = await User.me();
      const connections = await AccountabilityConnection.filter({ status: 'accepted' });
      const myConnections = connections.filter(c => 
        c.requester_email === user.email || c.recipient_email === user.email
      );

      for (const connection of myConnections) {
        const partnerEmail = connection.requester_email === user.email 
          ? connection.recipient_email 
          : connection.requester_email;

        await sendOneSignalPush({
          userEmail: partnerEmail,
          title: "🎯 Challenge Completed!",
          message: `${user.display_name || user.full_name} just completed: ${challenge.title}!`
        });
      }

      await WeeklyChallenge.update(challenge.id, { shared_with_partners: true });
      loadChallenges();
      alert("Shared with your accountability partners!");
    } catch (error) {
      console.error("Error sharing challenge:", error);
      alert("Failed to share. Please try again.");
    }
  };

  const specialMode = localStorage.getItem('special_mode') || 'normal';

  if (isLoading) {
    return null;
  }

  if (challenges.length === 0) {
    return null;
  }

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-white/90 backdrop-blur-sm' 
          : theme === 'dark'
            ? 'bg-gray-800/90 backdrop-blur-sm'
            : 'bg-gradient-to-br from-purple-50 to-orange-50'
      ) : ''
    }`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
          <Target className="w-5 h-5" />
          This Week's Challenges
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {challenges.map((challenge) => {
          const Icon = challengeIcons[challenge.challenge_type];
          const progress = Math.min((challenge.current_progress / challenge.target_count) * 100, 100);
          const isCompleted = challenge.current_progress >= challenge.target_count;

          return (
            <div
              key={challenge.id}
              className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} p-4 rounded-xl border-2 ${
                specialMode === 'normal' ? (
                  isCompleted
                    ? theme === 'minimalist'
                      ? 'bg-green-50 border-green-300'
                      : theme === 'dark'
                        ? 'bg-green-900/20 border-green-800'
                        : 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-300'
                    : theme === 'dark'
                      ? 'bg-gray-900/50 border-gray-700'
                      : 'bg-white border-gray-200'
                ) : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${challengeColors[challenge.challenge_type]}`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                      {challenge.title}
                    </h4>
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {challenge.description}
                    </p>
                  </div>
                </div>
                {isCompleted && (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    <Trophy className="w-3 h-3 mr-1" />
                    Done!
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                    {challenge.current_progress} / {challenge.target_count} days
                  </span>
                  <span className={`font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                    {Math.round(progress)}%
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {isCompleted && !challenge.shared_with_partners && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleShareCompletion(challenge)}
                  className="w-full mt-3"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share with Partners
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
