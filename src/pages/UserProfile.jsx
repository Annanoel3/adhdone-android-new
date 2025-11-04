import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  TrendingUp, 
  Trophy, 
  Target, 
  UserPlus,
  MessageCircle,
  Lock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getUserProfile } from "@/functions/getUserProfile";
import { AccountabilityConnection } from "@/entities/AccountabilityConnection";
import { User } from "@/entities/User";

export default function UserProfile() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('none');
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    loadProfile();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadProfile = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const email = urlParams.get('email');
      
      if (!email) {
        navigate(createPageUrl("Home"));
        return;
      }

      const user = await User.me();
      setCurrentUser(user);

      // Check if viewing own profile
      if (email === user.email) {
        navigate(createPageUrl("Profile"));
        return;
      }

      const response = await getUserProfile({ userEmail: email });
      const profileData = response.data?.profile || response.profile;
      
      if (!profileData) {
        setIsPrivate(true);
        setProfile({ email: email });
        setIsLoading(false);
        return;
      }

      setProfile(profileData);

      // Check connection status
      const connections = await AccountabilityConnection.list();
      const connection = connections.find(c =>
        (c.requester_email === user.email && c.recipient_email === email) ||
        (c.recipient_email === user.email && c.requester_email === email)
      );

      if (connection) {
        if (connection.status === 'accepted') {
          setConnectionStatus('connected');
        } else if (connection.requester_email === user.email) {
          setConnectionStatus('sent');
        } else {
          setConnectionStatus('received');
        }
      }

    } catch (error) {
      console.error("Error loading profile:", error);
      if (error.response?.status === 403) {
        setIsPrivate(true);
        const urlParams = new URLSearchParams(window.location.search);
        const email = urlParams.get('email');
        setProfile({ email: email });
      } else {
        alert("Failed to load profile");
        navigate(createPageUrl("Home"));
      }
    }
    setIsLoading(false);
  };

  const handleConnect = () => {
    navigate(createPageUrl("Accountability") + "?tab=find&email=" + profile.email);
  };

  const handleMessage = () => {
    navigate(createPageUrl("Chat") + `?partner=${profile.email}`);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  if (isPrivate) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="p-12 text-center">
            <Lock className={`w-16 h-16 mx-auto mb-4 ${
              theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
            }`} />
            <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              This Profile is Private
            </h3>
            <p className={`mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Connect with {profile?.email || 'this user'} to view their profile
            </p>
            <Button 
              onClick={handleConnect}
              className={theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Send Connection Request
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="p-12 text-center">
            <Lock className={`w-16 h-16 mx-auto mb-4 ${
              theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
            }`} />
            <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Profile Not Available
            </h3>
            <p className={`mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              This profile is private or doesn't exist.
            </p>
            <Button onClick={() => navigate(createPageUrl("Home"))}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Avatar className="w-32 h-32">
              <AvatarImage src={profile.profile_picture_url} className="object-cover" />
              <AvatarFallback className={`text-4xl ${
                theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
              }`}>
                {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {profile.display_name || 'Anonymous User'}
              </h1>
              
              {profile.bio && (
                <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {profile.bio}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline" className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Level {profile.level || 1}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {profile.total_points || 0} points
                </Badge>
                {profile.looking_for_accountability && (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    Looking for partners
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                {connectionStatus === 'none' && currentUser?.email !== profile.email && (
                  <Button
                    onClick={handleConnect}
                    className={theme === 'minimalist'
                      ? 'bg-green-600 hover:bg-green-700'
                      : theme === 'dark'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    }
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Connect
                  </Button>
                )}
                
                {connectionStatus === 'sent' && (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    Request Sent
                  </Badge>
                )}

                {connectionStatus === 'connected' && (
                  <Button
                    onClick={handleMessage}
                    variant="outline"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Message
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}