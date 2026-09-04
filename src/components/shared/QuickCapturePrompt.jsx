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

const SEEN_KEY = 'quick_capture_prompt_seen';

const getPlugins = () => {
  const p = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};
  return { ShareBridge: p.ShareBridge, NotifyBridge: p.NotifyBridge };
};

// First-run offer for the pinned quick-capture notification. It needs OS
// notification permission, so it can't be silently on by default — we ask once,
// then never again (the toggle lives in Settings either way).
export default function QuickCapturePrompt() {
  const { ShareBridge, NotifyBridge } = getPlugins();
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ShareBridge?.setQuickCaptureEnabled) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    ShareBridge.isQuickCaptureEnabled?.()
      .then((res) => {
        if (res?.enabled) {
          localStorage.setItem(SEEN_KEY, 'true');
        } else {
          setOpen(true);
        }
      })
      .catch(() => setOpen(true));
  }, [ShareBridge]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      if (NotifyBridge?.requestPermission) await NotifyBridge.requestPermission();
      await ShareBridge.setQuickCaptureEnabled({ enabled: true });
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