import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, AlertTriangle, Trash2, Shield, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function DeleteAccount() {
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
    <div className="min-h-screen p-4 md:p-8" style={{
      paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
      paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))'
    }}>
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className={`border-none shadow-lg mb-6 ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`text-3xl ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              ADHDone Account Deletion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              This page outlines the process for users of the ADHDone mobile application to request deletion of their account and all associated data.
            </p>

            <div className={`p-4 rounded-lg border-2 ${
              theme === 'dark' 
                ? 'bg-red-900/20 border-red-800' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  theme === 'dark' ? 'text-red-400' : 'text-red-600'
                }`} />
                <div>
                  <h3 className={`font-semibold mb-1 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    Important: This Action is Irreversible
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-red-300' : 'text-red-800'
                  }`}>
                    Once your account is deleted, your data cannot be recovered. Please make sure you want to proceed before submitting a deletion request.
                  </p>
                </div>
              </div>
            </div>

            {/* Steps Section */}
            <div>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Trash2 className="w-6 h-6" />
                How to Request Account Deletion
              </h2>

              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Step 1: Contact Support
                  </h3>
                  <p className={`mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    To request account deletion, send an email to our support team:
                  </p>
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                  }`}>
                    <Mail className={`w-5 h-5 ${
                      theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                    }`} />
                    <a 
                      href="mailto:adhdone.space@gmail.com?subject=Account%20Deletion%20Request"
                      className={`font-medium ${
                        theme === 'dark' 
                          ? 'text-blue-400 hover:text-blue-300' 
                          : 'text-blue-600 hover:text-blue-700'
                      }`}
                    >
                      adhdone.space@gmail.com
                    </a>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Step 2: Provide Information
                  </h3>
                  <p className={`mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    In your email, please include:
                  </p>
                  <ul className={`list-disc list-inside space-y-1 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <li>The email address associated with your ADHDone account</li>
                    <li>Your full name as registered in the app</li>
                    <li>A clear statement requesting the deletion of your account and all associated data</li>
                  </ul>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Step 3: Confirmation
                  </h3>
                  <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                    Our team will confirm receipt of your request within 2 business days. We may need to verify your identity to ensure the security of your data. Once verified, your account and data will be processed for deletion.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    <Clock className="w-5 h-5" />
                    Step 4: Processing Time
                  </h3>
                  <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                    Account deletion requests are typically processed within 30 days of successful verification.
                  </p>
                </div>
              </div>
            </div>

            {/* Data Deletion Section */}
            <div>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Shield className="w-6 h-6" />
                What Data is Deleted
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Upon successful account deletion, the following personal data associated with your ADHDone account will be permanently removed from our active databases:
              </p>

              <ul className={`list-disc list-inside space-y-2 mb-6 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <li>Your user profile (name, email, profile picture, bio, preferences)</li>
                <li>All tasks, sub-tasks, and associated reminders</li>
                <li>Parking Lot ideas</li>
                <li>Energy logs, daily summaries, and achievement records</li>
                <li>Accountability partner connections and chat messages</li>
                <li>Mood check-ins and reactions</li>
                <li>Focus room data where you were the host or participant</li>
                <li>Weekly challenges and progress data</li>
                <li>Any other user-generated content directly stored within the app</li>
              </ul>

              <h3 className={`text-xl font-semibold mb-3 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Data That May Be Retained
              </h3>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Certain data may be retained for a limited period due to legal, regulatory, or operational requirements:
              </p>

              <div className="space-y-3">
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <h4 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-900'
                  }`}>
                    Financial Transaction Data
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Records related to subscriptions or purchases may be retained for up to 7 years for tax, accounting, and compliance purposes. This data will be anonymized where possible and will not be linked to your active profile.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <h4 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-900'
                  }`}>
                    User Feedback & Reports
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Anonymous feedback or reports of inappropriate content that do not contain personally identifiable information may be retained to improve app safety and functionality. If a report contained your personally identifiable information, it will be anonymized.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <h4 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-900'
                  }`}>
                    Backup Data
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Residual copies of your data may remain in our backup systems for up to 90 days but will be inaccessible during normal operations and will be subject to our data retention policies.
                  </p>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className={`p-4 rounded-lg border ${
              theme === 'dark' 
                ? 'bg-gray-900/50 border-gray-700' 
                : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`font-semibold mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Additional Information
              </h3>
              <ul className={`list-disc list-inside space-y-2 text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <li>You can request a copy of your data before deletion by including that request in your email</li>
                <li>If you have an active subscription, it will be canceled upon account deletion</li>
                <li>For questions about this process, contact us at adhdone.space@gmail.com</li>
              </ul>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => window.location.href = 'mailto:adhdone.space@gmail.com?subject=Account%20Deletion%20Request&body=Hello%2C%0A%0AI%20would%20like%20to%20request%20the%20deletion%20of%20my%20ADHDone%20account.%0A%0AAccount%20Email%3A%20%5Byour%20email%5D%0AFull%20Name%3A%20%5Byour%20name%5D%0A%0APlease%20delete%20my%20account%20and%20all%20associated%20data.%0A%0AThank%20you.'}
                size="lg"
                className={`${
                  theme === 'minimalist'
                    ? 'bg-red-600 hover:bg-red-700'
                    : theme === 'dark'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800'
                } text-white`}
              >
                <Mail className="w-5 h-5 mr-2" />
                Request Account Deletion
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}