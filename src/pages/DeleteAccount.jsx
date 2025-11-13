import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, AlertTriangle, Database, Shield, Clock } from "lucide-react";
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
              ADHDone Account Deletion Request
            </CardTitle>
            <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Developed by MediocreAtBestDev
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              This page explains how to request deletion of your ADHDone account. If you only want to delete specific data while keeping your account active, please visit our <a href={createPageUrl("DeleteData")} className={`underline ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>Data Deletion page</a>.
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
                    Important: Account Deletion is Permanent
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-red-300' : 'text-red-800'
                  }`}>
                    Once your account is deleted, it cannot be recovered. All your data will be permanently removed from our active systems.
                  </p>
                </div>
              </div>
            </div>

            {/* Prominent Steps Section */}
            <div className={`p-6 rounded-xl border-2 ${
              theme === 'dark' 
                ? 'bg-blue-900/20 border-blue-700' 
                : 'bg-blue-50 border-blue-300'
            }`}>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Database className="w-6 h-6" />
                How to Delete Your Account
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Follow these simple steps to request account deletion:
              </p>

              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border border-gray-700' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      1
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-semibold mb-2 ${
                        theme === 'dark' ? 'text-white' : 'text-gray-900'
                      }`}>
                        Send an Email to MediocreAtBestDev
                      </h3>
                      <p className={`mb-3 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        Email us at <strong>adhdone.space@gmail.com</strong> with the subject line "Account Deletion Request"
                      </p>
                      <div className={`flex items-center gap-2 p-3 rounded-lg ${
                        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
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
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border border-gray-700' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      2
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-semibold mb-2 ${
                        theme === 'dark' ? 'text-white' : 'text-gray-900'
                      }`}>
                        Include Your Account Information
                      </h3>
                      <p className={`mb-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        In your email, please provide:
                      </p>
                      <ul className={`list-disc list-inside space-y-1 text-sm ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <li>The email address associated with your ADHDone account</li>
                        <li>Your full name as registered in the app</li>
                        <li>Confirmation that you want to permanently delete your account</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border border-gray-700' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      3
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-semibold mb-2 ${
                        theme === 'dark' ? 'text-white' : 'text-gray-900'
                      }`}>
                        We'll Verify Your Identity
                      </h3>
                      <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        For your security, we may ask you to verify your identity before processing the deletion request. We'll respond within 2 business days.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border border-gray-700' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      4
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-semibold mb-2 flex items-center gap-2 ${
                        theme === 'dark' ? 'text-white' : 'text-gray-900'
                      }`}>
                        <Clock className="w-5 h-5" />
                        Account Deletion Processing
                      </h3>
                      <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        Once verified, your account will be deleted within <strong>30 days</strong>. You'll receive a confirmation email when the process is complete.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Deletion Details */}
            <div>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Shield className="w-6 h-6" />
                What Data Will Be Deleted
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                When you delete your account, the following data will be <strong>permanently removed</strong> from our active systems:
              </p>

              <div className="grid gap-3">
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    ❌ Profile & Account Information
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Your name, email address, profile picture, bio, and all account settings.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    ❌ All Tasks & Reminders
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Every task you've created, including sub-tasks, descriptions, and all associated reminders.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    ❌ Parking Lot Ideas
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All ideas and notes stored in your Parking Lot.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    ❌ Progress & Activity Data
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Energy logs, daily summaries, achievements, streaks, weekly challenges, and all progress tracking data.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    ❌ Social Features Data
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Accountability connections, chat messages, mood check-ins, focus room participation, and leaderboard presence.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`font-semibold mb-2 flex items-center gap-2 ${
                    theme === 'dark' ? 'text-red-400' : 'text-red-900'
                  }`}>
                    ❌ Support Space Conversations
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All private conversations with the AI support assistant.
                  </p>
                </div>
              </div>
            </div>

            {/* Data Retention Notice */}
            <div className={`p-4 rounded-lg border ${
              theme === 'dark' 
                ? 'bg-yellow-900/20 border-yellow-800' 
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <h3 className={`font-semibold mb-2 ${
                theme === 'dark' ? 'text-yellow-400' : 'text-yellow-900'
              }`}>
                Data Retention & Exceptions
              </h3>
              <p className={`mb-3 text-sm ${
                theme === 'dark' ? 'text-yellow-300' : 'text-yellow-800'
              }`}>
                Some data may be retained for legal or business purposes:
              </p>
              <ul className={`list-disc list-inside space-y-2 text-sm ${
                theme === 'dark' ? 'text-yellow-300' : 'text-yellow-800'
              }`}>
                <li><strong>Financial records</strong> (subscription payments, refunds) - Required by law for tax and accounting purposes. <strong>Retention period: Up to 7 years</strong></li>
                <li><strong>Anonymized feedback and reports</strong> - Used to improve app safety and may not contain your personally identifiable information. <strong>Retention period: Indefinite (anonymized)</strong></li>
                <li><strong>System backups</strong> - May exist in backups for disaster recovery. <strong>Retention period: Up to 90 days</strong>, but will be inaccessible during normal operations</li>
              </ul>
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
                Before You Delete Your Account
              </h3>
              <ul className={`list-disc list-inside space-y-2 text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <li>Consider requesting a copy of your data before deletion (include this in your email request)</li>
                <li>Cancel your subscription through the App Store or Google Play if you have an active subscription</li>
                <li>Remember that deletion is permanent and cannot be undone</li>
                <li>If you only want to delete specific data, use our <a href={createPageUrl("DeleteData")} className={`underline ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>Data Deletion</a> page instead</li>
              </ul>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => window.location.href = 'mailto:adhdone.space@gmail.com?subject=Account%20Deletion%20Request&body=Hello%20MediocreAtBestDev%2C%0A%0AI%20would%20like%20to%20request%20the%20deletion%20of%20my%20ADHDone%20account.%0A%0AAccount%20Email%3A%20%5Byour%20email%5D%0AFull%20Name%3A%20%5Byour%20name%5D%0A%0AI%20understand%20that%20this%20action%20is%20permanent%20and%20cannot%20be%20undone.%0A%0AThank%20you.'}
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