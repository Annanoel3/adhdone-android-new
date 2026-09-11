import React from "react";
import { Card } from "@/components/brand/BrandSection";

const ITEMS = [
  ["Google Sign-In:", "We use Google OAuth solely to securely authenticate your identity. We do not access your Gmail, Google Drive, or any other Google services through sign-in."],
  ["Google Calendar (optional):", "If you choose to connect Google Calendar, we request read-only access to import your existing events into ADHDone as smart tasks with AI-assigned reminders. This connection is entirely optional and can be disconnected at any time."],
  ["No data sharing:", "We never sell, share, or use your Google data for advertising. Your data is encrypted and used solely to power your ADHDone experience."],
  ["Revoke access anytime:", "You can disconnect Google Calendar or revoke app permissions at any time from your Google account settings or within ADHDone settings."],
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