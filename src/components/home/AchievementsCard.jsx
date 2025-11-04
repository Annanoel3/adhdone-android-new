
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Star, Target, Flame, Zap, Crown } from "lucide-react";
import { Achievement } from "@/entities/Achievement";
import { User } from "@/entities/User";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3300];

export default function AchievementsCard({ theme }) {
  const [achievements, setAchievements] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
      
      const userAchievements = await Achievement.list('-unlocked_at', 5);
      setAchievements(userAchievements);
    } catch (error) {
      console.log("User not logged in");
    }
  };

  if (!user) return null;

  const currentLevel = user.level || 1;
  const totalPoints = user.total_points || 0;
  const nextLevelPoints = LEVEL_THRESHOLDS[currentLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevLevelPoints = LEVEL_THRESHOLDS[currentLevel - 1] || 0;
  const progressToNextLevel = ((totalPoints - prevLevelPoints) / (nextLevelPoints - prevLevelPoints)) * 100;

  const iconMap = {
    trophy: Trophy,
    star: Star,
    target: Target,
    flame: Flame,
    zap: Zap
  };

  const specialMode = localStorage.getItem('special_mode') || 'normal';

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
        <CardTitle className={`flex items-center gap-2 text-lg ${theme === 'dark' ? 'text-white' : ''}`}>
          <div className={`p-2 rounded-xl ${
            theme === 'minimalist' ? 'bg-amber-100' : theme === 'dark' ? 'bg-amber-900/30' : 'bg-yellow-200'
          }`}>
            <Trophy className={`w-4 h-4 ${
              theme === 'minimalist' ? 'text-amber-600' : theme === 'dark' ? 'text-amber-400' : 'text-yellow-700'
            }`} />
          </div>
          <span>Your Progress</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} p-4 rounded-xl ${
          specialMode === 'normal' ? (
            theme === 'minimalist' 
              ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-100' 
              : theme === 'dark'
                ? 'bg-gray-900/50 border border-gray-700'
                : 'bg-gradient-to-r from-yellow-100 to-orange-100 border border-yellow-300'
          ) : ''
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Crown className={`w-5 h-5 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
              <span className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Level {currentLevel}
              </span>
            </div>
            <Badge className={theme === 'dark' ? 'bg-amber-900/50 text-amber-300 border-amber-800' : 'bg-amber-100 text-amber-700'}>
              {totalPoints} points
            </Badge>
          </div>
          <Progress 
            value={progressToNextLevel} 
            className={`h-2 ${
              theme === 'minimalist' 
                ? '[&>div]:bg-amber-500' 
                : theme === 'dark'
                  ? 'bg-gray-800 [&>div]:bg-amber-500'
                  : '[&>div]:bg-gradient-to-r [&>div]:from-yellow-500 [&>div]:to-orange-500'
            }`}
          />
          <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {nextLevelPoints - totalPoints} points to Level {currentLevel + 1}
          </p>
        </div>

        {achievements.length > 0 && (
          <div className="space-y-2">
            <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
              Recent Achievements
            </h4>
            {achievements.slice(0, 3).map((achievement) => {
              const IconComponent = iconMap[achievement.icon] || Star;
              return (
                <div
                  key={achievement.id}
                  className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} flex items-center gap-3 p-3 rounded-lg ${
                    specialMode === 'normal' ? (
                      theme === 'minimalist' 
                        ? 'bg-white border border-gray-100' 
                        : theme === 'dark'
                          ? 'bg-gray-900/50 border border-gray-700'
                          : 'bg-gradient-to-r from-white to-yellow-50 border border-yellow-200'
                    ) : ''
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    theme === 'minimalist' ? 'bg-amber-100' : theme === 'dark' ? 'bg-amber-900/30' : 'bg-yellow-200'
                  }`}>
                    <IconComponent className={`w-4 h-4 ${
                      theme === 'minimalist' ? 'text-amber-600' : theme === 'dark' ? 'text-amber-400' : 'text-yellow-700'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {achievement.title}
                    </p>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {achievement.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    +{achievement.points}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
