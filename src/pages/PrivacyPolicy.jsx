import React from "react";
import { Link } from "react-router-dom";
import { Shield, Mail, ExternalLink } from "lucide-react";

const Section = ({ title, children, highlight }) => (
  <div className={`p-5 space-y-3 ${highlight ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
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

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900"
      style={{
        paddingTop: 'max(1rem, calc(1rem + env(safe-area-inset-top)))',
        paddingBottom: 'max(3rem, calc(3rem + env(safe-area-inset-bottom)))'
      }}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Back link */}
        <div className="mb-6">
          <Link to="/" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            ← Back to ADHDone
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-green-600" />
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>
        <p className="text-xs mb-8 text-gray-500">Last updated: June 2026 · ADHDone</p>

        <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm">

          <div className="p-5">
            <P>ADHDone is a productivity and task management app designed for people with ADHD. This policy explains what data we collect, how we use it, and how we protect it.</P>
          </div>

          {/* ── GOOGLE API SECTION ── */}
          <Section title="Google API Limited Use Disclosure" highlight>
            <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm">
              <p className="text-sm leading-relaxed text-gray-800 font-medium">
                "ADHDone's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."
              </p>
            </div>
            <P>Specifically, ADHDone's use of Google Calendar data is subject to the following restrictions:</P>
            <List items={[
              "ADHDone requests read-only access to your primary Google Calendar solely to display your upcoming events within the app, let the AI assign importance levels and reminder frequencies, and route yearly birthday events into ADHDone's birthday feature.",
              "ADHDone never creates, edits, or deletes any events or data in your Google Calendar.",
              "ADHDone never sells, rents, or shares your Google Calendar data with any third party for any purpose.",
              "ADHDone never uses your Google Calendar data for advertising, marketing, or to build advertising profiles.",
              "ADHDone never uses your Google Calendar data to train AI or machine learning models. The AI classification happens in-memory at sync time; your raw calendar data is not retained for model training.",
              "ADHDone does not persistently store raw Google Calendar event data. Only derived metadata (event title, time, AI-assigned importance, and routing decision) is stored to power the in-app task list and deduplication.",
              "You can disconnect Google Calendar at any time from the Calendar page in the app. Disconnecting immediately revokes ADHDone's access to your Google account.",
            ]} />
            <p className="text-xs text-gray-500 mt-2">
              For more information, see the{' '}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                Google API Services User Data Policy <ExternalLink className="w-3 h-3" />
              </a>.
            </p>
          </Section>

          <Section title="What We Collect">
            <List items={[
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
              "Google Calendar metadata — see the Google API section above for full details",
            ]} />
          </Section>

          <Section title="How We Use Your Data">
            <List items={[
              "To run the app and manage your tasks and reminders",
              "To send push notifications for reminders you've set",
              "To enable accountability partner features and chat",
              "To track your streaks and progress",
              "To provide AI-powered support in the Support Space",
              "To moderate community content for safety",
              "To process your subscription and verify purchases",
              "To import Google Calendar events as smart ADHDone tasks (read-only, only when you connect Google Calendar)",
            ]} />
          </Section>

          <Section title="Data Sharing">
            <P>We do not sell your data. We only share it in these cases:</P>
            <List items={[
              "With accountability partners — when you connect with someone, they can see your shared check-ins and messages",
              "With service providers — cloud hosting, push notifications (OneSignal), and payment processors, solely to operate the app",
              "When legally required — court orders or to protect user safety",
            ]} />
          </Section>

          <Section title="Community Safety">
            <P>All messages in chat are scanned by AI for inappropriate content. Messages are not manually read unless reported. Users can report and block others at any time.</P>
            <P>ADHDone cannot guarantee the actions of other users. If you encounter suspicious behavior, block and report the user immediately.</P>
          </Section>

          <Section title="Security">
            <P>We use industry-standard security practices including encrypted data storage and secure connections (HTTPS/TLS). We do not store payment card details — all payments are handled by Apple or Google. While no system is 100% secure, we take reasonable measures to protect your data.</P>
          </Section>

          <Section title="Data Retention">
            <P>We retain your data for as long as your account is active or as needed to provide the service. If you delete your account, we delete your personal data within 30 days, except where retention is required by law. Google Calendar metadata derived from synced events is also deleted upon account deletion.</P>
          </Section>

          <Section title="Your Rights">
            <List items={[
              "Access and edit your data anytime in the app",
              "Disable push notifications in your device settings",
              "Disconnect Google Calendar at any time from the Calendar page",
              "Request deletion of your data or account",
            ]} />
            <div className="flex flex-wrap gap-2 mt-4">
              <Link to="/DeleteData">
                <button className="text-sm px-3 py-1.5 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50">Delete My Data</button>
              </Link>
              <Link to="/DeleteAccount">
                <button className="text-sm px-3 py-1.5 border border-red-600 text-red-600 rounded-lg hover:bg-red-50">Delete My Account</button>
              </Link>
            </div>
          </Section>

          <Section title="Children Under 13">
            <P>ADHDone is not intended for children under 13. We do not knowingly collect data from children under 13. Contact us immediately at mediocreatbestdev@outlook.com if you believe this has occurred.</P>
          </Section>

          <Section title="Your Content & Intellectual Property">
            <P>You own everything you create in ADHDone. By using the app, you grant us a limited license to store and process your content solely to provide the service to you. © 2026 ADHDone. All rights reserved. You may not copy, reproduce, or distribute any part of ADHDone without prior written consent.</P>
          </Section>

          <Section title="Policy Updates">
            <P>We may update this policy occasionally. We'll notify you of material changes in the app. Continued use after changes means you accept the updated policy.</P>
          </Section>

          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-900">Contact</span>
            </div>
            <P>Questions about this policy? Email us at{' '}
              <a href="mailto:mediocreatbestdev@outlook.com" className="text-blue-500 hover:underline">mediocreatbestdev@outlook.com</a>
            </P>
            <p className="text-xs mt-3 text-gray-400">© 2026 ADHDone. All rights reserved.</p>
            <p className="text-xs mt-2 text-gray-500">
              Also see our{' '}
              <Link to="/Terms" className="text-blue-500 hover:underline">Terms & Conditions</Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}