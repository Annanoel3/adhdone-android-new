
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Volume2, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NotificationSettings() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({
    task_reminders: true,
    achievements: true,
    accountability_messages: true,
    accountability_pokes: true,
    connection_requests: true,
    trial_warnings: true,
    daily_summary: true
  });
  const [selectedSound, setSelectedSound] = useState('calming_melody');
  const specialMode = localStorage.getItem('special_mode') || 'normal';

  const soundOptions = {
    joyful_melody: {
      name: "Joyful Melody",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/Joyful%20Melody.wav"
    },
    piano_melody: {
      name: "Piano Melody",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/Piano%20Melody.mp3"
    },
    short_notification: {
      name: "Short Notification",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/Short%20Notification.wav"
    },
    short_piano: {
      name: "Short Piano Notification",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/Short%20Piano%20Notification.mp3"
    },
    jr_station: {
      name: "JR Station Notification",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification.mp3"
    },
    jr_station_3: {
      name: "JR Station Notification 3",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/JR%20Station%20Notification%203.mp3"
    },
    jr_osaka_loop: {
      name: "JR Osaka Loop",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/JR%20Osaka%20Loop%204.mp3"
    },
    jr_morning_tranquility: {
      name: "JR Morning Tranquility",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/JR%20Morning%20Tranquility.mp3"
    },
    jr_flower_shop: {
      name: "JR Flower Shop",
      url: "https://urfdjvbxdjtxgdsyqhlk.supabase.co/storage/v1/object/public/Notifications/JR%20Flower%20Shop.mp3"
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setSettings(currentUser.notification_settings || settings);
      // Ensure selectedSound defaults to a valid key from the new soundOptions, or 'joyful_melody' if user had old sound
      setSelectedSound(currentUser.notification_sound && soundOptions[currentUser.notification_sound] ? currentUser.notification_sound : 'joyful_melody');
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const handleToggle = async (key) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    
    try {
      await base44.auth.updateMe({ notification_settings: newSettings });
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const handleSoundChange = async (sound) => {
    setSelectedSound(sound);
    try {
      await base44.auth.updateMe({ notification_sound: sound });
    } catch (error) {
      console.error("Error saving sound:", error);
    }
  };

  const playTestSound = () => {
    const soundUrl = soundOptions[selectedSound]?.url;
    if (soundUrl) {
      const audio = new Audio(soundUrl);
      audio.play().catch(err => console.error("Failed to play sound:", err));
    }
  };

  const getCardClasses = () => {
    if (specialMode !== 'normal') {
      return `${specialMode}-card border-none shadow-lg mb-6`;
    }
    if (theme === 'minimalist') {
      return 'bg-white/80 backdrop-blur-sm border-none shadow-lg mb-6';
    }
    if (theme === 'dark') {
      return 'bg-gray-800 border border-gray-700 shadow-lg mb-6';
    }
    return 'bg-white/80 backdrop-blur-sm border-none shadow-lg mb-6';
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Card className={getCardClasses()}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            <Bell className="w-6 h-6" />
            Notification Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notification Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="task_reminders" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Task Reminders
              </Label>
              <Switch
                id="task_reminders"
                checked={settings.task_reminders}
                onCheckedChange={() => handleToggle('task_reminders')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="achievements" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Achievements
              </Label>
              <Switch
                id="achievements"
                checked={settings.achievements}
                onCheckedChange={() => handleToggle('achievements')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="accountability_messages" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Accountability Messages
              </Label>
              <Switch
                id="accountability_messages"
                checked={settings.accountability_messages}
                onCheckedChange={() => handleToggle('accountability_messages')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="accountability_pokes" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Accountability Pokes
              </Label>
              <Switch
                id="accountability_pokes"
                checked={settings.accountability_pokes}
                onCheckedChange={() => handleToggle('accountability_pokes')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="connection_requests" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Connection Requests
              </Label>
              <Switch
                id="connection_requests"
                checked={settings.connection_requests}
                onCheckedChange={() => handleToggle('connection_requests')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="trial_warnings" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Trial Warnings
              </Label>
              <Switch
                id="trial_warnings"
                checked={settings.trial_warnings}
                onCheckedChange={() => handleToggle('trial_warnings')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="daily_summary" className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                Daily Summary
              </Label>
              <Switch
                id="daily_summary"
                checked={settings.daily_summary}
                onCheckedChange={() => handleToggle('daily_summary')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Sound Selector */}
      <Card className={getCardClasses()}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            <Volume2 className="w-6 h-6" />
            Notification Sound
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedSound} onValueChange={handleSoundChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose sound" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(soundOptions).map(([key, sound]) => (
                  <SelectItem key={key} value={key}>
                    {sound.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={playTestSound}
            >
              <Play className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
