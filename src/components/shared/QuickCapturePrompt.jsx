import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Zap } from 'lucide-react';
import { ONBOARDING_STEPS, waitForStep } from '@/components/onboarding/onboardingGate';
import {
  waitForCalm,
  enterOnboardingSurface,
  exitOnboardingSurface,
} from '@/components/onboarding/onboardingSurface';

const SEEN_KEY = 'quick_capture_prompt_seen';

const getPlugins = () => {
  const p = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};
  return { ShareBridge: p.ShareBridge, NotifyBridge: p.NotifyBridge };
};

// First-run offer for the pinned quick-capture notification. It needs OS
// notification permission, so it can't be silently on by default — we ask once,
// then never again (the toggle lives in Settings either way).
export default function QuickCapturePrompt() {
  const { NotifyBridge } = getPlugins();
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY)) return;

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
            ShareBridge.isQuickCaptureEnabled?.()
              .then((res) => {
                if (cancelled) return;
                if (res?.enabled) localStorage.setItem(SEEN_KEY, 'true');
                else setOpen(true);
              })
              .catch(() => { if (!cancelled) setOpen(true); });
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

  const handleEnable = async () => {
    setBusy(true);
    try {
      if (NotifyBridge?.requestPermission) await NotifyBridge.requestPermission();
      await getPlugins().ShareBridge?.setQuickCaptureEnabled({ enabled: true });
    } catch (e) {
      // Nothing to recover here — the Settings toggle shows the real error.
    } finally {
      localStorage.setItem(SEEN_KEY, 'true');
      setBusy(false);
      setOpen(false);
    }
  };

  const handleDecline = () => {
    localStorage.setItem(SEEN_KEY, 'true');
    setDeclined(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { localStorage.setItem(SEEN_KEY, 'true'); setOpen(false); } }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-600" />
            Want a one-tap way to dump a task?
          </DialogTitle>
          <DialogDescription>
            We can keep a shortcut pinned in your notification tray, so when a thought hits
            you can capture it from anywhere — no opening the app, no losing the thought.
          </DialogDescription>
        </DialogHeader>

        {declined ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              No problem — Quick Capture is always waiting for you in Settings whenever you want it.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full">Got it</Button>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleEnable} disabled={busy} className="flex-1">
              {busy ? 'Turning on...' : 'Yes, pin it'}
            </Button>
            <Button onClick={handleDecline} variant="outline" className="flex-1">
              Not now
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}