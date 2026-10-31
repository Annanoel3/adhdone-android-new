import React from "react";
import { phonePlatform } from "@/lib/phonePlatform";
import { openInBrowser } from "@/components/utils/openInBrowser";

const SITE = "https://adhdone.space";

// Pages that are a single screen of their own, not a page to scroll to the end of.
const SKIP = new Set(["TaskNotification", "AuthCallback", "SpotifyCallback", "NotificationDemo"]);

// The very bottom of every page in the phone apps: ADHDone also works in a
// browser, at adhdone.space (Anna, Oct 31 2026: "some people might actually
// wanna use it. So we should let users know the url is adhdone.space ... at
// the very bottom of each page? It can be clicked and will open in browser").
// Not shown on the website itself: they're already there.
export default function WebAddressFooter({ theme, seasonal, currentPageName }) {
  if (phonePlatform() === "web") return null;
  if (SKIP.has(currentPageName)) return null;

  const dark = theme === "dark" && !seasonal;

  return (
    <div
      className={`text-center text-xs px-4 pt-6 ${dark ? "text-gray-400" : "text-gray-500"}`}
      style={{ paddingBottom: "max(6rem, calc(5rem + env(safe-area-inset-bottom, 0px)))" }}
    >
      ADHDone works on your computer too:{" "}
      <a
        href={SITE}
        onClick={(e) => { e.preventDefault(); openInBrowser(SITE); }}
        className={`font-medium underline ${dark ? "text-purple-300" : "text-purple-700"}`}
      >
        adhdone.space
      </a>
    </div>
  );
}
