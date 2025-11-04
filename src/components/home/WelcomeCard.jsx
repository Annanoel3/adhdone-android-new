
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export default function WelcomeCard({ userName, theme }) {
  const specialMode = localStorage.getItem('special_mode') || 'normal';

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card bg-transparent` : ''} border-none shadow-lg overflow-hidden ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-gradient-to-br from-white to-green-50/30' 
          : theme === 'dark'
            ? 'bg-gradient-to-br from-gray-800 to-gray-850'
            : 'bg-gradient-to-br from-white to-purple-50'
      ) : ''
    }`}>
      <CardContent className="p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className={`text-sm mb-2 ${
              specialMode !== 'normal' ? `${specialMode}-text` : 
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {getTimeGreeting()}
            </p>
            <h1 className={`text-3xl font-bold mb-2 ${
              specialMode !== 'normal' ? `${specialMode}-title` :
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              Ready to get things done?
            </h1>
            <p className={
              specialMode !== 'normal' ? `${specialMode}-text` :
              theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
            }>
              Let's tackle today one step at a time
            </p>
          </div>
          <div className={`p-3 rounded-2xl ${
            specialMode !== 'normal' ? 'bg-transparent' :
            theme === 'minimalist' 
              ? 'bg-green-100' 
              : theme === 'dark'
                ? 'bg-green-900/30'
                : 'bg-gradient-to-br from-purple-100 to-orange-100'
          }`}>
            <Sparkles className={`w-6 h-6 ${
              specialMode !== 'normal' ? '' :
              theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
            }`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
