import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal, Crown, TrendingUp, Eye, EyeOff, Loader2, Info } from "lucide-react";
import { User } from "@/entities/User";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getLeaderboardData } from "@/functions/getLeaderboardData";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function Leaderboard() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');
  const [leaders, setLeaders] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [currentLoggedInUserEmail, setCurrentLoggedInUserEmail] = useState(null);
  const [isOnLeaderboard, setIsOnLeaderboard] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadLeaderboard = async () => {
    setIsLoading(true);
    try {
      const authenticatedUser = await User.me();
      setCurrentLoggedInUserEmail(authenticatedUser.email);
      setIsOnLeaderboard(authenticatedUser.show_on_leaderboard || false);
      setIsAnonymous(authenticatedUser.leaderboard_anonymous !== false);

      const response = await getLeaderboardData();
      const data = response.data;
      
      const processedLeaders = data.leaderboard.map(leader => ({
        ...leader,
        display_name: leader.display_name || leader.name,
        profile_picture_url: leader.profile_picture_url || leader.profile_picture,
        isCurrentUser: leader.email === authenticatedUser.email,
      }));

      let currentUserLeaderboardEntry = null;
      if (data.currentUser) {
        currentUserLeaderboardEntry = {
          ...data.currentUser,
          display_name: data.currentUser.display_name || data.currentUser.name,
          profile_picture_url: data.currentUser.profile_picture_url || data.currentUser.profile_picture,
        };
      }

      setLeaders(processedLeaders || []);
      setCurrentUserData(currentUserLeaderboardEntry);
    } catch (error) {
      console.error("Error loading leaderboard:", error);
    }
    setIsLoading(false);
  };

  const toggleLeaderboard = async () => {
    try {
      await User.updateMyUserData({ show_on_leaderboard: !isOnLeaderboard });
      setIsOnLeaderboard(!isOnLeaderboard);
      setTimeout(() => loadLeaderboard(), 500);
    } catch (error) {
      console.error("Error updating leaderboard setting:", error);
    }
  };

  const toggleAnonymous = async () => {
    try {
      await User.updateMyUserData({ leaderboard_anonymous: !isAnonymous });
      setIsAnonymous(!isAnonymous);
      setTimeout(() => loadLeaderboard(), 500);
    } catch (error) {
      console.error("Error updating anonymous setting:", error);
    }
  };

  return (
    <div className="p-4 md:p-8 w-full" style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
      <div className="max-w-6xl mx-auto">
        <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
          specialMode === 'normal' ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-blue-50 to-purple-50'
          ) : ''
        }`}>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <h1 className={`text-3xl font-bold ${
                  specialMode !== 'normal' ? `${specialMode}-title` :
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Leaderboard
                </h1>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`p-1 rounded-full hover:bg-gray-100 transition-colors ${
                      theme === 'dark' ? 'hover:bg-gray-700' : ''
                    }`}>
                      <Info className={`w-5 h-5 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-semibold">About Leaderboard</h4>
                      <p className="text-sm text-gray-600">
                        See how you rank among other ADHDone users based on your productivity. You can control your visibility in the privacy settings - stay anonymous or show your progress!
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <p className={
                specialMode !== 'normal' ? `${specialMode}-text` :
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }>
                See where you rank
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
          specialMode === 'normal' ? (
            theme === 'minimalist' 
              ? 'bg-blue-50/50' 
              : theme === 'dark'
                ? 'bg-gray-800/50'
                : 'bg-gradient-to-br from-blue-100/50 to-purple-100/50'
          ) : ''
        }`}>
          <CardHeader>
            <CardTitle className={`text-lg ${theme === 'dark' ? 'text-white' : ''}`}>
              Your Privacy Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isOnLeaderboard ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                <div>
                  <Label className={theme === 'dark' ? 'text-white' : ''}>Show on Leaderboard</Label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {isOnLeaderboard ? 'You are visible on the leaderboard' : 'You are not visible on the leaderboard'}
                  </p>
                </div>
              </div>
              <Switch checked={isOnLeaderboard} onCheckedChange={toggleLeaderboard} />
            </div>

            {isOnLeaderboard && (
              <div className="flex items-center justify-between">
                <div>
                  <Label className={theme === 'dark' ? 'text-white' : ''}>Show as Anonymous</Label>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {isAnonymous ? 'Shown as Player #...' : 'Shown with your display name'}
                  </p>
                </div>
                <Switch checked={isAnonymous} onCheckedChange={toggleAnonymous} />
              </div>
            )}

            {currentUserData && currentUserData.rank && (
              <div className={`p-4 rounded-lg ${
                specialMode !== 'normal' ? `${specialMode}-card` : (
                  theme === 'minimalist' 
                    ? 'bg-white border border-gray-200' 
                    : theme === 'dark'
                      ? 'bg-gray-900 border border-gray-700'
                      : 'bg-white border border-purple-200'
                )
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Your Rank Today</p>
                    <p className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      #{currentUserData.rank}
                    </p>
                  </div>
                  <Badge className="text-lg">
                    {currentUserData.points} pts
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg ${
          specialMode === 'normal' ? (
            theme === 'minimalist' 
              ? 'bg-white/90 backdrop-blur-sm' 
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-yellow-50 to-orange-50'
          ) : ''
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <TrendingUp className="w-5 h-5" />
              Today's Top Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : leaders.length === 0 ? (
              <div className="text-center py-12">
                <Trophy className={`w-16 h-16 mx-auto mb-4 ${
                  theme === 'dark' ? 'text-gray-600' : 'text-gray-300'
                }`} />
                <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  No players on the leaderboard yet. Be the first!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {leaders.map((leader, index) => (
                  <div
                    key={leader.email}
                    className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                      leader.isCurrentUser
                        ? theme === 'minimalist'
                          ? 'bg-green-50 border-2 border-green-300'
                          : theme === 'dark'
                            ? 'bg-green-900/20 border-2 border-green-800'
                            : 'bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300'
                        : theme === 'dark'
                          ? 'bg-gray-800/50 hover:bg-gray-800'
                          : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`font-bold text-lg w-8 text-center flex-shrink-0 ${
                        index === 0 ? 'text-yellow-500' :
                        index === 1 ? 'text-gray-400' :
                        index === 2 ? 'text-orange-600' :
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {index + 1}
                      </div>

                      <Link to={createPageUrl("UserProfile") + `?email=${leader.email}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="w-12 h-12 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                          {leader.profile_picture_url ? (
                            <AvatarImage src={leader.profile_picture_url} className="object-cover" />
                          ) : (
                            <AvatarFallback className={
                              theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                            }>
                              {leader.display_name?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                          )}
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold truncate hover:underline ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                            {leader.display_name || 'Anonymous'}
                            {leader.isCurrentUser && <span className="text-sm text-green-600 ml-2">(You)</span>}
                          </h3>
                          <div className="flex gap-2 flex-wrap mt-1">
                            <Badge variant="outline" className="text-xs">
                              Level {leader.level}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    </div>
                    <Badge className={leader.rank <= 3 ? 'bg-yellow-100 text-yellow-700' : ''}>
                      {leader.points} pts
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}