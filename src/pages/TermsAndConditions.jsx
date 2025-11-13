import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Shield, AlertTriangle, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function TermsAndConditions() {
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
              <FileText className="w-8 h-8" />
              Terms and Conditions
            </CardTitle>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Introduction */}
            <section>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Welcome to ADHDone. By accessing or using our mobile application, you agree to be bound by these Terms and Conditions. Please read them carefully before using the app. If you do not agree with these terms, you may not use ADHDone.
              </p>
            </section>

            {/* Acceptance of Terms */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                1. Acceptance of Terms
              </h2>

              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                By creating an account and using ADHDone, you confirm that:
              </p>

              <ul className={`list-disc list-inside space-y-2 mt-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>You are at least 13 years of age</li>
                <li>You have the legal capacity to enter into this agreement</li>
                <li>You will use the app in compliance with all applicable laws</li>
                <li>All information you provide is accurate and truthful</li>
              </ul>
            </section>

            {/* Account Responsibilities */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <Shield className="w-6 h-6" />
                2. Account Responsibilities
              </h2>

              <div className="space-y-3">
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Account Security
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately of any unauthorized use of your account.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Accurate Information
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    You agree to provide accurate, current, and complete information during registration and to update your information to keep it accurate and current.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    One Account Per Person
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    You may only create one account. Creating multiple accounts may result in suspension or termination of all your accounts.
                  </p>
                </div>
              </div>
            </section>

            {/* Acceptable Use */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                <AlertTriangle className="w-6 h-6" />
                3. Acceptable Use Policy
              </h2>

              <p className={`mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                When using ADHDone, you agree NOT to:
              </p>

              <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>Post or share illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable content</li>
                <li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity</li>
                <li>Use the app to spam, phish, or engage in any fraudulent activities</li>
                <li>Attempt to gain unauthorized access to other users' accounts or the app's systems</li>
                <li>Upload viruses, malware, or any other malicious code</li>
                <li>Scrape, crawl, or use automated means to access the app without permission</li>
                <li>Use the app for any commercial purposes without our express consent</li>
                <li>Violate any applicable local, state, national, or international law</li>
              </ul>
            </section>

            {/* Content Ownership */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                4. Content Ownership and License
              </h2>

              <div className="space-y-3">
                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-900'
                  }`}>
                    Your Content
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    You retain ownership of all content you create in ADHDone (tasks, notes, messages, etc.). By using the app, you grant us a limited license to use, store, and process your content solely to provide and improve our services.
                  </p>
                </div>

                <div className={`p-4 rounded-lg border ${
                  theme === 'dark' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <h3 className={`font-semibold mb-2 ${
                    theme === 'dark' ? 'text-blue-400' : 'text-blue-900'
                  }`}>
                    Our Content
                  </h3>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    ADHDone and all its original content, features, and functionality are owned by us and are protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or reverse engineer any part of the app.
                  </p>
                </div>
              </div>
            </section>

            {/* Subscriptions and Payments */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                5. Subscriptions and Payments
              </h2>

              <ul className={`list-disc list-inside space-y-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li><strong>Free Trial:</strong> New users receive a 7-day free trial. You may cancel at any time during the trial without charge.</li>
                <li><strong>Subscription:</strong> After the trial, a subscription is required to continue using ADHDone. Subscriptions are billed through the App Store or Google Play.</li>
                <li><strong>Billing:</strong> You authorize us to charge your payment method on a recurring basis. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.</li>
                <li><strong>Cancellation:</strong> You can cancel your subscription at any time through your App Store or Google Play account settings. Cancellations take effect at the end of the current billing period.</li>
                <li><strong>Refunds:</strong> Refunds are subject to the policies of the App Store or Google Play Store. Generally, no refunds are provided for partial billing periods.</li>
              </ul>
            </section>

            {/* Disclaimer of Warranties */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                6. Disclaimer of Warranties
              </h2>

              <div className={`p-4 rounded-lg border-2 ${
                theme === 'dark' 
                  ? 'bg-yellow-900/20 border-yellow-800' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-yellow-300' : 'text-yellow-900'
                }`}>
                  <strong>ADHDone is provided "as is" and "as available" without warranties of any kind, either express or implied.</strong> We do not guarantee that the app will be uninterrupted, error-free, or secure. We are not responsible for any data loss, device damage, or other issues arising from your use of the app.
                </p>
              </div>

              <p className={`mt-3 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                <strong>Not a Medical Service:</strong> ADHDone is a productivity tool and is not intended to diagnose, treat, cure, or prevent any medical condition. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with a qualified healthcare provider regarding any medical questions or conditions.
              </p>
            </section>

            {/* Limitation of Liability */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                7. Limitation of Liability
              </h2>

              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                To the maximum extent permitted by law, ADHDone and its owners, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:
              </p>

              <ul className={`list-disc list-inside space-y-1 mt-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>Your use or inability to use the app</li>
                <li>Any unauthorized access to or use of our servers or your data</li>
                <li>Any bugs, viruses, or other harmful code transmitted through the app</li>
                <li>Any content posted by other users</li>
              </ul>
            </section>

            {/* Termination */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                8. Termination
              </h2>

              <p className={`mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                We reserve the right to suspend or terminate your account at any time, without prior notice, for:
              </p>

              <ul className={`list-disc list-inside space-y-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>Violation of these Terms and Conditions</li>
                <li>Abusive or inappropriate behavior</li>
                <li>Fraudulent activity or suspected fraud</li>
                <li>Any other reason we deem necessary to protect our users or services</li>
              </ul>

              <p className={`mt-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                You may terminate your account at any time by requesting <a href={createPageUrl("DeleteAccount")} className={`underline ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>account deletion</a>.
              </p>
            </section>

            {/* Changes to Terms */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                9. Changes to Terms
              </h2>

              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                We may update these Terms and Conditions from time to time. We will notify you of any material changes by posting the new terms in the app and updating the "Last updated" date. Your continued use of ADHDone after changes are posted constitutes your acceptance of the updated terms.
              </p>
            </section>

            {/* Governing Law */}
            <section>
              <h2 className={`text-2xl font-bold mb-4 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                10. Governing Law
              </h2>

              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                These Terms and Conditions shall be governed by and construed in accordance with the laws of the jurisdiction where ADHDone is registered, without regard to its conflict of law provisions. Any disputes shall be resolved in the courts of that jurisdiction.
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
                If you have any questions about these Terms and Conditions, please contact us:
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