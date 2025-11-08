import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Bell, BellOff, Moon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Input } from "@/components/ui/input";

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    task_reminders: true,
    daily_tips: true,
    achievements: true,
    accountability: true,
  });
  const [quietHours, setQuietHours] = useState({
    enabled: false,
    start: "22:00",
    end: "08:00"
  });

  const specialMode = localStorage.getItem('special_mode') || 'normal';

  useEffect(() => {
    loadSettings();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      if (currentUser.notification_settings) {
        setSettings(currentUser.notification_settings);
      }

      setQuietHours({
        enabled: currentUser.quiet_hours_enabled || false,
        start: currentUser.quiet_hours_start || "22:00",
        end: currentUser.quiet_hours_end || "08:00"
      });
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    
    setSaving(true);
    try {
      await base44.auth.updateMe({
        notification_settings: newSettings
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  const handleQuietHoursToggle = async () => {
    const newEnabled = !quietHours.enabled;
    setQuietHours({ ...quietHours, enabled: newEnabled });
    
    setSaving(true);
    try {
      await base44.auth.updateMe({
        quiet_hours_enabled: newEnabled
      });
    } catch (error) {
      console.error("Error saving quiet hours:", error);
      setQuietHours({ ...quietHours, enabled: !newEnabled });
    } finally {
      setSaving(false);
    }
  };

  const handleTimeChange = async (field, value) => {
    const newQuietHours = { ...quietHours, [field]: value };
    setQuietHours(newQuietHours);
    
    setSaving(true);
    try {
      await base44.auth.updateMe({
        [`quiet_hours_${field}`]: value
      });
    } catch (error) {
      console.error("Error saving time:", error);
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{
      paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
      paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))'
    }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("Home"))}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div>
          <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Notification Settings
          </h1>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Manage when and how you receive notifications
          </p>
        </div>

        {/* Quiet Hours Card */}
        <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
          specialMode === 'normal' ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm border-gray-700'
                : 'bg-gradient-to-br from-purple-50 to-pink-50'
          ) : ''
        }`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Moon className={`w-5 h-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
              <CardTitle className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>
                Quiet Hours
              </CardTitle>
            </div>
            <CardDescription className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Automatically silence all notifications during specific hours
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                  Enable Quiet Hours
                </Label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  No notifications will be sent during this time
                </p>
              </div>
              <Switch
                checked={quietHours.enabled}
                onCheckedChange={handleQuietHoursToggle}
                disabled={saving}
              />
            </div>

            {quietHours.enabled && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div className="space-y-2">
                  <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                    Start Time
                  </Label>
                  <Input
                    type="time"
                    value={quietHours.start}
                    onChange={(e) => handleTimeChange('start', e.target.value)}
                    disabled={saving}
                    className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                    End Time
                  </Label>
                  <Input
                    type="time"
                    value={quietHours.end}
                    onChange={(e) => handleTimeChange('end', e.target.value)}
                    disabled={saving}
                    className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : ''}
                  />
                </div>
              </div>
            )}

            {quietHours.enabled && (
              <div className={`p-3 rounded-lg ${
                theme === 'dark' ? 'bg-purple-900/20 border border-purple-800' : 'bg-purple-50 border border-purple-200'
              }`}>
                <p className={`text-sm ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>
                  🌙 Quiet hours active: {quietHours.start} - {quietHours.end}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notification Types Card */}
        <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
          specialMode === 'normal' ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm border-gray-700'
                : 'bg-gradient-to-br from-purple-50 to-pink-50'
          ) : ''
        }`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className={`w-5 h-5 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
              <CardTitle className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>
                Notification Types
              </CardTitle>
            </div>
            <CardDescription className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
              Choose which types of notifications you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                  Task Reminders
                </Label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Get notified about your tasks
                </p>
              </div>
              <Switch
                checked={settings.task_reminders}
                onCheckedChange={() => handleToggle('task_reminders')}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                  Daily Tips
                </Label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Receive productivity tips and motivation
                </p>
              </div>
              <Switch
                checked={settings.daily_tips}
                onCheckedChange={() => handleToggle('daily_tips')}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                  Achievements
                </Label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Get notified when you unlock achievements
                </p>
              </div>
              <Switch
                checked={settings.achievements}
                onCheckedChange={() => handleToggle('achievements')}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}>
                  Accountability Partners
                </Label>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Notifications from your accountability partners
                </p>
              </div>
              <Switch
                checked={settings.accountability}
                onCheckedChange={() => handleToggle('accountability')}
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {saving && (
          <div className={`p-3 rounded-lg text-center ${
            theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
          }`}>
            <p className="text-sm">Saving...</p>
          </div>
        )}
      </div>
    </div>
  );
}