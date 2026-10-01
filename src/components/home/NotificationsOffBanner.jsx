import React, { useEffect, useState } from "react";
import { BellOff, CalendarOff, AlarmClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { ONBOARDING_STEPS, isStepDone, markStepDone } from "@/components/onboarding/onboardingGate";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { alarmPermissionStatus, refreshAlarms } from "@/components/utils/widgetBridge";
import {
  deviceCalendarPermissionLost,
  DEVICE_PERMISSION_EVENT,
  requestDeviceCalendarPermission,
  runDeviceCalendarSync,
} from "@/lib/calendarSync";

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

// One row on Home for someone on full-screen alarms whose phone still has a
// switch off that alarms need (exact alarms, full-screen, display over other
// apps, battery). Without it an alarm is late, quiet, or stuck in the tray —
// and the only other time the app raised it was a popup at most once a day.
// "Finish setup" opens the same walkthrough, with just the missing rows.
// Stays quiet while notifications themselves are off (the row above covers
// that, and alarms can't work without them anyway) and during first run.
const ALARM_SETUP_STEP = "onboarding_alarm_setup_done";
// Answering the alarms-or-notifications question is enough to be asked about
// the switches: someone who picked alarms and then closed the app on the
// sound step never reaches the set-up step, and used to be left with alarms
// on and nothing ever pointing at the switches (Rycher, Sep 30 2026).
const ALERT_STYLE_STEP = "onboarding_alert_style_done";
function alarmSwitchesMissing(st) {
  if (!st) return 0;
  return [
    !st.exactAlarms,
    !st.fullScreen,
    !st.ignoringBatteryOptimizations,
    st.overlay === false,
  ].filter(Boolean).length;
}

export function AlarmSetupBanner({ theme, specialMode, user }) {
  const [status, setStatus] = useState(null);
  const [working, setWorking] = useState(false);
  const alarmsOn = user?.alarm_mode === "alarm";

  useEffect(() => {
    if (!alarmsOn || !window.Capacitor?.isNativePlatform?.()) return;
    if (!isStepDone(ONBOARDING_STEPS.homeTour)) return;
    if (!isStepDone(ALARM_SETUP_STEP) && !isStepDone(ALERT_STYLE_STEP)) return;
    let gone = false;
    const check = () => {
      alarmPermissionStatus()
        .then((st) => { if (!gone) setStatus(st || null); })
        .catch(() => {});
    };
    check();
    // Coming back from a settings screen, or from the walkthrough's own
    // bounces out to Android, re-reads the switches so the row goes away.
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    let handle = null;
    Promise.resolve(window.Capacitor?.Plugins?.App?.addListener?.("appStateChange", ({ isActive }) => {
      if (isActive) check();
    }))
      .then((h) => { if (gone) h?.remove?.(); else handle = h; })
      .catch(() => {});
    // The walkthrough grants some switches in a dialog drawn over the app, so
    // nothing above fires: a slow poll catches those.
    const poll = setInterval(check, 15000);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(poll);
      handle?.remove?.();
    };
  }, [alarmsOn]);

  if (!alarmsOn || !status || status.notifications === false) return null;
  const missing = alarmSwitchesMissing(status);
  if (missing === 0) return null;

  const finish = () => {
    setWorking(true);
    window.dispatchEvent(new CustomEvent("alarm-permissions-needed", { detail: status }));
    setTimeout(() => setWorking(false), 1500);
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
      <AlarmClock className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className={`flex-1 min-w-0 text-sm ${dark ? "text-gray-200" : "text-gray-800"}`}>
        {missing === 1
          ? "One switch your alarms need is still off, so they may be late or silent."
          : `${missing} switches your alarms need are still off, so they may be late or silent.`}
      </span>
      <Button
        size="sm"
        onClick={finish}
        disabled={working}
        className="h-8 px-2.5 flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
      >
        Finish setup
      </Button>
    </div>
  );
}

// One row on Home while the phone won't let ADHDone read the calendars the
// user chose to import. A reinstall or an update can take that permission
// away; the sync on app open then fails quietly, and the calendar's events
// stop coming in with nothing on screen to say so.
export function CalendarOffBanner({ theme, specialMode, user }) {
  const [lost, setLost] = useState(() => deviceCalendarPermissionLost());
  const [working, setWorking] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const onChange = (e) => setLost(!!e?.detail?.lost);
    window.addEventListener(DEVICE_PERMISSION_EVENT, onChange);
    return () => window.removeEventListener(DEVICE_PERMISSION_EVENT, onChange);
  }, []);

  const ids = user?.device_calendar_ids;
  if (!window.Capacitor?.isNativePlatform?.() || !lost || !Array.isArray(ids) || ids.length === 0) return null;

  const allow = async () => {
    setWorking(true);
    try {
      const ok = await requestDeviceCalendarPermission();
      if (ok) {
        // A successful read clears the flag (and this row) on its own.
        await runDeviceCalendarSync(ids);
        refreshAlarms().catch(() => {});
      } else {
        // Android stops asking after two refusals; only Settings can turn it on.
        setDenied(true);
      }
    } catch (e) {
      setDenied(true);
    }
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
      <CalendarOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className={`flex-1 min-w-0 text-sm ${dark ? "text-gray-200" : "text-gray-800"}`}>
        {denied
          ? "Your phone didn't ask. Turn on Calendar for ADHDone under Settings → Apps → ADHDone → Permissions, then open the app again."
          : "ADHDone can't read your phone's calendar any more, so those events aren't coming in."}
      </span>
      {!denied && (
        <Button
          size="sm"
          onClick={allow}
          disabled={working}
          className="h-8 px-2.5 flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
        >
          Allow
        </Button>
      )}
    </div>
  );
}