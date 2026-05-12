import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Trophy,
  Target,
  Edit,
  Loader2,
  Lock,
  Eye,
  Users,
  Sparkles // Add Sparkles
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";

export default function Profile() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [lookingForAccountability, setLookingForAccountability] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');


  useEffect(() => {
    loadProfile();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setTheme(newTheme);
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadProfile = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
      setProfileVisibility(currentUser.profile_visibility || 'public');
      setLookingForAccountability(currentUser.looking_for_accountability || false);
    } catch (error) {
      console.error("Error loading profile:", error);
    }
    setIsLoading(false);
  };

  const handleVisibilityChange = async (value) => {
    setIsSaving(true);
    try {
      await User.updateMyUserData({ profile_visibility: value });
      setProfileVisibility(value);
      await loadProfile();
    } catch (error) {
      console.error("Error updating visibility:", error);
      alert("Failed to update profile visibility");
    }
    setIsSaving(false);
  };

  const handleAccountabilityToggle = async (checked) => {
    setIsSaving(true);
    try {
      await User.updateMyUserData({
        looking_for_accountability: checked,
        profile_visibility: checked ? 'public' : profileVisibility
      });
      setLookingForAccountability(checked);
      await loadProfile();
    } catch (error) {
      console.error("Error updating setting:", error);
      alert("Failed to update setting");
    }
    setIsSaving(false);
  };

  const toggleSpecialMode = () => {
    const currentMode = localStorage.getItem('special_mode') || 'normal';
    let nextMode = 'normal';

    if (currentMode === 'normal') {
      nextMode = 'kawaii';
    } else if (currentMode === 'kawaii') {
      nextMode = 'halloween';
    } else {
      nextMode = 'normal';
    }

    localStorage.setItem('special_mode', nextMode);
    window.location.reload();
  };

  if (isLoading || !user) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/settings')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '16px', padding: '12px 16px', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', color: theme === 'dark' ? '#e5e7eb' : '#1f2937' }}
      >
        ← Back
      </button>
      <div className="mb-6 flex items-center justify-between">
        <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          My Profile
        </h1>
        <Button
          onClick={() => navigate(createPageUrl("ProfileSettings"))}
          variant="outline"
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit Profile
        </Button>
      </div>

      <Card className={`border-none shadow-lg mb-6 ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Avatar className="w-32 h-32">
              <AvatarImage src={user.profile_picture_url} className="object-cover" />
              <AvatarFallback className={`text-4xl ${
                theme === 'minimalist' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-purple-200 to-pink-200 text-purple-800'
              }`}>
                {user.display_name?.[0]?.toUpperCase() || user.full_name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h2 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {user.display_name || user.full_name || 'Anonymous User'}
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {user.email}
              </p>

              {user.bio && (
                <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {user.bio}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mb-6">
                <Badge variant="outline" className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Level {user.level || 1}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  {user.total_points || 0} points
                </Badge>
                {user.looking_for_accountability && (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    Looking for partners
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardHeader>
          <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
            Privacy Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
              Profile Visibility
            </Label>
            <Select value={profileVisibility} onValueChange={handleVisibilityChange} disabled={isSaving}>
              <SelectTrigger className={theme === 'dark' ? 'bg-gray-700 text-gray-100 border-gray-600' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>Public - Anyone can see your profile</span>
                  </div>
                </SelectItem>
                <SelectItem value="connections_only">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>Connections Only - Only accountability partners</span>
                  </div>
                </SelectItem>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span>Private - Hidden from everyone</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Control who can see your profile, bio, and stats
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
                Looking for Accountability Partners
              </Label>
              <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Show in the "Find Partners" list
              </p>
            </div>
            <Switch
              checked={lookingForAccountability}
              onCheckedChange={handleAccountabilityToggle}
              disabled={isSaving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Made with love message */}
      <Card className={`border-none shadow-lg mt-6 ${
        theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-gradient-to-br from-purple-50 to-pink-50'
      }`}>
        <CardContent className="p-6 text-center">
          <Sparkles className={`w-8 h-8 mx-auto mb-3 ${
            theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
          }`} />
          <p className={`text-sm font-medium mb-1 ${
            theme === 'dark' ? 'text-gray-200' : 'text-gray-900'
          }`}>
            Made with 💜 by someone with ADHD
          </p>
          <p className={`text-xs ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Built from lived experience, for people who think differently
          </p>
        </CardContent>
      </Card>

      {/* Easter Egg Button */}
      <div className="mt-6 text-center">
        <Button
          onClick={() => {
            if (window.triggerEasterEgg) {
              window.triggerEasterEgg('awesome');
            }
          }}
          variant="ghost"
          size="sm"
          className={`text-xs opacity-40 hover:opacity-100 transition-opacity ${
            theme === 'dark' || ['halloween', 'christmas', 'newyears', 'fourthjuly'].includes(specialMode)
              ? 'text-gray-500 hover:text-gray-400'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          ✨ what's this? ✨
        </Button>
      </div>
    </div>
  );
}