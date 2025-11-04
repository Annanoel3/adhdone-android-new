import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User } from "@/entities/User";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, TrendingUp, Calendar, UserMinus, Loader2, Flame, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { sendPokeNotification } from "../utils/notificationHelper";

export default function AccountabilityPartners({ theme, user }) {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [doubleStreaks, setDoubleStreaks] = useState({});

  useEffect(() => {
    if (user) {
      loadPartners();
    }
  }, [user]);

  const loadPartners = async () => {
    setIsLoading(true);
    try {
      const connections = await AccountabilityConnection.filter({ status: 'accepted' });
      
      const myConnections = connections.filter(c => 
        c.requester_email === user.email || c.recipient_email === user.email
      );

      // Build partner data from connection records directly
      const partnerData = myConnections.map(connection => {
        const isRequester = connection.requester_email === user.email;
        return {
          email: isRequester ? connection.recipient_email : connection.requester_email,
          display_name: isRequester ? connection.recipient_name : connection.requester_name,
          profile_picture_url: isRequester ? connection.recipient_picture : connection.requester_picture,
          connection: connection
        };
      });

      setPartners(partnerData);

      const { DailySummary } = await import('@/entities/DailySummary');
      const mySummaries = await DailySummary.list('-date', 7);
      const myStreak = mySummaries[0]?.streak_days || 0;
      
      const streaks = {};
      for (const partner of partnerData) {
        if (myStreak >= 3 && partner.connection?.partner_streak >= 3) {
          streaks[partner.email] = {
            days: Math.min(myStreak, partner.connection.partner_streak),
            isDouble: true
          };
        }
      }
      setDoubleStreaks(streaks);

      const { ChatMessage } = await import('@/entities/ChatMessage');
      const counts = {};
      for (const partner of partnerData) {
        if (partner.connection && user) {
          const messages = await ChatMessage.filter({
            connection_id: partner.connection.id,
            sender_email: partner.email,
            recipient_email: user.email,
            read_by_recipient: false
          });
          counts[partner.email] = messages.length;
        } else {
          counts[partner.email] = 0;
        }
      }
      setUnreadCounts(counts);

    } catch (error) {
      console.error("Error loading partners:", error);
    }
    setIsLoading(false);
  };

  const handleRemovePartner = async (partnerEmail) => {
    if (!confirm('Are you sure you want to remove this accountability partner?')) return;
    
    try {
      const connections = await AccountabilityConnection.filter({ status: 'accepted' });
      const connection = connections.find(c => 
        (c.requester_email === user.email && c.recipient_email === partnerEmail) ||
        (c.recipient_email === user.email && c.requester_email === partnerEmail)
      );

      if (connection) {
        await AccountabilityConnection.delete(connection.id);
        loadPartners();
      }
    } catch (error) {
      console.error("Error removing partner:", error);
      alert("Failed to remove partner");
    }
  };

  const handlePoke = async (partner) => {
    try {
      await sendPokeNotification(partner.email, user.display_name || user.full_name);
      
      // Trigger local notification for visual feedback
      window.dispatchEvent(new CustomEvent('userPoked', {
        detail: { senderName: user.display_name || user.full_name }
      }));
      
      alert(`Poked ${partner.display_name}! They'll get a notification.`);
    } catch (error) {
      console.error("Error sending poke:", error);
      alert("Failed to send poke. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-purple-600" />
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Loading partners...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (partners.length === 0) {
    return (
      <Card className={`border-none shadow-lg ${
        theme === 'minimalist' 
          ? 'bg-gradient-to-br from-purple-50 to-blue-50' 
          : theme === 'dark'
            ? 'bg-gray-800'
            : 'bg-gradient-to-br from-purple-100 to-pink-100'
      }`}>
        <CardContent className="p-12 text-center">
          <MessageCircle className={`w-16 h-16 mx-auto mb-4 ${
            theme === 'minimalist' ? 'text-purple-600' : theme === 'dark' ? 'text-purple-400' : 'text-purple-700'
          }`} />
          <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
            No Accountability Partners Yet
          </h3>
          <p className={`mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Connect with others to stay motivated and accountable!
          </p>
          <Button
            onClick={() => navigate(createPageUrl("Accountability") + "?tab=find")}
            className={theme === 'minimalist' 
              ? 'bg-purple-600 hover:bg-purple-700' 
              : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }
          >
            Find Partners
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {partners.map((partner) => {
        const doubleStreak = doubleStreaks[partner.email];
        
        return (
          <Card key={partner.email} className={`border-none shadow-md hover:shadow-lg transition-all ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            <CardContent className="p-6">
              {doubleStreak?.isDouble && (
                <div className={`mb-4 p-3 rounded-lg ${
                  theme === 'minimalist'
                    ? 'bg-gradient-to-r from-orange-100 to-red-100 border border-orange-300'
                    : theme === 'dark'
                      ? 'bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-800'
                      : 'bg-gradient-to-r from-orange-200 to-red-200 border border-orange-400'
                }`}>
                  <div className="flex items-center gap-2 text-center justify-center">
                    <Flame className="w-5 h-5 text-orange-600 animate-pulse" />
                    <span className={`font-bold ${theme === 'dark' ? 'text-orange-300' : 'text-orange-900'}`}>
                      🔥 Double Streak! Both on fire for {doubleStreak.days} days! 🔥
                    </span>
                    <Flame className="w-5 h-5 text-orange-600 animate-pulse" />
                  </div>
                </div>
              )}
              
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Avatar 
                    className="w-16 h-16 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate(createPageUrl("UserProfile") + `?email=${partner.email}`)}
                  >
                    <AvatarImage src={partner.profile_picture_url} className="object-cover" />
                    <AvatarFallback className={
                      theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
                    }>
                      {partner.display_name?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(createPageUrl("Chat") + `?partner=${partner.email}`)}
                      className={`relative px-2 ${unreadCounts[partner.email] > 0 ? 'border-2 border-blue-500' : ''}`}
                      title="Chat"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {unreadCounts[partner.email] > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                          {unreadCounts[partner.email]}
                        </span>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePoke(partner)}
                      className={`px-2 ${
                        theme === 'minimalist'
                          ? 'border-purple-300 hover:bg-purple-50 text-purple-700'
                          : theme === 'dark'
                            ? 'border-purple-700 hover:bg-purple-900/20 text-purple-400'
                            : 'border-purple-400 hover:bg-purple-100 text-purple-700'
                      }`}
                      title="Send poke"
                    >
                      <Zap className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1">
                  <h3 className={`font-semibold text-lg mb-1 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                    {partner.display_name || partner.email.split('@')[0]}
                  </h3>
                  <p className={`text-sm mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {partner.email}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {partner.connection?.created_date && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        Connected {new Date(partner.connection.created_date).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemovePartner(partner.email)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <UserMinus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}