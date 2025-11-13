import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Eye, Lock, Database, UserCheck, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PrivacyPolicy() {
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
            <CardTitle className={`text-3xl flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              <Shield className="w-8 h-8" />
              Privacy Policy
            </CardTitle>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Introduction */}
            <section>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Welcome to ADHDone. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, store, and protect your information when you use our mobile application.
              </p>
            </section>

            {/* Information We Collect */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Database className="w-6 h-6" />
                Information We Collect
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
                    Account Information
                  </h3>
                  <ul className={`list-disc list-inside space-y-1 text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <li>Name and email address</li>
                    <li>Profile picture (optional)</li>
                    <li>Bio and preferences</li>
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
                    Usage Data
                  </h3>
                  <ul className={`list-disc list-inside space-y-1 text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <li>Tasks and reminders you create</li>
                    <li>Parking lot ideas and notes</li>
                    <li>Energy logs and mood check-ins</li>
                    <li>Progress tracking data (achievements, streaks)</li>
                    <li>Focus room participation</li>
                    <li>Messages with accountability partners</li>
                    <li>Support space conversations</li>
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
                    Device Information
                  </h3>
                  <ul className={`list-disc list-inside space-y-1 text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <li>Device type and operating system</li>
                    <li>Push notification tokens (for reminders)</li>
                    <li>App version and performance data</li>
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
                    Payment Information
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Payment processing is handled by Apple App Store and Google Play Store. We do not store your credit card information. We only receive transaction confirmations and subscription status.
                  </p>
                </div>
              </div>
            </section>

            {/* How We Use Your Information */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Eye className="w-6 h-6" />
                How We Use Your Information
              </h2>

              <ul className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Provide app functionality:</strong> Store and manage your tasks, reminders, and productivity data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Send notifications:</strong> Deliver task reminders and updates you've requested</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Enable social features:</strong> Facilitate connections with accountability partners and chat functionality</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Improve our services:</strong> Analyze usage patterns to enhance app features (anonymized data only)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Provide support:</strong> Respond to your questions and resolve technical issues</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span><strong>Ensure safety:</strong> Moderate content and prevent abuse of the platform</span>
                </li>
              </ul>
            </section>

            {/* Data Security */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Lock className="w-6 h-6" />
                Data Security
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                We implement industry-standard security measures to protect your data:
              </p>

              <ul className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">🔒</span>
                  <span><strong>Encryption in transit:</strong> All data is encrypted using HTTPS/TLS when transmitted between your device and our servers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">🔒</span>
                  <span><strong>Secure storage:</strong> Your data is stored on secure, enterprise-grade cloud infrastructure</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">🔒</span>
                  <span><strong>Access controls:</strong> Strict authentication and authorization mechanisms protect your account</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">🔒</span>
                  <span><strong>Regular backups:</strong> Your data is backed up regularly to prevent loss</span>
                </li>
              </ul>
            </section>

            {/* Data Sharing */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <UserCheck className="w-6 h-6" />
                Data Sharing and Disclosure
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                We do not sell your personal data. We may share your information only in the following circumstances:
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
                    With Your Consent
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    When you connect with accountability partners, your profile information and shared data (mood check-ins, messages) are visible to those partners.
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
                    Service Providers
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    We use trusted third-party services (cloud hosting, push notifications, payment processing) that may have access to your data only to perform services on our behalf.
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
                    Legal Requirements
                  </h4>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    We may disclose your information if required by law, court order, or to protect the rights, property, or safety of ADHDone, our users, or others.
                  </p>
                </div>
              </div>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Your Rights and Choices
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                You have the following rights regarding your personal data:
              </p>

              <ul className={`space-y-2 mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">▸</span>
                  <span><strong>Access:</strong> You can view your data at any time within the app</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">▸</span>
                  <span><strong>Correction:</strong> You can edit your profile information and data directly in the app</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">▸</span>
                  <span><strong>Deletion:</strong> You can request deletion of specific data or your entire account</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">▸</span>
                  <span><strong>Export:</strong> You can request a copy of your data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">▸</span>
                  <span><strong>Opt-out:</strong> You can disable push notifications in your device settings</span>
                </li>
              </ul>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => navigate(createPageUrl("DeleteData"))}
                  variant="outline"
                  className="text-blue-600 border-blue-600 hover:bg-blue-50"
                >
                  Request Data Deletion
                </Button>
                <Button
                  onClick={() => navigate(createPageUrl("DeleteAccount"))}
                  variant="outline"
                  className="text-red-600 border-red-600 hover:bg-red-50"
                >
                  Request Account Deletion
                </Button>
              </div>
            </section>

            {/* Children's Privacy */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Children's Privacy
              </h2>

              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                ADHDone is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected information from a child under 13, please contact us immediately.
              </p>
            </section>

            {/* Changes to Policy */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Changes to This Privacy Policy
              </h2>

              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy in the app and updating the "Last updated" date. Your continued use of ADHDone after changes are posted constitutes your acceptance of the updated policy.
              </p>
            </section>

            {/* Contact */}
            <section className={`p-6 rounded-lg border ${
              theme === 'dark' 
                ? 'bg-gray-900/50 border-gray-700' 
                : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'
            }`}>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Mail className="w-6 h-6" />
                Contact Us
              </h2>

              <p className={`mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>

              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-white'
              }`}>
                <Mail className={`w-5 h-5 ${
                  theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                }`} />
                <a 
                  href="mailto:adhdone.space@gmail.com"
                  className={`font-medium ${
                    theme === 'dark' 
                      ? 'text-blue-400 hover:text-blue-300' 
                      : 'text-blue-600 hover:text-blue-700'
                  }`}
                >
                  adhdone.space@gmail.com
                </a>
              </div>
            </section>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}