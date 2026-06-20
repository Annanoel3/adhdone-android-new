import React from "react";
import { Link } from "react-router-dom";
import { FileText, Mail } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="p-5 space-y-3">
    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
    {children}
  </div>
);

const P = ({ children }) => (
  <p className="text-sm leading-relaxed text-gray-700">{children}</p>
);

const List = ({ items }) => (
  <ul className="text-sm space-y-1.5 text-gray-700">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2">
        <span className="mt-1 text-green-500 flex-shrink-0">•</span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

export default function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900"
      style={{
        paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
        paddingBottom: 'max(3rem, calc(3rem + env(safe-area-inset-bottom)))'
      }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        <div className="mb-6">
          <Link to="/" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            ← Back to ADHDone
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-7 h-7 text-green-600" />
          <h1 className="text-2xl font-bold">Terms & Conditions</h1>
        </div>
        <p className="text-xs mb-8 text-gray-500">Last updated: June 2026 · ADHDone</p>

        <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm">

          <div className="p-5">
            <P>By using ADHDone, you agree to these Terms and Conditions. If you don't agree, please do not use the app.</P>
          </div>

          <Section title="1. Eligibility">
            <List items={[
              "You must be at least 13 years of age",
              "You have the legal capacity to enter into this agreement",
              "All information you provide is accurate and truthful",
              "You will use the app in compliance with all applicable laws",
            ]} />
          </Section>

          <Section title="2. Account Responsibilities">
            <List items={[
              "You are responsible for keeping your account credentials secure",
              "Notify us immediately of any unauthorized account access",
              "You may only create one account per person",
              "Provide accurate information and keep it up to date",
            ]} />
          </Section>

          <Section title="3. Acceptable Use">
            <P>You agree NOT to:</P>
            <List items={[
              "Post harmful, abusive, harassing, or illegal content",
              "Impersonate any person or entity",
              "Spam, phish, or engage in fraudulent activities",
              "Attempt to access other users' accounts or our systems without authorization",
              "Upload viruses or malicious code",
              "Use the app for commercial purposes without our consent",
            ]} />
          </Section>

          <Section title="4. Third-Party Integrations">
            <P>ADHDone offers optional integrations with third-party services, including Google Calendar. By connecting a third-party account you also agree to that provider's terms of service and privacy policy. ADHDone's use of Google Calendar data is governed by the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google API Services User Data Policy</a>.
              See our <Link to="/privacypolicy" className="text-blue-500 hover:underline">Privacy Policy</Link> for full details on how Google data is used.
            </P>
            <List items={[
              "Google Calendar access is read-only — ADHDone never modifies your Google Calendar",
              "You can disconnect any third-party integration at any time from within the app",
              "ADHDone is not responsible for the availability or accuracy of third-party services",
            ]} />
          </Section>

          <Section title="5. Subscriptions & Payments">
            <List items={[
              "New users receive a free trial period. You may cancel anytime during the trial without charge.",
              "After the trial, a subscription is required to continue using ADHDone.",
              "Subscriptions are billed through Apple App Store or Google Play and auto-renew unless canceled at least 24 hours before renewal.",
              "Cancel anytime through your App Store or Google Play account settings.",
              "Refunds are subject to App Store or Google Play policies.",
            ]} />
          </Section>

          <Section title="6. Disclaimer">
            <P>ADHDone is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service and are not responsible for data loss or damages arising from your use of the app.</P>
            <P><strong>Not a medical service:</strong> ADHDone is a productivity tool and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider regarding medical conditions.</P>
          </Section>

          <Section title="7. Limitation of Liability">
            <P>To the maximum extent permitted by law, ADHDone and its owners shall not be liable for any indirect, incidental, or consequential damages resulting from your use or inability to use the app, unauthorized access to your data, or content posted by other users.</P>
          </Section>

          <Section title="8. Termination">
            <P>We may suspend or terminate your account at any time for violations of these terms, abusive behavior, or to protect our users and services. You may delete your account at any time.</P>
            <div className="mt-2">
              <Link to="/DeleteAccount">
                <button className="text-sm px-3 py-1.5 border border-red-600 text-red-600 rounded-lg hover:bg-red-50">Delete My Account</button>
              </Link>
            </div>
          </Section>

          <Section title="9. Changes to Terms">
            <P>We may update these terms occasionally. We'll notify you of material changes in the app. Continued use after changes means you accept the updated terms.</P>
          </Section>

          <Section title="10. Governing Law">
            <P>These terms are governed by applicable law where ADHDone is registered. Any disputes shall be resolved in the courts of that jurisdiction.</P>
          </Section>

          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-900">Contact</span>
            </div>
            <P>Questions about these terms? Email us at{' '}
              <a href="mailto:mediocreatbestdev@outlook.com" className="text-blue-500 hover:underline">mediocreatbestdev@outlook.com</a>
            </P>
            <p className="text-xs mt-3 text-gray-400">© 2026 ADHDone. All rights reserved.</p>
            <p className="text-xs mt-2 text-gray-500">
              Also see our{' '}
              <Link to="/privacypolicy" className="text-blue-500 hover:underline">Privacy Policy</Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}