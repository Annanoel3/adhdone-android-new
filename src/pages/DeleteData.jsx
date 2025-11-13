import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, AlertTriangle, Database, Shield, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function DeleteData() {
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
              ADHDone Data Deletion Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              This page outlines how to request deletion of some or all of your data while keeping your ADHDone account active. If you wish to delete your entire account, please visit our <a href={createPageUrl("DeleteAccount")} className={`underline ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>Account Deletion page</a>.
            </p>

            <div className={`p-4 rounded-lg border-2 ${
              theme === 'dark' 
                ? 'bg-yellow-900/20 border-yellow-800' 
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
                }`} />
                <div>
                  <h3 className={`font-semibold mb-1 ${
                    theme === 'dark' ? 'text-yellow-400' : 'text-yellow-900'
                  }`}>
                    Important: Data Deletion is Irreversible
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-yellow-300' : 'text-yellow-800'
                  }`}>
                    Once your data is deleted, it cannot be recovered. Your account will remain active, but the deleted data will be permanently removed.
                  </p>
                </div>
              </div>
            </div>

            {/* Steps Section */}
            <div>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Database className="w-6 h-6" />
                How to Request Data Deletion
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
                    To request data deletion, send an email to our support team:
                  </p>
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    theme === 'dark' ? 'bg-gray-800' : 'bg-white'
                  }`}>
                    <Mail className={`w-5 h-5 ${
                      theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                    }`} />
                    <a 
                      href="mailto:adhdone.space@gmail.com?subject=Data%20Deletion%20Request"
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
                    Step 2: Specify What to Delete
                  </h3>
                  <p className={`mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    In your email, please include:
                  </p>
                  <ul className={`list-disc list-inside space-y-1 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <li>The email address associated with your ADHDone account</li>
                    <li>Your full name as registered in the app</li>
                    <li>A clear description of which data you want deleted (see list below)</li>
                    <li>Any specific date ranges or categories you want to keep or delete</li>
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
                    Our team will confirm receipt of your request within 2 business days. We may need to verify your identity to ensure the security of your data. Once verified, your data deletion request will be processed.
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
                    Data deletion requests are typically processed within 30 days of successful verification.
                  </p>
                </div>
              </div>
            </div>

            {/* Types of Data Section */}
            <div>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Shield className="w-6 h-6" />
                Types of Data You Can Request to Delete
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                You can request deletion of any or all of the following data categories:
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
                    Tasks & Reminders
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All tasks, sub-tasks, and associated reminders. You can request deletion of all tasks or tasks from specific date ranges.
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
                    Parking Lot Ideas
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All ideas stored in your Parking Lot. You can choose to delete all ideas or only specific categories.
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
                    Progress Data
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Energy logs, daily summaries, achievements, streaks, and weekly challenges. You can delete all or specific time periods.
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
                    Chat & Connection History
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Messages with accountability partners and connection history. You can delete all messages or messages with specific partners.
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
                    Mood Check-ins
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All mood check-in records and reactions from your accountability partners.
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
                    Support Space Conversations
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    All conversations with the AI support assistant in your private Support Space.
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
                    Focus Room History
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Focus room participation history and session data.
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-lg border mt-4 ${
                theme === 'dark' 
                  ? 'bg-gray-900/50 border-gray-700' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <h4 className={`font-semibold mb-2 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Note: Profile Information
                </h4>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Your basic profile information (name, email, profile picture) must remain to keep your account active. If you want to delete your profile information, you'll need to request full <a href={createPageUrl("DeleteAccount")} className={`underline ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>account deletion</a> instead.
                </p>
              </div>
            </div>

            {/* Data Retention Notice */}
            <div className={`p-4 rounded-lg border ${
              theme === 'dark' 
                ? 'bg-gray-900/50 border-gray-700' 
                : 'bg-gray-50 border-gray-200'
            }`}>
              <h3 className={`font-semibold mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Data That Cannot Be Deleted
              </h3>
              <ul className={`list-disc list-inside space-y-2 text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <li><strong>Financial transaction records</strong> - Required by law for tax and accounting purposes (retained for up to 7 years)</li>
                <li><strong>Anonymized feedback and reports</strong> - Used to improve app safety and may not contain your personally identifiable information</li>
                <li><strong>Backup data</strong> - May exist in backups for up to 90 days but will be inaccessible during normal operations</li>
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
                Additional Information
              </h3>
              <ul className={`list-disc list-inside space-y-2 text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <li>You can request a copy of your data before deletion by including that request in your email</li>
                <li>After data deletion, your account will remain active and you can continue using ADHDone</li>
                <li>You can always create new data after deletion is complete</li>
                <li>For questions about this process, contact us at adhdone.space@gmail.com</li>
              </ul>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => window.location.href = 'mailto:adhdone.space@gmail.com?subject=Data%20Deletion%20Request&body=Hello%2C%0A%0AI%20would%20like%20to%20request%20the%20deletion%20of%20specific%20data%20from%20my%20ADHDone%20account.%0A%0AAccount%20Email%3A%20%5Byour%20email%5D%0AFull%20Name%3A%20%5Byour%20name%5D%0A%0AData%20I%20want%20to%20delete%3A%0A%5BPlease%20describe%20which%20data%20you%20want%20deleted%20-%20e.g.%2C%20%22All%20tasks%22%2C%20%22Chat%20history%20from%20January%202024%22%2C%20etc.%5D%0A%0AThank%20you.'}
                size="lg"
                className={`${
                  theme === 'minimalist'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : theme === 'dark'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                } text-white`}
              >
                <Mail className="w-5 h-5 mr-2" />
                Request Data Deletion
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}