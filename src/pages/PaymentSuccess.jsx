import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, Home } from "lucide-react";
import { User } from "@/entities/User";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  useEffect(() => {
    // Wait a moment for Stripe webhook to process
    setTimeout(async () => {
      try {
        // Refresh user data to get updated payment status
        await User.me();
      } catch (error) {
        console.error("Error refreshing user:", error);
      }
    }, 2000);

    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className={`max-w-md w-full border-none shadow-2xl ${
        theme === 'minimalist' 
          ? 'bg-gradient-to-br from-green-50 to-teal-50' 
          : theme === 'dark'
            ? 'bg-gray-800'
            : 'bg-gradient-to-br from-purple-50 to-orange-50'
      }`}>
        <CardContent className="p-12 text-center">
          <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${
            theme === 'minimalist' 
              ? 'bg-green-100' 
              : theme === 'dark'
                ? 'bg-green-900/30'
                : 'bg-gradient-to-br from-green-100 to-teal-100'
          }`}>
            <CheckCircle2 className={`w-10 h-10 ${
              theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-green-600'
            }`} />
          </div>

          <h1 className={`text-3xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Welcome to ADHDone Pro! 🎉
          </h1>
          
          <p className={`text-lg mb-8 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            Your payment was successful. You now have access to all pro features!
          </p>

          <div className={`p-6 rounded-xl mb-8 ${
            theme === 'minimalist' 
              ? 'bg-white/80' 
              : theme === 'dark'
                ? 'bg-gray-900/50'
                : 'bg-white/80'
          }`}>
            <Sparkles className={`w-8 h-8 mx-auto mb-3 ${
              theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
            }`} />
            <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              All features are now unlocked
            </p>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Smart reminders • AI insights • Unlimited tasks
            </p>
          </div>

          <Button
            onClick={() => navigate(createPageUrl("Home"))}
            size="lg"
            className={`w-full ${
              theme === 'minimalist' 
                ? 'bg-green-600 hover:bg-green-700' 
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
            }`}
          >
            <Home className="w-5 h-5 mr-2" />
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}