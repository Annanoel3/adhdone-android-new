import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  CheckCircle2, 
  Zap, 
  TrendingUp, 
  MessageCircle, 
  Bell,
  Brain,
  Target,
  Users,
  Loader2,
  Home
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";

export default function TrialEnded() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('monthly');

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSubscribe = async () => {
    setIsLoading(true);
    
    try {
      // Check if running in Median app
      if (window.median && window.median.iap) {
        const productId = selectedPlan === 'monthly' 
          ? 'com.adhdone.monthly' 
          : 'com.adhdone.yearly';
        
        // Trigger IAP purchase
        window.median.iap.purchase(productId, async (result) => {
          if (result.success) {
            // Verify purchase on backend
            const response = await base44.functions.invoke('verifyPurchase', {
              platform: result.platform,
              receipt: result.receipt || result.purchaseToken,
              productId: productId
            });
            
            if (response.data.success) {
              // Refresh user data
              window.location.href = createPageUrl("PaymentSuccess");
            } else {
              alert('Purchase verification failed. Please contact support.');
              setIsLoading(false);
            }
          } else {
            alert('Purchase failed: ' + (result.error || 'Unknown error'));
            setIsLoading(false);
          }
        });
      } else {
        // Web fallback - just navigate home
        alert('In-app purchases only work in the mobile app. Please download from the App Store or Play Store.');
        navigate(createPageUrl("Home"));
      }
    } catch (error) {
      console.error("Purchase error:", error);
      alert("Failed to start purchase. Please try again.");
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: Bell,
      title: "Smart Push Reminders",
      description: "Get timely notifications that adapt to your needs - never miss what matters"
    },
    {
      icon: Brain,
      title: "AI Task Breakdown",
      description: "Overwhelmed? AI automatically breaks big tasks into manageable steps"
    },
    {
      icon: Zap,
      title: "Focus Timer",
      description: "Pomodoro-style timer designed for ADHD brains - build momentum gradually"
    },
    {
      icon: Target,
      title: "Energy-Based Scheduling",
      description: "Match tasks to your energy levels throughout the day"
    },
    {
      icon: TrendingUp,
      title: "Insights & Analytics",
      description: "Understand your productivity patterns and optimize your workflow"
    },
    {
      icon: Users,
      title: "Accountability System",
      description: "Share progress reports with partners who support your journey"
    },
    {
      icon: MessageCircle,
      title: "AI Support Space",
      description: "Get personalized advice and encouragement when you need it"
    },
    {
      icon: Sparkles,
      title: "Parking Lot for Ideas",
      description: "Capture fleeting thoughts before they disappear - organize later"
    }
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="text-center mb-12">
        <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${
          theme === 'minimalist' 
            ? 'bg-gradient-to-br from-green-100 to-teal-100' 
            : theme === 'dark'
              ? 'bg-gradient-to-br from-green-900 to-teal-900'
              : 'bg-gradient-to-br from-purple-200 to-orange-200'
        }`}>
          <Sparkles className={`w-10 h-10 ${
            theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
          }`} />
        </div>
        
        <h1 className={`text-4xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Your Trial Has Ended
        </h1>
        <p className={`text-xl mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Ready to keep crushing your goals?
        </p>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Continue using ADHDone's full toolkit designed for how your brain works
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card 
          onClick={() => setSelectedPlan('monthly')}
          className={`cursor-pointer transition-all border-2 ${
            selectedPlan === 'monthly'
              ? theme === 'minimalist'
                ? 'border-green-500 bg-green-50 shadow-lg scale-105'
                : theme === 'dark'
                  ? 'border-green-600 bg-green-900/30 shadow-lg scale-105'
                  : 'border-purple-500 bg-gradient-to-br from-purple-100 to-orange-100 shadow-lg scale-105'
              : theme === 'dark'
                ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <CardContent className="p-6 text-center">
            <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Monthly
            </h3>
            <div className="text-4xl font-bold text-gray-900 mb-2">
              $5.99
              <span className={`text-lg font-normal ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>/mo</span>
            </div>
            <Badge className={selectedPlan === 'monthly'
              ? theme === 'minimalist'
                ? 'bg-green-100 text-green-700'
                : theme === 'dark'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-purple-200 text-purple-800'
              : 'bg-gray-100 text-gray-600'
            }>
              Flexible
            </Badge>
          </CardContent>
        </Card>

        <Card 
          onClick={() => setSelectedPlan('yearly')}
          className={`cursor-pointer transition-all border-2 relative ${
            selectedPlan === 'yearly'
              ? theme === 'minimalist'
                ? 'border-green-500 bg-green-50 shadow-lg scale-105'
                : theme === 'dark'
                  ? 'border-green-600 bg-green-900/30 shadow-lg scale-105'
                  : 'border-purple-500 bg-gradient-to-br from-purple-100 to-orange-100 shadow-lg scale-105'
              : theme === 'dark'
                ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-green-600 to-teal-600 text-white">
            Save 17%
          </Badge>
          <CardContent className="p-6 text-center">
            <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Yearly
            </h3>
            <div className="text-4xl font-bold text-gray-900 mb-1">
              $59.99
              <span className={`text-lg font-normal ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>/yr</span>
            </div>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Just $5/month
            </p>
            <Badge className={selectedPlan === 'yearly'
              ? theme === 'minimalist'
                ? 'bg-green-100 text-green-700 mt-2'
                : theme === 'dark'
                  ? 'bg-green-900/50 text-green-400 mt-2'
                  : 'bg-purple-200 text-purple-800 mt-2'
              : 'bg-gray-100 text-gray-600 mt-2'
            }>
              Best Value
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="text-center mb-8">
        <Button
          onClick={handleSubscribe}
          disabled={isLoading}
          size="lg"
          className={`px-12 py-6 text-lg ${
            theme === 'minimalist' 
              ? 'bg-green-600 hover:bg-green-700' 
              : theme === 'dark'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Subscribe Now
            </>
          )}
        </Button>

        <p className={`text-sm mt-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Secure payment through {window.median ? 'App Store/Play Store' : 'your app store'} • Cancel anytime
        </p>
      </div>

      <div className="mb-8">
        <h2 className={`text-2xl font-bold mb-6 text-center ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Everything You Get with Pro
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <Card key={index} className={`border-none shadow-md ${
              theme === 'minimalist' 
                ? 'bg-white/80 backdrop-blur-sm' 
                : theme === 'dark'
                  ? 'bg-gray-800/80 backdrop-blur-sm'
                  : 'bg-white/80 backdrop-blur-sm'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl flex-shrink-0 ${
                    theme === 'minimalist' 
                      ? 'bg-green-100' 
                      : theme === 'dark'
                        ? 'bg-green-900/30'
                        : 'bg-gradient-to-br from-purple-100 to-orange-100'
                  }`}>
                    <feature.icon className={`w-6 h-6 ${
                      theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
                    }`} />
                  </div>
                  <div>
                    <h3 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {feature.title}
                    </h3>
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                      {feature.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className={`border-none shadow-lg ${
        theme === 'minimalist' 
          ? 'bg-blue-50' 
          : theme === 'dark'
            ? 'bg-blue-900/20'
            : 'bg-gradient-to-r from-blue-50 to-purple-50'
      }`}>
        <CardContent className="p-8 text-center">
          <h3 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            💪 Built by someone with ADHD, for people with ADHD
          </h3>
          <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
            Every feature is designed around how ADHD brains actually work - not how neurotypical productivity systems think they should work.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}