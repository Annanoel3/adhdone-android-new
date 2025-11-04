
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function PrivacyPolicy() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-3xl font-bold mb-2 flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          <Shield className="w-8 h-8" />
          Privacy Policy
        </h1>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Last updated: January 9, 2025
        </p>
      </div>

      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white/90 backdrop-blur-sm'
      }`}>
        <CardContent className="p-6 md:p-8 space-y-6">
          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              1. Information We Collect
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p><strong>Account Information:</strong> When you create an account, we collect your email address and name.</p>
              <p><strong>Task Data:</strong> Tasks, reminders, notes, and brain dump items you create in the app.</p>
              <p><strong>Usage Data:</strong> How you interact with the app, including energy check-ins, focus sessions, and completed tasks.</p>
              <p><strong>Accountability Data:</strong> Messages and connections with accountability partners you choose to connect with.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              2. How We Use Your Information
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p>• To provide and improve ADHDone's productivity features</p>
              <p>• To send you task reminders and notifications (only if enabled)</p>
              <p>• To generate personalized insights and daily tips</p>
              <p>• To enable accountability partner features</p>
              <p>• To process your subscription payments</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              3. Data Sharing
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p><strong>We do NOT sell your data.</strong></p>
              <p><strong>Accountability Partners:</strong> If you choose to connect with accountability partners, they can see your progress summaries and messages you send them.</p>
              <p><strong>Service Providers:</strong> We use trusted services like Stripe for payments, OpenAI for AI features, and OneSignal for notifications. These services only receive data necessary to provide their functionality.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              4. Data Security
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              Your data is encrypted in transit and at rest. We use industry-standard security practices to protect your information. All authentication is handled securely through OAuth providers.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              5. Your Rights
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p><strong>Access:</strong> You can view all your data within the app at any time.</p>
              <p><strong>Delete:</strong> You can delete your account and all associated data from the My Account page.</p>
              <p><strong>Control:</strong> You can disable notifications and control what data you share with accountability partners.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              6. Children's Privacy
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              ADHDone is not intended for children under 13. We do not knowingly collect information from children under 13.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              7. Changes to This Policy
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              We may update this privacy policy from time to time. We'll notify you of significant changes through the app or via email.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              8. Contact Us
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              If you have questions about this privacy policy or your data, please contact us through the Report a Bug feature in the app settings, or email us at adhdone.space@gmail.com
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
