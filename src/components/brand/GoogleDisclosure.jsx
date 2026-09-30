import React from "react";
import { Card } from "@/components/brand/BrandSection";

// Sign-in is the only thing ADHDone uses Google for. (Calendar comes from the
// phone's own calendars now, so the old Google Calendar lines are gone.)
const ITEMS = [
  ["Google Sign-In:", "We use Google only to sign you in. That gives ADHDone your name, your email address and your profile picture — nothing else. We never see your Gmail, Drive, Calendar, contacts or anything else in your Google account."],
  ["What we do with it:", "Your email address is your account and where your reminders are addressed; your name is what the app calls you. That's all it's used for."],
  ["No data sharing:", "We never sell or share what we get from Google, and we never use it for advertising."],
  ["Revoke access anytime:", "Remove ADHDone under your Google account's security settings (third-party apps), or request deletion of your ADHDone account from our account deletion page."],
];

export default function GoogleDisclosure() {
  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-[#2F2A2A] mb-4">How ADHDone uses your Google account:</h2>
      <ul className="space-y-3 text-sm text-[#4A4242]">
        {ITEMS.map(([k, v]) => (
          <li key={k} className="flex gap-2">
            <span className="text-[#E07A8B] font-bold flex-shrink-0 mt-0.5">•</span>
            <span><strong>{k}</strong> {v}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-[#7A6F6F]">
        ADHDone's use of Google user data complies with the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-[#D9667A] hover:underline">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
    </Card>
  );
}