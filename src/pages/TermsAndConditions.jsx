import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Mail } from "lucide-react";
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

export default function TermsAndConditions() {
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
  const divider = theme === 'dark' ? 'divide-gray-700' : 'divide-gray-100';

  return (
    <div className={`min-h-screen ${bg}`} style={{
      paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
      paddingBottom: 'max(3rem, calc(3rem + env(safe-area-inset-bottom)))'
    }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button 
          variant="ghost" 
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/settings');
            }
          }} 
          className="mb-6 p-3 h-12 text-base rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-7 h-7 text-green-600" />
          <h1 className="text-2xl font-bold">Terms & Conditions</h1>
        </div>
        <p className={`text-xs mb-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          Last updated: May 2026 · ADHDone
        </p>

        <div className={`rounded-2xl border divide-y ${cardBg} ${divider}`}>

          <div className="p-5">
            <P theme={theme}>By using ADHDone, you agree to these Terms and Conditions. If you don't agree, please do not use the app.</P>
          </div>

          <div className="p-5">
            <Section title="1. Eligibility" theme={theme}>
              <List theme={theme} items={[
                "You must be at least 13 years of age",
                "You have the legal capacity to enter into this agreement",
                "All information you provide is accurate and truthful",
                "You will use the app in compliance with all applicable laws",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="2. Account Responsibilities" theme={theme}>
              <List theme={theme} items={[
                "You are responsible for keeping your account credentials secure",
                "Notify us immediately of any unauthorized account access",
                "You may only create one account per person",
                "Provide accurate information and keep it up to date",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="3. Acceptable Use" theme={theme}>
              <P theme={theme}>You agree NOT to:</P>
              <List theme={theme} items={[
                "Post harmful, abusive, harassing, or illegal content",
                "Impersonate any person or entity",
                "Spam, phish, or engage in fraudulent activities",
                "Attempt to access other users' accounts or our systems without authorization",
                "Upload viruses or malicious code",
                "Use the app for commercial purposes without our consent",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="4. Subscriptions & Payments" theme={theme}>
              <List theme={theme} items={[
                "New users receive a free trial period. You may cancel anytime during the trial without charge.",
                "After the trial, a subscription is required to continue using ADHDone.",
                "Subscriptions are billed through Apple App Store or Google Play and auto-renew unless canceled at least 24 hours before renewal.",
                "Cancel anytime through your App Store or Google Play account settings.",
                "Refunds are subject to App Store or Google Play policies.",
              ]} />
            </Section>
          </div>

          <div className="p-5">
            <Section title="5. Disclaimer" theme={theme}>
              <P theme={theme}>ADHDone is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service and are not responsible for data loss or damages arising from your use of the app.</P>
              <P theme={theme}><strong>Not a medical service:</strong> ADHDone is a productivity tool and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider regarding medical conditions.</P>
            </Section>
          </div>

          <div className="p-5">
            <Section title="6. Limitation of Liability" theme={theme}>
              <P theme={theme}>To the maximum extent permitted by law, ADHDone and its owners shall not be liable for any indirect, incidental, or consequential damages resulting from your use or inability to use the app, unauthorized access to your data, or content posted by other users.</P>
            </Section>
          </div>

          <div className="p-5">
            <Section title="7. Termination" theme={theme}>
              <P theme={theme}>We may suspend or terminate your account at any time for violations of these terms, abusive behavior, or to protect our users and services. You may delete your account at any time.</P>
              <div className="mt-2">
                <Button onClick={() => navigate(createPageUrl("DeleteAccount"))} variant="outline" size="sm" className="text-red-600 border-red-600 hover:bg-red-50">
                  Delete My Account
                </Button>
              </div>
            </Section>
          </div>

          <div className="p-5">
            <Section title="8. Changes to Terms" theme={theme}>
              <P theme={theme}>We may update these terms occasionally. We'll notify you of material changes in the app. Continued use after changes means you accept the updated terms.</P>
            </Section>
          </div>

          <div className="p-5">
            <Section title="9. Governing Law" theme={theme}>
              <P theme={theme}>These terms are governed by applicable law where ADHDone is registered. Any disputes shall be resolved in the courts of that jurisdiction.</P>
            </Section>
          </div>

          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Contact</span>
            </div>
            <P theme={theme}>Questions about these terms? Email us at{' '}
              <a href="mailto:mediocreatbestdev@outlook.com" className="text-blue-500 hover:underline">
                mediocreatbestdev@outlook.com
              </a>
            </P>
            <p className={`text-xs mt-3 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>© 2026 ADHDone. All rights reserved.</p>
          </div>

          <div className="p-5">
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Also see our{' '}
              <button onClick={() => navigate(createPageUrl("PrivacyPolicy"))} className="text-blue-500 hover:underline">
                Privacy Policy
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}