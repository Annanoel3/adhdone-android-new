
import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function TermsAndConditions() {
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
          <FileText className="w-8 h-8" />
          Terms and Conditions
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
              1. Acceptance of Terms
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              By accessing or using ADHDone ("the App"), you agree to be bound by these Terms and Conditions. 
              If you do not agree to these terms, please do not use the App.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              2. Description of Service
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              ADHDone is a productivity application designed to help users with ADHD manage tasks, focus sessions, 
              reminders, and connect with accountability partners. The App includes both free and premium features.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              3. Subscription Terms
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p><strong>Free Trial:</strong> New users receive a 5-day free trial of premium features. You may cancel at any time during the trial period to avoid charges.</p>
              <p><strong>Subscription Plans:</strong> We offer monthly and yearly subscription plans. Pricing is displayed in the App and may vary by region.</p>
              <p><strong>Billing:</strong> Subscriptions are billed through the Apple App Store or Google Play Store. Payment will be charged to your App Store or Play Store account at confirmation of purchase.</p>
              <p><strong>Auto-Renewal:</strong> Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period.</p>
              <p><strong>Cancellation:</strong> You can cancel your subscription at any time through your App Store or Play Store account settings. Cancellation takes effect at the end of the current billing period.</p>
              <p><strong>Refunds:</strong> Refunds are handled by Apple or Google according to their respective policies. We cannot issue refunds directly.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              4. User Account and Responsibilities
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p>• You are responsible for maintaining the confidentiality of your account credentials.</p>
              <p>• You agree to provide accurate, current information when creating your account.</p>
              <p>• You are responsible for all activities that occur under your account.</p>
              <p>• You must be at least 13 years old to use the App.</p>
              <p>• You agree not to misuse the App, including attempting to hack, spam, or disrupt the service.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              5. User Content
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p><strong>Your Content:</strong> You retain ownership of all tasks, notes, and other content you create in the App.</p>
              <p><strong>License to Us:</strong> By using the App, you grant us a limited license to store, process, and display your content solely to provide the service to you.</p>
              <p><strong>Shared Content:</strong> Content you share with accountability partners is subject to your privacy settings. We are not responsible for how partners use shared information.</p>
              <p><strong>Prohibited Content:</strong> You may not post or share content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              6. Intellectual Property
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              The App, including its design, features, text, graphics, logos, and software, is owned by ADHDone and protected by copyright, 
              trademark, and other intellectual property laws. You may not copy, modify, distribute, or reverse engineer any part of the App 
              without our express written permission.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              7. AI Features
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              The App uses artificial intelligence to provide features like task breakdown, smart reminders, and personalized tips. 
              AI-generated suggestions are for informational purposes only and should not be considered professional medical, 
              psychological, or therapeutic advice. Always consult qualified professionals for medical or mental health concerns.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              8. Disclaimers
            </h2>
            <div className={`space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p><strong>No Medical Advice:</strong> ADHDone is a productivity tool, not a medical device or treatment. It does not diagnose, treat, or cure ADHD or any other condition.</p>
              <p><strong>"As Is" Service:</strong> The App is provided "as is" without warranties of any kind, express or implied.</p>
              <p><strong>No Guarantee:</strong> We do not guarantee the App will be uninterrupted, error-free, or meet your specific needs.</p>
              <p><strong>Third-Party Services:</strong> The App integrates with third-party services (AI, notifications, etc.). We are not responsible for these services' availability or performance.</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              9. Limitation of Liability
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              To the maximum extent permitted by law, ADHDone and its creators shall not be liable for any indirect, incidental, 
              special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, 
              or any loss of data, use, goodwill, or other intangible losses resulting from:
            </p>
            <div className={`space-y-1 mt-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <p>• Your use or inability to use the App</p>
              <p>• Any unauthorized access to or use of your data</p>
              <p>• Any bugs, viruses, or other harmful code</p>
              <p>• Any errors or omissions in content</p>
              <p>• Any actions of accountability partners or other users</p>
            </div>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              10. Indemnification
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              You agree to indemnify and hold harmless ADHDone, its creators, and affiliates from any claims, damages, losses, 
              liabilities, and expenses (including legal fees) arising from your use of the App, violation of these Terms, 
              or infringement of any third-party rights.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              11. Termination
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              We reserve the right to suspend or terminate your account at any time, with or without notice, for violations of these Terms 
              or any reason we deem appropriate. Upon termination, you lose access to premium features immediately. 
              You may delete your account at any time through the My Account page.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              12. Changes to Terms
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              We may update these Terms from time to time. We will notify you of significant changes through the App or via email. 
              Continued use of the App after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              13. Governing Law
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              These Terms are governed by and construed in accordance with the laws of the jurisdiction in which ADHDone operates, 
              without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              14. Dispute Resolution
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              Any disputes arising from these Terms or your use of the App shall be resolved through binding arbitration, 
              except where prohibited by law. You agree to waive any right to a jury trial or to participate in a class action lawsuit.
            </p>
          </section>

          <section>
            <h2 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              15. Contact Us
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              If you have questions about these Terms, please contact us through the Report a Bug feature in the app settings, 
              or email us at adhdone.space@gmail.com
            </p>
          </section>

          <div className={`pt-6 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              By using ADHDone, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
