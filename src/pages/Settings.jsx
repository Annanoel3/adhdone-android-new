import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  Sun, 
  Moon, 
  Sparkles, 
  Settings as SettingsIcon,
  Bell,
  Shield,
  HelpCircle,
  Bug,
  LogOut,
  ArrowLeft,
  User as UserIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Settings() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');
  const [seasonalUnlocked, setSeasonalUnlocked] = useState(() => localStorage.getItem('seasonal_unlocked') === 'true');
  const [user, setUser] = useState(null);
  const [quietHoursStart, setQuietHoursStart] = useState(() => localStorage.getItem('quiet_hours_start') || '20:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(() => localStorage.getItem('quiet_hours_end') || '08:00');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      // Sync theme from user profile (source of truth for cross-device persistence)
      if (currentUser.adhd_theme) {
        setTheme(currentUser.adhd_theme);
        localStorage.setItem('adhd_theme', currentUser.adhd_theme);
      }
      const userSpecialMode = currentUser.special_mode || 'normal';
      setSpecialMode(userSpecialMode);
      localStorage.setItem('special_mode', userSpecialMode);
      if (currentUser.seasonal_unlocked) {
        setSeasonalUnlocked(true);
        localStorage.setItem('seasonal_unlocked', 'true');
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const saveThemeToProfile = async (newTheme, newSpecialMode, newSeasonalUnlocked) => {
    localStorage.setItem('adhd_theme', newTheme);
    localStorage.setItem('special_mode', newSpecialMode);
    localStorage.setItem('seasonal_unlocked', newSeasonalUnlocked ? 'true' : 'false');
    try {
      await base44.auth.updateMe({
        adhd_theme: newTheme,
        special_mode: newSpecialMode,
        seasonal_unlocked: newSeasonalUnlocked
      });
    } catch (e) {
      console.error('Failed to save theme to profile:', e);
    }
  };

  const toggleTheme = () => {
    // If in seasonal/kawaii mode, exit back to light
    if (specialMode !== 'normal') {
      setSpecialMode('normal');
      setTheme('minimalist');
      saveThemeToProfile('minimalist', 'normal', seasonalUnlocked);
      setTimeout(() => window.location.reload(), 100);
      return;
    }

    // Cycle through the 4 main themes
    const themeOrder = ['minimalist', 'dark', 'colorful', 'spicybrains'];
    const currentIndex = themeOrder.indexOf(theme);

    // After spicybrains: go to seasonal if unlocked, otherwise back to minimalist
    if (currentIndex === themeOrder.length - 1) {
      if (seasonalUnlocked) {
        const seasonal = getDateBasedMode();
        setSpecialMode(seasonal);
        saveThemeToProfile('minimalist', seasonal, seasonalUnlocked);
        setTimeout(() => window.location.reload(), 100);
        return;
      }
      setTheme('minimalist');
      saveThemeToProfile('minimalist', 'normal', seasonalUnlocked);
      return;
    }

    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
    setTheme(nextTheme);
    saveThemeToProfile(nextTheme, 'normal', seasonalUnlocked);
  };

  const getDateBasedMode = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    if (month === 12 && day >= 20 && day <= 26) return 'christmas';
    if ((month === 12 && day >= 27) || (month === 1 && day <= 5)) return 'newyears';
    if (month === 2 && day >= 10 && day <= 16) return 'valentines';
    if (month === 3 && day >= 10 && day <= 20) return 'stpatricks';
    if (month === 7 && day >= 1 && day <= 7) return 'fourthjuly';
    if ((month === 10 && day >= 25) || (month === 11 && day <= 5)) return 'halloween';
    if ((month === 3 && day >= 21) || month === 4 || month === 5) return 'spring';
    if (month === 6 || (month === 7 && day > 7) || month === 8) return 'summer';
    if (month === 9 || (month === 10 && day <= 24) || (month === 11 && day >= 6)) return 'fall';
    if (month === 12 && day <= 19) return 'winter';
    if ((month === 1 && day >= 6) || (month === 2 && (day < 10 || day > 16)) || (month === 3 && day < 10)) return 'winter';

    return 'normal';
  };

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
      window.location.reload();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const [quietHoursSaving, setQuietHoursSaving] = useState(false);

  const handleQuietHoursChange = (startTime, endTime) => {
    setQuietHoursStart(startTime);
    setQuietHoursEnd(endTime);
  };

  const handleQuietHoursSave = async () => {
    setQuietHoursSaving(true);
    localStorage.setItem('quiet_hours_start', quietHoursStart);
    localStorage.setItem('quiet_hours_end', quietHoursEnd);
    try {
      await base44.functions.invoke('applyQuietHours', {
        quietStart: quietHoursStart,
        quietEnd: quietHoursEnd
      });
    } catch (e) {
      console.error('Failed to apply quiet hours to queued notifications:', e);
    }
    setQuietHoursSaving(false);
  };

  const settingsItems = [
    {
      icon: UserIcon,
      label: 'My Profile',
      onClick: () => navigate('/profile')
    },
    {
      icon: UserIcon,
      label: 'My Account',
      onClick: () => navigate('/myaccount')
    },
    {
      icon: Bell,
      label: 'Notifications',
      onClick: () => navigate('/notificationsettings')
    },
    {
      icon: Shield,
      label: 'Privacy Policy',
      onClick: () => navigate('/privacypolicy')
    },
    {
      icon: Shield,
      label: 'Terms & Conditions',
      onClick: () => navigate('/Terms')
    },
    {
      icon: Bug,
      label: 'Feedback',
      onClick: () => navigate('/reportbug')
    }
  ];

  return (
    <div className={`min-h-screen p-4 md:p-8 ${
      theme === 'dark' ? 'bg-gray-900' : theme === 'spicybrains' ? 'bg-gradient-to-br from-pink-300 to-yellow-300' : 'bg-gradient-to-br from-stone-50 via-sage-50 to-stone-100'
    }`} style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="gap-2 p-3 h-12 text-base rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Button>

        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Settings
          </h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Customize your ADHDone experience
          </p>
        </div>

        {/* Quiet Hours Section */}
        <Card className={`mb-6 border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Moon className="w-5 h-5" />
              Quiet Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Set the hours when you don't want to receive notifications. For example, 8 PM to 8 AM.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="quiet-start" className={theme === 'dark' ? 'text-gray-200' : ''}>Start Time</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietHoursStart}
                  onChange={(e) => handleQuietHoursChange(e.target.value, quietHoursEnd)}
                  className={theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : ''}
                />
              </div>
              <div>
                <Label htmlFor="quiet-end" className={theme === 'dark' ? 'text-gray-200' : ''}>End Time</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietHoursEnd}
                  onChange={(e) => handleQuietHoursChange(quietHoursStart, e.target.value)}
                  className={theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : ''}
                />
              </div>
            </div>
            <Button
              onClick={handleQuietHoursSave}
              disabled={quietHoursSaving}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {quietHoursSaving ? 'Saving...' : 'Save Quiet Hours'}
            </Button>
          </CardContent>
        </Card>

        {/* Theme Section */}
        <Card className={`mb-6 border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Sparkles className="w-5 h-5" />
              Theme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={toggleTheme}
              className={`w-full flex items-center justify-center gap-2 py-6 rounded-lg text-base ${
                theme === 'minimalist'
                  ? 'bg-green-600 hover:bg-green-700'
                  : theme === 'dark'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'spicybrains'
                      ? 'bg-gradient-to-r from-pink-500 to-yellow-500 hover:from-pink-600 hover:to-yellow-600'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
              }`}
            >
              {theme === 'minimalist' ? (
                <>
                  <Sun className="w-5 h-5" />
                  Light Theme
                </>
              ) : theme === 'dark' ? (
                <>
                  <Moon className="w-5 h-5" />
                  Dark Theme
                </>
              ) : theme === 'spicybrains' ? (
                <>
                  <Sparkles className="w-5 h-5" />
                  Spicy Brains ✨
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Colorful Theme
                </>
              )}
            </Button>
            <p className={`text-xs mt-3 text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Click to cycle through themes
            </p>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card className={`mb-6 border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <SettingsIcon className="w-5 h-5" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settingsItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Button
                  key={idx}
                  onClick={item.onClick}
                  variant="outline"
                  className={`w-full flex items-center justify-start gap-3 py-6 px-4 rounded-lg text-base ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-white' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {/* Logout */}
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="pt-6">
            <Button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-6 bg-red-600 hover:bg-red-700 text-white rounded-lg text-base"
            >
              <LogOut className="w-5 h-5" />
              Log Out
            </Button>
          </CardContent>
        </Card>

        <div style={{ height: '80px' }} aria-hidden="true" />
      </div>
    </div>
  );
}