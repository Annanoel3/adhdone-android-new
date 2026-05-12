import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User as UserIcon, Bell, Shield, Bug, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function Settings() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
      window.location.reload();
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const settingsList = [
    {
      icon: UserIcon,
      title: "My Profile",
      description: "View and edit your profile information",
      onClick: () => navigate("/profile")
    },
    {
      icon: UserIcon,
      title: "My Account",
      description: "Manage your account settings",
      onClick: () => navigate("/myaccount")
    },
    {
      icon: Bell,
      title: "Notifications",
      description: "Configure notification preferences",
      onClick: () => navigate("/notificationsettings")
    },
    {
      icon: Shield,
      title: "Privacy Policy",
      description: "Read our privacy policy",
      onClick: () => navigate("/privacypolicy")
    },
    {
      icon: Shield,
      title: "Terms & Conditions",
      description: "Read our terms and conditions",
      onClick: () => navigate("/termsandconditions")
    },
    {
      icon: Bug,
      title: "Feedback",
      description: "Send us your feedback or report issues",
      onClick: () => navigate("/reportbug")
    }
  ];

  return (
    <div className={`min-h-screen p-4 md:p-8 w-full ${
      theme === 'spicybrains'
        ? 'bg-gradient-to-br from-orange-300 via-pink-300 to-orange-400'
        : theme === 'dark'
          ? 'bg-gray-900'
          : ''
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

        <Card className={`border-none shadow-lg mb-6 ${
          specialMode !== 'normal' ? `${specialMode}-card` : ''
        } ${
          specialMode === 'normal' ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-blue-50 to-purple-50'
          ) : ''
        }`}>
          <CardContent className="p-6">
            <h1 className={`text-3xl font-bold ${
              specialMode !== 'normal' ? `${specialMode}-title` :
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              Settings
            </h1>
            <p className={`mt-2 ${
              specialMode !== 'normal' ? `${specialMode}-text` :
              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Manage your preferences and account
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {settingsList.map((setting) => {
            const Icon = setting.icon;
            return (
              <button
                key={setting.title}
                onClick={setting.onClick}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  specialMode !== 'normal' ? `${specialMode}-card` : ''
                } ${
                  specialMode === 'normal' ? (
                    theme === 'minimalist'
                      ? 'bg-white/90 backdrop-blur-sm border-gray-200 hover:shadow-md'
                      : theme === 'dark'
                        ? 'bg-gray-800/90 backdrop-blur-sm border-gray-700 hover:bg-gray-700'
                        : 'bg-white/90 backdrop-blur-sm border-gray-200 hover:shadow-md'
                  ) : 'hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${
                    specialMode !== 'normal'
                      ? 'bg-white/30'
                      : theme === 'dark'
                        ? 'bg-gray-700'
                        : 'bg-gray-100'
                  }`}>
                    <Icon className={`w-6 h-6 ${
                      specialMode !== 'normal'
                        ? 'text-gray-900'
                        : theme === 'dark'
                          ? 'text-gray-400'
                          : 'text-gray-600'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-base ${
                      specialMode !== 'normal'
                        ? 'text-gray-900'
                        : theme === 'dark'
                          ? 'text-white'
                          : 'text-gray-900'
                    }`}>
                      {setting.title}
                    </h3>
                    <p className={`text-sm ${
                      specialMode !== 'normal'
                        ? 'text-gray-700'
                        : theme === 'dark'
                          ? 'text-gray-400'
                          : 'text-gray-600'
                    }`}>
                      {setting.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          <button
            onClick={handleLogout}
            className={`w-full text-left p-4 rounded-lg border transition-all ${
              specialMode !== 'normal' ? `${specialMode}-card` : ''
            } ${
              specialMode === 'normal' ? (
                theme === 'minimalist'
                  ? 'bg-white/90 backdrop-blur-sm border-red-200 hover:shadow-md'
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm border-red-900 hover:bg-red-900/20'
                    : 'bg-white/90 backdrop-blur-sm border-red-200 hover:shadow-md'
              ) : 'hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${
                specialMode !== 'normal'
                  ? 'bg-white/30'
                  : theme === 'dark'
                    ? 'bg-red-900/30'
                    : 'bg-red-100'
              }`}>
                <LogOut className={`w-6 h-6 ${
                  specialMode !== 'normal'
                    ? 'text-gray-900'
                    : theme === 'dark'
                      ? 'text-red-400'
                      : 'text-red-600'
                }`} />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold text-base ${
                  specialMode !== 'normal'
                    ? 'text-gray-900'
                    : theme === 'dark'
                      ? 'text-red-400'
                      : 'text-red-600'
                }`}>
                  Log Out
                </h3>
                <p className={`text-sm ${
                  specialMode !== 'normal'
                    ? 'text-gray-700'
                    : theme === 'dark'
                      ? 'text-gray-400'
                      : 'text-gray-600'
                }`}>
                  Sign out of your account
                </p>
              </div>
            </div>
          </button>
        </div>

        <div style={{ height: '120px' }} aria-hidden="true"></div>
      </div>
    </div>
  );
}