
import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Search, Mail, MessageCircle, Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { User } from "@/entities/User";
import AccountabilityPartners from "../components/accountability/AccountabilityPartners";
import FindPartners from "../components/accountability/FindPartners";
import ConnectionRequests from "../components/accountability/ConnectionRequests";
import PartnerMoodFeed from "../components/accountability/PartnerMoodFeed";
import MoodCheckInCard from "../components/accountability/MoodCheckInCard";

export default function Accountability() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('partners');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();

    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }

    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async () => {
    await loadUser();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 w-full" style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
      <div className="max-w-6xl mx-auto">
        <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
          specialMode === 'normal' ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-blue-50 to-purple-50'
          ) : ''
        }`}>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <h1 className={`text-3xl font-bold ${
                  specialMode !== 'normal' ? `${specialMode}-title` :
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Accountability
                </h1>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`p-1 rounded-full hover:bg-gray-100 transition-colors ${
                      theme === 'dark' ? 'hover:bg-gray-700' : ''
                    }`}>
                      <Info className={`w-5 h-5 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-semibold">About Accountability</h4>
                      <p className="text-sm text-gray-600">
                        Connect with partners who keep you on track. Find accountability partners, send connection requests, and share your progress to stay motivated together.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <p className={
                specialMode !== 'normal' ? `${specialMode}-text` :
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }>
                Connect with partners who keep you on track
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full grid-cols-4 mb-6 ${
            specialMode !== 'normal' ? `bg-white/70 backdrop-blur-sm border` :
            theme === 'minimalist'
              ? 'bg-white/70 backdrop-blur-sm border border-gray-200'
              : theme === 'dark'
                ? 'bg-gray-800/70 backdrop-blur-sm border border-gray-700'
                : 'bg-gradient-to-br from-blue-50/70 to-purple-50/70 backdrop-blur-sm border border-blue-100'
          }`}>
            <TabsTrigger value="partners">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Partners</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="find">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Find</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="requests">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span className="hidden sm:inline">Requests</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="feed">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Feed</span>
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="partners">
            <AccountabilityPartners theme={theme} user={user} />
          </TabsContent>

          <TabsContent value="find">
            <FindPartners theme={theme} user={user} onUpdate={handleUpdate} />
          </TabsContent>

          <TabsContent value="requests">
            <ConnectionRequests theme={theme} user={user} onUpdate={handleUpdate} />
          </TabsContent>

          <TabsContent value="feed">
            <div className="space-y-6">
              <MoodCheckInCard theme={theme} user={user} />
              <PartnerMoodFeed theme={theme} user={user} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}
