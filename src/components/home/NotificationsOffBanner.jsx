import React, { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { ONBOARDING_STEPS, isStepDone, markStepDone } from "@/components/onboarding/onboardingGate";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { alarmPermissionStatus } from "@/components/utils/widgetBridge";

// Asked once per app launch, not every time the user comes back to Home.
let blockedThisLaunch = null;

// Someone who said no to notifications during setup is asked once more, in a
// plain popup, the next time they open the app: never in the same sitting as
// their answer (that would be nagging), and never a second time.
const REASK_STEP = "onboarding_notifications_reask_done";
const launchedAt = Date.now();
function reaskDue() {
  if (isStepDone(REASK_STEP) || !isStepDone(ONBOARDING_STEPS.permissions)) return false;
  let answeredAt = 0;
  try {
    answeredAt = Number(localStorage.getItem("notifications_setup_answered_at")) || 0;
  } catch (e) {
    /* answered before this was kept: that was an earlier launch */
  }
  return !answeredAt || answeredAt < launchedAt || Date.now() - answeredAt > 12 * 60 * 60 * 1000;
}

// True only when there is proof that reminders cannot reach this phone.
async function pushIsBlocked() {
  // The phone's own answer comes first (AlarmBridge.getStatus, builds 1.3.9+):
  // Android's notification permission for ADHDone, as it is right now. OneSignal
  // is asked only when the phone can't say, because what it has on file lags
  // behind: right after a reinstall or an update it can still list only the
  // old, switched-off subscription, and this told people with notifications
  // on that they were off.
  try {
    const st = await alarmPermissionStatus();
    if (typeof st?.notifications === "boolean") return !st.notifications;
  } catch (e) {
    /* this build can't say — ask OneSignal instead */
  }
  const bridge = window.Capacitor?.Plugins?.NotifyBridge;
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
  const [reask, setReask] = useState(false);
  const reaskShown = usePopupTurn(reask);

  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    // During first run the app has not asked for permission yet (that comes
    // after the Home tour), so there is nothing to report in that session.
    if (!isStepDone(ONBOARDING_STEPS.homeTour)) return;
    if (blockedThisLaunch !== null) {
      if (blockedThisLaunch && reaskDue()) setReask(true);
      return;
    }

    let cancelled = false;
    pushIsBlocked()
      .then((result) => {
        blockedThisLaunch = result;
        if (!cancelled) {
          setBlocked(result);
          if (result && reaskDue()) setReask(true);
        }
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
  const closeReask = () => {
    markStepDone(REASK_STEP);
    setReask(false);
  };

  const turnOn = async () => {
    if (reask) closeReask();
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
    <>
    <Dialog open={reaskShown} onOpenChange={(o) => { if (!o) closeReask(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] bg-card text-card-foreground border-border">
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <BellOff className="w-5 h-5 text-amber-600" />
            <h2 className="text-xl font-bold text-foreground">Your reminders can't reach you</h2>
          </div>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Notifications are off for ADHDone on this phone, so none of your reminders, alarms or check-ins
            ever show up. Turn them on and they'll start coming through.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={closeReask}>Not now</Button>
            <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={turnOn} disabled={working}>
              Turn on
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    </>
  );
}