import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";

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
  const specialMode = localStorage.getItem('special_mode') || 'normal';

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
    </div>
  );
}