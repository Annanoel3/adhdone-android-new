import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Heart,
  Home
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Subscribe() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Card className={`shadow-xl ${
        theme === 'dark' 
          ? 'bg-gray-800 border border-gray-700' 
          : theme === 'minimalist'
            ? 'bg-gradient-to-br from-green-50 to-teal-50 border-2 border-green-200'
            : 'bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200'
      }`}>
        <CardContent className="p-12 text-center">
          <Heart className={`w-16 h-16 mx-auto mb-4 ${
            theme === 'dark' ? 'text-green-400' : theme === 'minimalist' ? 'text-green-600' : 'text-purple-600'
          }`} />
          <h2 className={`text-3xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            ADHDone is Free!
          </h2>
          <p className={`text-lg mb-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            All features are available to everyone. No payment required.
          </p>
          <p className={`mb-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Built with love for people who think differently.
          </p>
          <Button
            onClick={() => navigate(createPageUrl("Home"))}
            className={`${
              theme === 'minimalist' 
                ? 'bg-green-600 hover:bg-green-700' 
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }`}
          >
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}