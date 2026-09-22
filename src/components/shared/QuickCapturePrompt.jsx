// Two first-run surfaces that both teach the same thing: you do not have to
// open ADHDone to put something in it. They share the native bridge helper
// below, and they must never be on screen at the same time, so they live
// together. They would be two files if that were possible — the Base44 editor
// can only edit files that already exist, so a new component has to join an
// existing one.

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Zap, LayoutGrid, Bell, AlarmClock, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  ONBOARDING_STEPS,
  waitForStep,
  isStepDone,
  markStepDone,
} from '@/components/onboarding/onboardingGate';
import {
  waitForCalm,
  enterOnboardingSurface,
  exitOnboardingSurface,
} from '@/components/onboarding/onboardingSurface';
import {
  setAlarmMode,
  refreshAlarms,
  alarmPermissionStatus,
  requestAlarmPermissions,
} from '../utils/widgetBridge';
import { AlarmSoundPicker } from '../settings/QuickCaptureCard';

const SEEN_KEY = 'quick_capture_prompt_seen';

const getPlugins = () => {
  const p = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};
  return { ShareBridge: p.ShareBridge, NotifyBridge: p.NotifyBridge };
};

// The permissions card, right after the Home tour: one screen that says why
// notifications matter, fires Android's own prompt from a button, and offers
// the pinned quick-capture shortcut on the same card (on by default). Asked
// once, then never again — the shortcut's toggle lives in Settings either way.
// OneSignalInit waits for this card's answer before it would ask on its own.
export default function QuickCapturePrompt() {
  const { NotifyBridge } = getPlugins();
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinWanted, setPinWanted] = useState(true);

  const settle = () => {
    localStorage.setItem(SEEN_KEY, 'true');
    markStepDone(ONBOARDING_STEPS.permissions);
  };

  useEffect(() => {
    // Once per ACCOUNT. The older device-only "seen" flag doesn't count, so
    // accounts that met the stand-alone pinned-shortcut offer still get this
    // card once — it also carries the notification explanation.
    if (isStepDone(ONBOARDING_STEPS.permissions)) return;

    let cancelled = false;

    // The native bridge usually isn't attached yet on first mount, so poll for
    // it. Everything after that is readiness-driven, not timed: this is the
    // LAST step of the sequence (welcome → tour → notification permission →
    // this), and it waits for a calm screen — nothing else open, and the user
    // not mid-typing or mid-tap.
    const start = Date.now();
    const poll = setInterval(() => {
      const { ShareBridge } = getPlugins();
      if (ShareBridge?.setQuickCaptureEnabled) {
        clearInterval(poll);
        waitForStep(ONBOARDING_STEPS.homeTour)
          .then(waitForCalm)
          .then(() => {
            if (cancelled) return;
            // Shown whether or not the shortcut is already pinned — the card is
            // also where notifications get explained, and the switch starts on.
            if (!cancelled) setOpen(true);
          });
      } else if (Date.now() - start > 15000) {
        // Not a native build (or no bridge) — nothing to offer.
        clearInterval(poll);
      }
    }, 500);

    return () => { cancelled = true; clearInterval(poll); };
  }, []);

  // Registered as an onboarding surface so nothing can stack on top of it.
  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const handleAllow = async () => {
    setBusy(true);
    try {
      if (NotifyBridge?.requestPermission) await NotifyBridge.requestPermission();
      if (pinWanted) await getPlugins().ShareBridge?.setQuickCaptureEnabled({ enabled: true });
    } catch (e) {
      // Nothing to recover here — the Settings toggle shows the real error.
    } finally {
      settle();
      setBusy(false);
      setOpen(false);
    }
  };

  const handleDecline = () => {
    settle();
    setDeclined(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { settle(); setOpen(false); } }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-green-600" />
            We need to ask for a couple of permissions
          </DialogTitle>
          <DialogDescription>
            So you can get the most out of ADHDone. First, Android will ask if it can send
            you notifications — every reminder and alarm rides on that.
          </DialogDescription>
        </DialogHeader>

        {declined ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              No problem — both are waiting in Settings whenever you want them.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full">Got it</Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Second, pin a quick-capture shortcut</p>
                  <p className="text-xs text-gray-600">
                    A shortcut in your notification tray. Thought hits, you tap it, it's
                    saved — no opening the app, no losing it.
                  </p>
                </div>
              </div>
              <Switch checked={pinWanted} onCheckedChange={setPinWanted} aria-label="Pin the quick-capture shortcut" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAllow} disabled={busy} className="flex-1">
                {busy ? 'One sec...' : 'Allow notifications'}
              </Button>
              <Button onClick={handleDecline} variant="outline" className="flex-1">
                Not now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── "You don't even have to open the app" ────────────────────────────────────

// The two share-sheet screenshots, cropped out of the Play Store graphics down
// to the part nobody recognises on their own: ADHDone sitting in the Android
// share row next to Gmail. Embedded as data URIs so there is no upload step,
// nothing that can 404 and no extra request — about 9 KB each.
const SHARE_TEXT_ART = "data:image/webp;base64,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";

const SHARE_PHOTO_ART = "data:image/webp;base64,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";

const WAYS_FIRST_OPEN = 'onboarding_ways_first_open';
const WAYS_SEEN = 'onboarding_ways_seen';

// Shown ONCE, on the second app open.
//
// Why not the first: on day one there is nothing in the app yet, so there is no
// slow way to shortcut past and the point has nothing to land on.
//
// Why two of the four get a picture and two get a line: the share sheet IS the
// lesson for sharing, and no sentence teaches it — you have to see ADHDone in
// that row. The pinned notification and the widget are visible objects sitting
// on the phone; our first user found the pinned one and used it without ever
// being told it existed.
export function WaysToAddPopup({ user }) {
  const [open, setOpen] = useState(false);
  const [quickCaptureOn, setQuickCaptureOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Wait for the account's onboarding flags to be copied down before reading
    // them, or this replays for someone who already saw it and has just signed
    // in on a new phone.
    if (!user || started.current) return;
    started.current = true;
    if (isStepDone(WAYS_SEEN)) return;

    // A waiting "was that a request for the app?" prompt goes first, and
    // answering it marks this popup seen — so nobody is handed first-run
    // education in the middle of that.
    const fb = user.pending_feedback_prompt;
    if (fb?.text && !fb?.answered_at) return;

    let cancelled = false;
    const startedAt = Date.now();

    // Ask whether the pinned notification is already on, wait for the first-run
    // sequence to be finished and for the screen to be calm, then show it. If
    // the quick capture check fails we simply do not offer it — never claim a
    // state we have not confirmed.
    const show = () => {
      const { ShareBridge } = getPlugins();
      ShareBridge?.isQuickCaptureEnabled?.()
        .then((res) => { if (!cancelled) setQuickCaptureOn(!!res?.enabled); })
        .catch(() => {});
      waitForStep(ONBOARDING_STEPS.homeTour)
        .then(waitForCalm)
        .then(() => { if (!cancelled) setOpen(true); });
    };

    // Same poll as above: the bridge attaches a moment after the web layer
    // boots. No bridge at all means a browser, where none of these four ways
    // exist and there would be nothing to offer.
    const poll = setInterval(() => {
      const { ShareBridge } = getPlugins();
      if (ShareBridge) {
        clearInterval(poll);
        if (cancelled) return;

        // First open: note it and say nothing.
        if (!isStepDone(WAYS_FIRST_OPEN)) {
          markStepDone(WAYS_FIRST_OPEN);
          return;
        }

        show();
      } else if (Date.now() - startedAt > 15000) {
        clearInterval(poll);
      }
    }, 500);

    return () => { cancelled = true; clearInterval(poll); };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const close = () => {
    markStepDone(WAYS_SEEN);
    setOpen(false);
  };

  const handleEnablePinned = async () => {
    setBusy(true);
    try {
      const { ShareBridge, NotifyBridge } = getPlugins();
      if (NotifyBridge?.requestPermission) await NotifyBridge.requestPermission();
      await ShareBridge?.setQuickCaptureEnabled({ enabled: true });
    } catch (e) {
      // The Settings toggle reports the real reason. A first-run popup is the
      // wrong place to explain a permission failure.
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-border">
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              You don't even have to open the app
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Four ways to get a task or an idea in from wherever you already are. It sorts out the
              date and the reminders itself.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[15px] font-semibold text-foreground">Share text from anywhere</p>
            <p className="text-sm text-muted-foreground">Highlight it, hit Share, pick ADHDone.</p>
            <img
              src={SHARE_TEXT_ART}
              alt="An Android share sheet with ADHDone in the app row next to Gmail and Messenger"
              className="w-full rounded-xl border border-border"
              loading="lazy"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[15px] font-semibold text-foreground">Share a screenshot</p>
            <p className="text-sm text-muted-foreground">
              A flyer, an invite, an appointment card — share the picture in and it reads it.
            </p>
            <img
              src={SHARE_PHOTO_ART}
              alt="Sharing a screenshot of an event flyer into ADHDone from the Android share sheet"
              className="w-full rounded-xl border border-border"
              loading="lazy"
            />
          </div>

          <div className="space-y-3 rounded-xl bg-muted/50 p-4">
            <div className="flex gap-3">
              <Zap className="w-5 h-5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">The pinned notification.</span>{' '}
                Sits in your tray — expand it, type it, it's saved.
              </p>
            </div>
            <div className="flex gap-3">
              <LayoutGrid className="w-5 h-5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">The home screen widget.</span>{' '}
                Today's list, with an add button on it.
              </p>
            </div>
          </div>

          {quickCaptureOn === false ? (
            <div className="flex gap-2">
              <Button onClick={handleEnablePinned} disabled={busy} className="flex-1">
                {busy ? 'Turning on...' : 'Pin the notification'}
              </Button>
              <Button onClick={close} variant="outline" className="flex-1">
                Got it
              </Button>
            </div>
          ) : (
            <Button onClick={close} className="w-full">
              Got it
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Alarms: the explanation, the first-task question, the permissions walk ──
//
// Three more surfaces that belong together (and, again, would be their own
// files if the editor could make one). All Android-only: they wait for the
// AlarmBridge plugin and do nothing where it never appears.

function waitForPlugin(name, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = setInterval(() => {
      const p = window.Capacitor?.Plugins?.[name];
      if (p) {
        clearInterval(poll);
        resolve(p);
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(poll);
        resolve(null);
      }
    }, 500);
  });
}

// The difference, in two lines. Used by the (i) next to every task's switch and
// by the first-task question, so the wording is the same everywhere.
export function AlertStyleInfo({ dark = false }) {
  const sub = dark ? 'text-gray-400' : 'text-gray-600';
  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-2">
        <Bell className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Regular notification</p>
          <p className={`text-xs ${sub}`}>Shows up in your tray like any app's. Easy to miss when the phone is face down.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <AlarmClock className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Full-screen alarm</p>
          <p className={`text-xs ${sub}`}>Rings out loud like an alarm clock, takes over the screen even when it's locked, and keeps going until you snooze or dismiss it.</p>
        </div>
      </div>
      <p className={`text-xs ${sub}`}>Same reminder times either way — only how they reach you changes.</p>
    </div>
  );
}

// Android keeps three things off until the user says yes, and an alarm without
// them is late, quiet, or stuck in the tray. This walks them through it the
// first time they turn an alarm on (requestAlarmPermissions fires it only when
// something is actually missing). Each button bounces out to a settings screen;
// coming back re-checks and ticks the row.
export function AlarmPermissionsDialog({ theme }) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  // First-time set-up: the same dialog also carries the alarm-sound chooser,
  // which needs the account record for the current choice.
  const [setup, setSetup] = useState(false);
  const [me, setMe] = useState(null);
  // 'timers': asked the first time a focus timer, sprint or launchpad starts —
  // those always ring like an alarm, so the wording says why.
  const [feature, setFeature] = useState('');

  useEffect(() => {
    const onNeeded = (e) => {
      setStatus(e.detail || null);
      const isSetup = !!e.detail?.setup;
      setSetup(isSetup);
      setFeature(e.detail?.feature || '');
      if (isSetup) base44.auth.me().then(setMe).catch(() => {});
      setOpen(true);
    };
    window.addEventListener('alarm-permissions-needed', onNeeded);
    return () => window.removeEventListener('alarm-permissions-needed', onNeeded);
  }, []);

  // Re-reads the phone's answer for every row. Some of these grants happen in
  // a system dialog drawn OVER this screen (notifications, battery), so the
  // page never goes hidden and a visibilitychange listener alone never fired;
  // others come back from a settings screen a beat before Android reports the
  // new state. So: poll while the dialog is open, plus an immediate re-read
  // when the user comes back and when a request resolves.
  const refreshRef = useRef(() => {});
  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    let stopped = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      alarmPermissionStatus().then((s) => {
        if (!stopped && s) setStatus((prev) => ({ ...(prev || {}), ...s }));
      }).catch(() => {});
    };
    refreshRef.current = refresh;
    const timer = setInterval(refresh, 1500);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      refreshRef.current = () => {};
      exitOnboardingSurface();
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [open]);

  if (!status) return null;
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  const { NotifyBridge } = getPlugins();
  const tryOpen = (fn) => {
    try {
      Promise.resolve(fn())
        .catch(() => {})
        .then(() => { refreshRef.current(); setTimeout(() => refreshRef.current(), 800); });
    } catch (e) { /* stays on the list */ }
  };

  const rows = [
    {
      key: 'notifications',
      ok: !!status.notifications,
      label: 'Notifications',
      why: "The alarm can't show at all without them.",
      action: () => tryOpen(() => NotifyBridge?.requestPermission?.()),
    },
    {
      key: 'exact',
      ok: !!status.exactAlarms,
      label: 'Alarms & reminders',
      why: 'Rings at the exact minute instead of "sometime in the next ten".',
      action: () => tryOpen(() => AlarmBridge?.openExactAlarmSettings?.()),
    },
    {
      key: 'fullscreen',
      ok: !!status.fullScreen,
      label: 'Full-screen notifications',
      why: 'Lets the alarm take over the screen when the phone is locked.',
      action: () => tryOpen(() => AlarmBridge?.openFullScreenSettings?.()),
    },
    // Only builds that report it get the row; older builds skip it silently.
    ...(status.overlay === undefined ? [] : [{
      key: 'overlay',
      ok: !!status.overlay,
      label: 'Display over other apps',
      why: "Lets the alarm take over the screen while you're using the phone. Without it Android only shows a banner.",
      action: () => tryOpen(() => AlarmBridge?.openOverlaySettings?.()),
    }]),
    {
      key: 'battery',
      ok: !!status.ignoringBatteryOptimizations,
      label: 'Battery: unrestricted',
      why: 'Samsung puts sleeping apps to bed; a sleeping app can ring late or not at all.',
      action: () => tryOpen(() => AlarmBridge?.requestIgnoreBatteryOptimizations?.()),
    },
  ];
  const allOk = rows.every((r) => r.ok);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <AlarmClock className="w-5 h-5" />
            {feature === 'timers'
              ? 'Timers ring like an alarm'
              : setup ? 'Set up full-screen reminders' : allOk ? 'All set — your phone can ring it' : 'Let your phone ring the alarm'}
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            {feature === 'timers'
              ? "The focus timer, 5-minute sprints and the launchpad ring when their time is up, so Android needs these switched on. You can say no — they'll still work, just quieter and easier to miss."
              : setup
              ? (allOk
                ? 'Pick the sound it rings with. Every switch Android needed is already on.'
                : "Pick the sound it rings with, then let Android know it may ring — tap each one and you'll hop out to a settings screen and straight back.")
              : allOk
                ? 'Every switch Android needed is on.'
                : "Android keeps these off until you say yes. Tap each one — you'll hop out to a settings screen and straight back."}
          </DialogDescription>
        </DialogHeader>

        {setup && <AlarmSoundPicker user={me} theme={theme} className="pb-1" />}

        <div className={`divide-y ${dark ? 'divide-gray-700' : 'divide-gray-200'}`}>
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.label}</p>
                <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{r.why}</p>
              </div>
              {r.ok ? (
                <span className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0">
                  <Check className="w-4 h-4" /> On
                </span>
              ) : (
                <Button size="sm" onClick={r.action} className="flex-shrink-0">Allow</Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          {allOk ? (
            <Button onClick={() => setOpen(false)} className="w-full">Done</Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full">
              Later — it's in Settings → Alarms
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Asked ONCE: should reminders arrive as regular notifications or as
// full-screen alarms? The answer becomes the default for new tasks
// (User.alarm_mode); every task keeps its own switch.
//
// Two moments, one dialog:
//  - A brand-new account is asked right after its first task exists ("first"),
//    because that is when the difference means something.
//  - An account that already has tasks when the feature arrives is told about
//    it on its next open ("intro") and offered a try. Trying switches the
//    account to full-screen reminders and notes when the trial began; after
//    the first one has actually rung, AlarmKeepPrompt (below) asks on the next
//    open whether to keep it that way.
// Both only ever appear in the app build that can ring (the AlarmBridge
// plugin), so an older install never sees them.
const ALERT_STYLE_STEP = 'onboarding_alert_style_done';
// Set when "Try it out" is pressed, so AlarmKeepPrompt can see it in the same
// session without waiting for the account record to be reloaded.
let trialStartedThisSession = '';

export function AlertStylePrompt({ user, theme }) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('first');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    if (isStepDone(ALERT_STYLE_STEP)) return;

    let cancelled = false;
    let shown = false;
    const show = (which) => {
      if (shown) return;
      shown = true;
      setMode(which);
      waitForStep(ONBOARDING_STEPS.homeTour)
        .then(waitForCalm)
        .then(() => { if (!cancelled) setOpen(true); });
    };
    const onCreated = () => show('first');

    waitForPlugin('AlarmBridge').then((plugin) => {
      if (cancelled || !plugin) return;
      window.addEventListener('task-created', onCreated);
      // Already has a task (an account from before full-screen reminders
      // existed, or a capture made outside the app)? Then it's an introduction.
      base44.entities.Task.filter({ status: 'active' }, '-created_date', 1)
        .then((rows) => { if (!cancelled && rows?.length) show('intro'); })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      window.removeEventListener('task-created', onCreated);
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const finish = () => {
    markStepDone(ALERT_STYLE_STEP);
    setOpen(false);
  };

  // style 'alarm' with trial=true is "Try it out": same switch, plus a note of
  // when the trial started so the keep-it question can wait for a real ring.
  const choose = async (style, trial = false) => {
    setBusy(true);
    try {
      const patch = { alarm_mode: style };
      if (trial) {
        trialStartedThisSession = new Date().toISOString();
        patch.alarm_trial_started_at = trialStartedThisSession;
      }
      await base44.auth.updateMe(patch);
      setAlarmMode(style);
      finish();
      await refreshAlarms();
      if (style === 'alarm') await requestAlarmPermissions({ setup: true });
    } catch (e) {
      // Leave the default (regular notifications) in place; Settings has the switch.
      finish();
    } finally {
      setBusy(false);
    }
  };

  const card = `w-full text-left rounded-xl border p-4 transition-colors ${dark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50'}`;
  const panel = `max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`;

  if (mode === 'intro') {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
        <DialogContent className={panel}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
              <AlarmClock className="w-5 h-5" /> New: full-screen reminders
            </DialogTitle>
            <DialogDescription className={dark ? 'text-gray-400' : ''}>
              A reminder can now ring like an alarm clock — full screen, out loud, even with your phone locked — until you snooze or dismiss it. Same reminders, same times. Just harder to miss.
            </DialogDescription>
          </DialogHeader>

          <p className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
            Try it and your tasks switch to full-screen reminders. After the first one rings, we'll ask if you want to keep it that way.
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={() => choose('alarm', true)} disabled={busy} className="w-full">
              Try it out
            </Button>
            <Button variant="outline" onClick={() => choose('notification')} disabled={busy} className="w-full">
              Not now
            </Button>
          </div>

          <p className={`text-xs pt-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
            You can change this anytime in Settings, and every task has its own switch too.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className={panel}>
        <DialogHeader>
          <DialogTitle className={dark ? 'text-white' : ''}>How should reminders reach you?</DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            Both arrive at the same times. This is only how hard they are to ignore.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <button type="button" className={card} onClick={() => choose('notification')} disabled={busy}>
            <div className="flex items-center gap-2 font-medium"><Bell className="w-4 h-4" /> Regular notification</div>
            <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
              Shows up in your tray like any app's. Easy to miss when the phone is face down.
            </p>
          </button>
          <button type="button" className={card} onClick={() => choose('alarm')} disabled={busy}>
            <div className="flex items-center gap-2 font-medium"><AlarmClock className="w-4 h-4" /> Full-screen alarm</div>
            <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
              Rings out loud like an alarm clock, takes over the screen even when it's locked, and keeps going until you snooze or dismiss it.
            </p>
          </button>
        </div>

        <p className={`text-xs pt-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
          You can change this anytime in Settings, and every task has its own switch too.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// The second half of "Try it out". Once a full-screen reminder has actually
// rung on this phone (native reports lastRangAt), the next open asks whether
// to keep tasks that way. Asked once per account. "Keep" changes nothing;
// "Back to regular" returns the account default to notifications — a task
// someone switched to full-screen by hand keeps its own setting.
const KEEP_STEP = 'onboarding_fullscreen_keep_done';

export function AlarmKeepPrompt({ user, theme }) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const check = async () => {
      if (asked.current || isStepDone(KEEP_STEP)) return;
      const trialAt = user.alarm_trial_started_at || trialStartedThisSession;
      if (!trialAt) return;
      const plugin = await waitForPlugin('AlarmBridge', 5000);
      if (cancelled || !plugin) return;
      const st = await alarmPermissionStatus();
      const rang = Number(st?.lastRangAt || 0);
      if (!rang || rang < Date.parse(trialAt)) return;
      asked.current = true;
      await waitForStep(ONBOARDING_STEPS.homeTour);
      await waitForCalm();
      if (!cancelled) setOpen(true);
    };

    check();
    // Coming back to the app counts as opening it.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  const finish = () => {
    markStepDone(KEEP_STEP);
    setOpen(false);
  };

  const keep = () => finish();

  const goBack = async () => {
    setBusy(true);
    try {
      await base44.auth.updateMe({ alarm_mode: 'notification' });
      setAlarmMode('notification');
      finish();
      await refreshAlarms();
    } catch (e) {
      finish();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <AlarmClock className="w-5 h-5" /> Keep full-screen reminders?
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            Your first full-screen reminder has rung. Would you like to keep your tasks as full-screen reminders, or go back to regular notifications?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={keep} disabled={busy} className="w-full">
            Keep full-screen
          </Button>
          <Button variant="outline" onClick={goBack} disabled={busy} className="w-full">
            Back to regular notifications
          </Button>
        </div>

        <p className={`text-xs pt-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
          Either way, you can change this anytime in Settings.
        </p>
      </DialogContent>
    </Dialog>
  );
}
