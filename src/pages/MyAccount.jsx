import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  User as UserIcon, 
  CreditCard, 
  MessageSquare, 
  Loader2,
  Heart,
  Star,
  Bell,
  Info,
  Settings,
  Shield,
  Trash2
} from "lucide-react";
import { User } from "@/entities/User";
import { UserFeedback } from "@/entities/UserFeedback";
import { SendEmail } from "@/integrations/Core";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function MyAccount() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [user, setUser] = useState(null);
  const [feedbackType, setFeedbackType] = useState('general');
  const [reason, setReason] = useState('');
  const [detailedFeedback, setDetailedFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    loadUser();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!detailedFeedback.trim()) {
      alert("Please share your feedback before submitting.");
      return;
    }

    setIsSubmittingFeedback(true);

    try {
      await UserFeedback.create({
        feedback_type: feedbackType,
        reason: reason || null,
        detailed_feedback: detailedFeedback,
        rating: rating > 0 ? rating : null
      });

      await SendEmail({
        to: "adhdone.space@gmail.com",
        subject: `User Feedback - ${feedbackType}`,
        body: `
User: ${user.full_name} (${user.email})
Type: ${feedbackType}
${reason ? `Reason: ${reason}` : ''}
${rating > 0 ? `Rating: ${rating}/5 stars` : ''}

Feedback:
${detailedFeedback}
        `,
        from_name: "ADHDone Feedback"
      });

      setFeedbackSubmitted(true);
      setDetailedFeedback('');
      setReason('');
      setRating(0);

      setTimeout(() => {
        setFeedbackSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("Failed to submit feedback. Please try again.");
    }

    setIsSubmittingFeedback(false);
  };

  const testPushNotification = async () => {
    try {
      const response = await fetch('/api/sendOneSignalPush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: user.email,
          title: "Test Notification 🎉",
          message: "Success! Your notifications are working perfectly.",
          data: { type: 'test' }
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert("Test notification sent! Check your device in a few seconds.");
      } else {
        throw new Error(data.error || "Failed to send notification");
      }
    } catch (error) {
      console.error("Error sending test notification:", error);
      alert("Failed to send test notification. Error: " + error.message);
    }
  };

  if (!user) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          My Account
        </h1>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Manage your subscription and share feedback
        </p>
      </div>

      <div className="grid gap-6">
        {/* Account Info */}
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white/90 backdrop-blur-sm'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <UserIcon className="w-5 h-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Name</p>
              <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {user.full_name}
              </p>
            </div>
            <div>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Email</p>
              <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {user.email}
              </p>
            </div>
            <div>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Level</p>
              <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Level {user.level || 1} • {user.total_points || 0} points
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Management */}
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white/90 backdrop-blur-sm'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <CreditCard className="w-5 h-5" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Status</p>
              <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {user.has_paid ? '✅ Active Subscriber' : '⏰ Trial Period'}
              </p>
            </div>
            
            {user.has_paid && user.subscription_start_date && (
              <div>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Member Since</p>
                <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {new Date(user.subscription_start_date).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </p>
              </div>
            )}

            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {user.has_paid 
                ? 'Manage your subscription through the App Store or Play Store settings on your device.'
                : 'Subscribe to unlock all features and support the development of ADHDone!'
              }
            </p>
          </CardContent>
        </Card>

        {/* Data & Privacy Management */}
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white/90 backdrop-blur-sm'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Shield className="w-5 h-5" />
              Data & Privacy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              Manage your data, privacy settings, and account deletion options.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                onClick={() => navigate(createPageUrl("PrivacyPolicy"))}
                variant="outline"
                className="h-auto py-3 flex flex-col items-start gap-1"
              >
                <div className="flex items-center gap-2 w-full">
                  <Shield className="w-4 h-4" />
                  <span className="font-medium">Privacy Policy</span>
                </div>
                <span className="text-xs text-left text-gray-500">
                  How we protect your data
                </span>
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("TermsAndConditions"))}
                variant="outline"
                className="h-auto py-3 flex flex-col items-start gap-1"
              >
                <div className="flex items-center gap-2 w-full">
                  <Shield className="w-4 h-4" />
                  <span className="font-medium">Terms & Conditions</span>
                </div>
                <span className="text-xs text-left text-gray-500">
                  Our terms of service
                </span>
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("DeleteData"))}
                variant="outline"
                className="h-auto py-3 flex flex-col items-start gap-1 text-blue-600 border-blue-600 hover:bg-blue-50"
              >
                <div className="flex items-center gap-2 w-full">
                  <Trash2 className="w-4 h-4" />
                  <span className="font-medium">Delete My Data</span>
                </div>
                <span className="text-xs text-left text-blue-600/80">
                  Keep account, remove data
                </span>
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("DeleteAccount"))}
                variant="outline"
                className="h-auto py-3 flex flex-col items-start gap-1 text-red-600 border-red-600 hover:bg-red-50"
              >
                <div className="flex items-center gap-2 w-full">
                  <Trash2 className="w-4 h-4" />
                  <span className="font-medium">Delete Account</span>
                </div>
                <span className="text-xs text-left text-red-600/80">
                  Permanently close account
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Push Notifications Testing */}
        <Card className={`border-none shadow-md ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white/80 backdrop-blur-sm'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Bell className="w-5 h-5" />
              Push Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              Test your push notifications and manage your notification preferences.
            </p>
            
            <div className={`p-4 rounded-lg ${
              theme === 'minimalist' 
                ? 'bg-blue-50 border border-blue-200' 
                : theme === 'dark'
                  ? 'bg-blue-900/20 border border-blue-800'
                  : 'bg-gradient-to-r from-blue-100 to-purple-100 border border-blue-200'
            }`}>
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className={`font-medium mb-1 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                    Automatic Notifications:
                  </p>
                  <ul className={`space-y-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    <li>• Task reminders (based on your reminder settings)</li>
                    <li>• Achievement unlocked notifications</li>
                    <li>• Accountability partner messages and pokes</li>
                    <li>• Trial expiration warnings</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={testPushNotification}
                variant="outline"
                className="flex-1"
              >
                <Bell className="w-4 h-4 mr-2" />
                Send Test Notification
              </Button>
              
              <Button
                onClick={() => navigate(createPageUrl("NotificationSettings"))}
                variant="outline"
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feedback Section */}
        <Card className={`border-none shadow-lg ${
          theme === 'minimalist' 
            ? 'bg-gradient-to-br from-purple-50 to-blue-50' 
            : theme === 'dark'
              ? 'bg-gray-800'
              : 'bg-gradient-to-br from-purple-100 to-pink-100'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Heart className="w-5 h-5" />
              We Value Your Feedback
            </CardTitle>
            <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Whether you're staying or going, we'd love to hear from you. Your feedback helps us build a better app for everyone with ADHD.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedbackSubmitted ? (
              <div className={`p-6 rounded-xl text-center ${
                theme === 'minimalist' 
                  ? 'bg-green-50 border border-green-200' 
                  : theme === 'dark'
                    ? 'bg-green-900/20 border border-green-800'
                    : 'bg-green-100 border border-green-300'
              }`}>
                <Heart className={`w-12 h-12 mx-auto mb-3 ${
                  theme === 'dark' ? 'text-green-400' : 'text-green-600'
                }`} />
                <h3 className={`font-bold text-lg mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Thank you!
                </h3>
                <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                  Your feedback means the world to us. We read every single message.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Feedback Type</Label>
                  <Select value={feedbackType} onValueChange={setFeedbackType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Feedback</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="bug_report">Bug Report</SelectItem>
                      <SelectItem value="cancellation">Thinking About Canceling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {feedbackType === 'cancellation' && (
                  <div className="space-y-2">
                    <Label className={theme === 'dark' ? 'text-gray-200' : ''}>What's the main reason?</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="too_expensive">Too expensive</SelectItem>
                        <SelectItem value="not_using">Not using it enough</SelectItem>
                        <SelectItem value="missing_features">Missing features I need</SelectItem>
                        <SelectItem value="technical_issues">Technical issues</SelectItem>
                        <SelectItem value="found_alternative">Found a better alternative</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
                    How can we improve? {feedbackType === 'cancellation' && '(We genuinely want to make this better)'}
                  </Label>
                  <Textarea
                    value={detailedFeedback}
                    onChange={(e) => setDetailedFeedback(e.target.value)}
                    placeholder="Share your thoughts, suggestions, or concerns..."
                    className="min-h-[120px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className={theme === 'dark' ? 'text-gray-200' : ''}>
                    Rate your experience (optional)
                  </Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star 
                          className={`w-8 h-8 ${
                            star <= rating 
                              ? 'fill-yellow-400 text-yellow-400' 
                              : theme === 'dark'
                                ? 'text-gray-600'
                                : 'text-gray-300'
                          }`} 
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmittingFeedback || !detailedFeedback.trim()}
                  className={`w-full ${
                    theme === 'minimalist' 
                      ? 'bg-purple-600 hover:bg-purple-700' 
                      : theme === 'dark'
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                  }`}
                >
                  {isSubmittingFeedback ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Submit Feedback
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}