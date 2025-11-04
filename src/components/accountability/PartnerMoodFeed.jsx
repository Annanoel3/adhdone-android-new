import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Heart, Sparkles, Battery, BatteryLow, Zap } from "lucide-react";
import { MoodCheckIn } from "@/entities/MoodCheckIn";
import { MoodReaction } from "@/entities/MoodReaction";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { User } from "@/entities/User";

const REACTION_EMOJIS = ["💪", "❤️", "👏", "🔥", "⭐", "🤗"];

const moodIcons = {
  focused: { icon: Zap, color: "text-blue-600", bg: "bg-blue-100" },
  low_energy: { icon: BatteryLow, color: "text-gray-600", bg: "bg-gray-100" },
  distracted: { icon: Sparkles, color: "text-purple-600", bg: "bg-purple-100" },
  motivated: { icon: Battery, color: "text-green-600", bg: "bg-green-100" },
  overwhelmed: { icon: Heart, color: "text-red-600", bg: "bg-red-100" }
};

export default function PartnerMoodFeed({ theme, user }) {
  const [partnerMoods, setPartnerMoods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadPartnerMoods();
    }
  }, [user]);

  const loadPartnerMoods = async () => {
    setIsLoading(true);
    try {
      // Get user's accountability partners
      const connections = await AccountabilityConnection.filter({ status: 'accepted' });
      const myConnections = connections.filter(c => 
        c.requester_email === user.email || c.recipient_email === user.email
      );

      const partnerEmails = myConnections.map(c => 
        c.requester_email === user.email ? c.recipient_email : c.requester_email
      );

      // Get all shared mood check-ins
      const allMoods = await MoodCheckIn.filter({ shared_with_partners: true }, '-check_in_date', 20);
      
      // Filter to only partner moods from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const partnerMoodsFiltered = allMoods.filter(mood => {
        const isPartner = partnerEmails.includes(mood.created_by);
        const isRecent = new Date(mood.check_in_date) >= sevenDaysAgo;
        return isPartner && isRecent;
      });

      // Get user details and reactions for each mood
      const allUsers = await User.list();
      const moodsWithDetails = await Promise.all(
        partnerMoodsFiltered.map(async (mood) => {
          const partner = allUsers.find(u => u.email === mood.created_by);
          const reactions = await MoodReaction.filter({ mood_check_in_id: mood.id });
          const userReaction = reactions.find(r => r.reactor_email === user.email);
          
          return {
            ...mood,
            partner_name: partner?.display_name || partner?.full_name || 'Partner',
            partner_picture: partner?.profile_picture_url,
            reactions: reactions,
            user_reacted: !!userReaction
          };
        })
      );

      setPartnerMoods(moodsWithDetails);
    } catch (error) {
      console.error("Error loading partner moods:", error);
    }
    setIsLoading(false);
  };

  const handleReact = async (moodId, emoji) => {
    try {
      // Check if already reacted
      const existing = await MoodReaction.filter({
        mood_check_in_id: moodId,
        reactor_email: user.email
      });

      if (existing.length > 0) {
        // Update reaction
        await MoodReaction.update(existing[0].id, { emoji });
      } else {
        // Create new reaction
        await MoodReaction.create({
          mood_check_in_id: moodId,
          reactor_email: user.email,
          reactor_name: user.display_name || user.full_name,
          emoji
        });
      }

      loadPartnerMoods();
    } catch (error) {
      console.error("Error reacting to mood:", error);
    }
  };

  if (partnerMoods.length === 0 && !isLoading) {
    return (
      <Card className={`border-none shadow-md ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-6 text-center">
          <Heart className={`w-12 h-12 mx-auto mb-3 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            No recent mood check-ins from your partners
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-none shadow-lg ${
      theme === 'dark' ? 'bg-gray-800' : 'bg-white'
    }`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
          <Heart className="w-5 h-5" />
          Partner Check-Ins
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {partnerMoods.map((mood) => {
          const MoodIcon = moodIcons[mood.mood]?.icon || Heart;
          const iconColor = moodIcons[mood.mood]?.color || "text-gray-600";
          const iconBg = moodIcons[mood.mood]?.bg || "bg-gray-100";

          return (
            <div
              key={mood.id}
              className={`p-4 rounded-lg ${
                theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={mood.partner_picture} />
                  <AvatarFallback className="bg-purple-100 text-purple-700">
                    {mood.partner_name[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`font-medium ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                      {mood.partner_name}
                    </p>
                    <div className={`p-1 rounded-full ${iconBg}`}>
                      <MoodIcon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                  </div>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {new Date(mood.check_in_date).toLocaleDateString()}
                  </p>
                  {mood.focus_note && (
                    <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      "{mood.focus_note}"
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                      Energy:
                    </span>
                    {"⚡".repeat(mood.energy_level)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {REACTION_EMOJIS.map((emoji) => (
                  <Button
                    key={emoji}
                    size="sm"
                    variant={mood.user_reacted ? "secondary" : "outline"}
                    onClick={() => handleReact(mood.id, emoji)}
                    className="text-lg p-2 h-auto"
                  >
                    {emoji}
                  </Button>
                ))}
                {mood.reactions.length > 0 && (
                  <div className={`ml-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {mood.reactions.map((r, i) => (
                      <span key={i}>{r.emoji}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}