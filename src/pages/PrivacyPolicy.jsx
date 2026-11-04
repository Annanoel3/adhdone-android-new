import React from "react";
import { Link } from "react-router-dom";
import { Shield, Mail, ExternalLink } from "lucide-react";
import { isIPhoneApp } from "@/lib/phonePlatform";

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
        <p className="text-xs mb-8 text-gray-500">Last updated: November 2026 · ADHDone</p>

        <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm">

          <div className="p-5">
            <P>ADHDone is a productivity and task management app designed for people with ADHD. This policy explains what data we collect, how we use it, and how we protect it.</P>
          </div>

          {/* Your phone's calendar. The Google Calendar connection (Google's
              own calendar API) was retired Oct 1 2026; the phone app reads
              the calendars on the phone instead (syncGoogleCalendar, device
              source). This section replaced the Google API Limited Use
              disclosure on Nov 3 2026. */}
          <Section title="Your Phone's Calendar (optional)" highlight>
            <P>If you allow calendar access, the ADHDone phone app reads events from the calendars you pick on your phone (Google, Samsung, Outlook, or any other calendar app on the phone) so they show up as ADHDone tasks and reminders.</P>
            <List items={[
              "ADHDone keeps the event's title, time, place, and the importance the AI assigns it, so it can remind you and avoid importing the same event twice.",
              "ADHDone never changes or deletes anything in your calendar. The only time it adds to your calendar is when you tap \"Add to phone calendar\" on an event, and your phone's own calendar screen asks you to confirm.",
              "ADHDone never sells or shares your calendar data, never uses it for advertising, and never uses it to train AI models.",
              "You can turn calendar reading off at any time on the Calendar page, or in your phone's app permissions.",
            ]} />
          </Section>

          <Section title="Advertising">
            <P>The free version of ADHDone shows ads through Google AdMob. To show and measure ads, Google may collect your device's advertising identifier, IP address, approximate location, and which ads you saw or tapped. ADHDone never hands Google your tasks, notes, or recordings. You can limit ad personalization in your phone's settings {isIPhoneApp() ? "(Settings → Privacy → Tracking and Apple Advertising)" : "(Android: Settings → Google → Ads; iPhone: Settings → Privacy → Tracking and Apple Advertising)"}.</P>
            <p className="text-xs text-gray-500 mt-2">
              See{' '}
              <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                how Google uses data in ads <ExternalLink className="w-3 h-3" />
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
              ...(isIPhoneApp() ? [] : ["Messages with accountability partners"]),
              "Support Space conversations",
              ...(isIPhoneApp() ? [] : ["Focus room participation"]),
              "Device type and push notification tokens (for reminders)",
              isIPhoneApp() ? "Purchases of Record Notes minute packs through the App Store (we never see or store card details)" : "Purchases of Record Notes minute packs through Google Play or the App Store (we never see or store card details)",
              "Events from the phone calendars you choose to share — see the calendar section above",
              "A contact's name and phone number, only when you use \"Pick from Contacts\" on a birthday. ADHDone never reads your full contact list; your phone's own picker hands over just the one you chose.",
              "Photos you attach to a task",
              "Voice recordings you choose to make (adding a task by voice, or Record Notes), which are uploaded so they can be turned into text; the text is kept with your task or notes",
              "What you write about yourself in Settings → Personalization, so reminders can fit your day",
              "Which screens you open and when, so we can see what is working and fix what is not (never the words you type)",
            ]} />
          </Section>

          <Section title="How We Use Your Data">
            <List items={[
              "To run the app and manage your tasks and reminders",
              "To send push notifications for reminders you've set",
              ...(isIPhoneApp() ? [] : ["To enable accountability partner features and chat"]),
              "To track your streaks and progress",
              "To provide AI-powered support in the Support Space",
              ...(isIPhoneApp() ? [] : ["To moderate community content for safety"]),
              "To verify purchases of Record Notes minutes",
              "To turn the phone calendar events you share into ADHDone tasks and reminders (read-only, only when you allow calendar access)",
              "To show ads in the free version",
            ]} />
          </Section>

          <Section title="Data Sharing">
            <P>We do not sell your data. We only share it in these cases:</P>
            <List items={[
              ...(isIPhoneApp() ? [] : ["With accountability partners — when you connect with someone, they can see your shared check-ins and messages"]),
              "With service providers, solely to operate the app — cloud hosting (Base44), push notifications (OneSignal), AI processing (OpenAI, which reads the task text, recordings and notes you ask the app to understand, plan reminders for, or transcribe), ads (Google AdMob), and purchases (" + (isIPhoneApp() ? "RevenueCat, the App Store" : "RevenueCat, Google Play, the App Store") + ")",
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
            <P>We retain your data for as long as your account is active or as needed to provide the service. If you delete your account, we delete your personal data within 30 days, except where retention is required by law. Calendar events imported from your phone, attached photos, and recordings are deleted with your account.</P>
          </Section>

          <Section title="Your Rights">
            <List items={[
              "Access and edit your data anytime in the app",
              "Disable push notifications in your device settings",
              "Turn calendar reading off at any time on the Calendar page or in your phone's app permissions",
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