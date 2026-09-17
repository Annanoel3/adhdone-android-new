import React, { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { ONBOARDING_STEPS, isStepDone } from "@/components/onboarding/onboardingGate";

// Asked once per app launch, not every time the user comes back to Home.
let blockedThisLaunch = null;

// True only when there is proof that reminders cannot reach this phone.
async function pushIsBlocked() {
  const bridge = window.Capacitor?.Plugins?.NotifyBridge;

  // Newer app builds can ask the phone directly.
  try {
    const state = await bridge?.getPermissionState?.();
    if (typeof state?.granted === "boolean") return !state.granted;
  } catch (e) {
    /* this build can't say — ask OneSignal instead */
  }

  // Older builds: ask OneSignal what it has on file for this account. Blocked
  // means it knows a subscription for this kind of phone and none is switched on.
  const res = await base44.functions.invoke("myPushStatus", {});
  const data = res?.data || {};
  if (!data.success || !data.known) return false;
  const type = window.Capacitor?.getPlatform?.() === "ios" ? "iOSPush" : "AndroidPush";
  return (data.pushTypes || []).includes(type) && !(data.enabledPushTypes || []).includes(type);
}

// One compact row on Home, shown only in the phone app and only when reminders
// cannot reach it. A reminder app that has been silenced should say so.
export default function NotificationsOffBanner({ theme, specialMode }) {
  const [blocked, setBlocked] = useState(blockedThisLaunch === true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    // During first run the app has not asked for permission yet (that comes
    // after the Home tour), so there is nothing to report in that session.
    if (!isStepDone(ONBOARDING_STEPS.homeTour)) return;
    if (blockedThisLaunch !== null) return;

    let cancelled = false;
    pushIsBlocked()
      .then((result) => {
        blockedThisLaunch = result;
        if (!cancelled) setBlocked(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!blocked) return null;

  // Shows Android's own permission prompt or, when Android won't show it again,
  // OneSignal's prompt that opens this app's notification settings. Resolves once
  // the user has answered (or come back from settings).
  const turnOn = async () => {
    setWorking(true);
    try {
      await window.Capacitor?.Plugins?.NotifyBridge?.requestPermission?.();
    } catch (e) {
      /* nothing to do — the row simply goes away until the next launch */
    }
    // The user has just dealt with it. OneSignal takes a moment to hear about a
    // change, so check again on the next launch rather than right now.
    blockedThisLaunch = false;
    setBlocked(false);
    setWorking(false);
  };

  const dark = theme === "dark";
  const shell = `rounded-xl border px-3 py-2 flex items-center gap-2.5 ${
    specialMode && specialMode !== "normal"
      ? `${specialMode}-card`
      : dark
        ? "bg-gray-800 border-gray-700"
        : "bg-amber-50 border-amber-200"
  }`;

  return (
    <div className={shell} role="status">
      <BellOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className={`flex-1 min-w-0 text-sm ${dark ? "text-gray-200" : "text-gray-800"}`}>
        Notifications are off for ADHDone on this phone, so reminders can't reach you.
      </span>
      <Button
        size="sm"
        onClick={turnOn}
        disabled={working}
        className="h-8 px-2.5 flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
      >
        Turn on
      </Button>
    </div>
  );
}