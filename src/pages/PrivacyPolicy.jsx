import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const Section = ({ title, children, theme }) => (
  <div className="space-y-3">
    <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
    {children}
  </div>
);

const P = ({ children, theme }) => (
  <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{children}</p>
);

const List = ({ items, theme }) => (
  <ul className={`text-sm space-y-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2">
        <span className="mt-1 text-green-500 flex-shrink-0">•</span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  useEffect(() => {
    const interval = setInterval(() => {
      setTheme(localStorage.getItem('adhd_theme') || 'minimalist');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const bg = theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900';
  const cardBg = theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const divider = theme === 'dark' ? 'border-gray-700' : 'border-gray-100';

  return (
    <div className={`min-h-screen ${bg}`} style={{
      paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
      paddingBottom: 'max(3rem, calc(3rem + env(safe-area-inset-bottom)))'
    }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-green-600" />
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>
        <p className={`text-xs mb-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Last updated: May 2026 · ADHDone
        </p>

        <div className={`rounded-2xl border divide-y ${cardBg} ${divider}`}>

          <div className="p-5 space-y-3">
            <P theme={theme}>ADHDone is a productivity and task management app designed for people with ADHD. This policy explains what data we collect, how we use it, and how we protect it.</P>
          </div>

          <div className="p-5">
            <Section title="What We Collect" theme={theme}>
              <List theme={theme} items={[
                "Name and email address",
                "Profile picture and bio (optional)",
                "Tasks, reminders, notes, and parking lot ideas you create",
                "Energy logs and mood check-ins",
                "Achievements, streaks, and progress data",
                "Messages with accountability partners",
                "Support Space conversations",
                "Focus room participation",
                "Device type and push notification tokens (for reminders)",
                "Subscription status via Apple App Store or Google Play (we never store card details)",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="How We Use Your Data" theme={theme}>
              <List theme={theme} items={[
                "To run the app and manage your tasks and reminders",
                "To send push notifications for reminders you've set",
                "To enable accountability partner features and chat",
                "To track your streaks and progress",
                "To provide AI-powered support in the Support Space",
                "To moderate community content for safety",
                "To process your subscription and verify purchases",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="Community Safety" theme={theme}>
              <P theme={theme}>
                All messages in chat are scanned by AI for inappropriate content and personal information sharing. Messages are not manually read unless reported. Users can report and block others at any time. We take reports seriously and review them promptly.
              </P>
              <P theme={theme}>
                ADHDone cannot guarantee the actions of other users. If you encounter suspicious behavior, block and report the user immediately.
              </P>
            </Section>
          </div>

          <div className="p-5">
            <Section title="Data Sharing" theme={theme}>
              <P theme={theme}>We do not sell your data. We only share it in these cases:</P>
              <List theme={theme} items={[
                "With accountability partners — when you connect with someone, they can see your shared check-ins and messages",
                "With service providers — cloud hosting, push notifications (OneSignal), and payment processors, solely to operate the app",
                "When legally required — court orders or to protect user safety",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="Your Rights" theme={theme}>
              <List theme={theme} items={[
                "Access and edit your data anytime in the app",
                "Disable push notifications in your device settings",
                "Request deletion of your data or account",
              ]} />
              <div className="flex flex-wrap gap-2 mt-4">
                <Button onClick={() => navigate(createPageUrl("DeleteData"))} variant="outline" size="sm" className="text-blue-600 border-blue-600 hover:bg-blue-50">
                  Delete My Data
                </Button>
                <Button onClick={() => navigate(createPageUrl("DeleteAccount"))} variant="outline" size="sm" className="text-red-600 border-red-600 hover:bg-red-50">
                  Delete My Account
                </Button>
              </div>
            </Section>
          </div>

          <div className="p-5">
            <Section title="Children" theme={theme}>
              <P theme={theme}>ADHDone is not intended for children under 13. We do not knowingly collect data from children under 13. Contact us immediately if you believe this has occurred.</P>
            </Section>
          </div>

          <div className="p-5">
            <Section title="Your Content" theme={theme}>
              <P theme={theme}>You own everything you create in ADHDone. By using the app, you grant us a limited license to store and process your content solely to provide the service to you.</P>
            </Section>
          </div>

          <div className="p-5">
            <Section title="Policy Updates" theme={theme}>
              <P theme={theme}>We may update this policy occasionally. We'll notify you of material changes in the app. Continued use after changes means you accept the updated policy.</P>
            </Section>
          </div>

          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Contact</span>
            </div>
            <P theme={theme}>Questions about this policy? Email us at{' '}
              <a href="mailto:mediocreatbestdev@outlook.com" className="text-blue-500 hover:underline">
                mediocreatbestdev@outlook.com
              </a>
            </P>
            <p className={`text-xs mt-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>© 2026 ADHDone. All rights reserved.</p>
          </div>

        </div>
      </div>
    </div>
  );
}