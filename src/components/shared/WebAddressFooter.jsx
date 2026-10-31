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
// One small line (Anna, Oct 31 2026: "too big of a bar at the bottom"): short
// enough to stay clear of the round mic button in the bottom-right corner.
export default function WebAddressFooter({ theme, seasonal, currentPageName }) {
  if (phonePlatform() === "web") return null;
  if (SKIP.has(currentPageName)) return null;

  const dark = theme === "dark" && !seasonal;

  return (
    <p
      className={`text-center text-[11px] leading-tight px-4 pt-2 ${dark ? "text-gray-500" : "text-gray-400"}`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      Also on the web:{" "}
      <a
        href={SITE}
        onClick={(e) => { e.preventDefault(); openInBrowser(SITE); }}
        className={`underline ${dark ? "text-purple-300" : "text-purple-600"}`}
      >
        adhdone.space
      </a>
    </p>
  );
}
