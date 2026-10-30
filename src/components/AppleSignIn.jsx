import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { isIPhoneApp } from "@/lib/phonePlatform";

// "Continue with Apple" on the log in and sign up pages (Oct 30 2026, for the
// iPhone app). Apple turns down an iPhone app that offers Google or Facebook
// sign-in without Sign in with Apple next to them (App Store Review Guideline
// 4.8). It shows in the iPhone app only, so Android and the website look the
// same as before. Needs "Apple" switched on in Base44's authentication
// settings; Apple's sign-in page opens inside the app because
// capacitor.config.ts lets appleid.apple.com load there.

function AppleLogo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.37 12.62c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.33-3.54zM14.2 6.16c.61-.74 1.02-1.76.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.22z" />
    </svg>
  );
}

export default function AppleSignInButton({ returnTo = "/" }) {
  if (!isIPhoneApp()) return null;
  return (
    <Button
      variant="outline"
      className="w-full h-12 text-sm font-medium"
      onClick={() => base44.auth.loginWithProvider("apple", returnTo)}
    >
      <AppleLogo className="w-5 h-5 mr-2" />
      Continue with Apple
    </Button>
  );
}
