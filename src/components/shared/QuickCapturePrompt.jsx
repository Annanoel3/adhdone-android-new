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
import { Zap, LayoutGrid, Bell, AlarmClock, Check, Moon, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { trackFire } from '@/lib/appTrack';
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
  usePopupTurn,
} from '@/components/onboarding/onboardingSurface';
import { seenKey } from '@/components/onboarding/tourVersion';
import { firstUseSeen, markFirstUseSeen } from '@/components/onboarding/FirstUseDialog';
import {
  setAlarmMode,
  refreshAlarms,
  alarmPermissionStatus,
  alarmSwitchesOff,
  requestAlarmPermissions,
  alarmQuietChoiceSupported,
  eventQuietSupported,
  readRingLog,
} from '../utils/widgetBridge';
import { isIPhoneApp, onThisPhone, phoneOs } from '@/lib/phonePlatform';
import { AlarmSoundPicker, AlarmQuietChoice, AlarmEventQuietChoice, QuietWhenButtons } from '../settings/QuickCaptureCard';
import { NAG_INTERVALS } from '../utils/reminderScheduler';
import { subscribeCaptures } from '@/lib/pendingCaptures';

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
  // The iPhone app has no pinned notification: the card there only explains
  // and asks for notifications (Anna, Oct 22 2026).
  const offerPin = onThisPhone('pinnedCapture');

  const settle = () => {
    localStorage.setItem(SEEN_KEY, 'true');
    // When it was answered: a "no" here gets asked once more, plainly, on a
    // later launch (NotificationsOffBanner), never right after.
    try { localStorage.setItem('notifications_setup_answered_at', String(Date.now())); } catch (e) { /* asked later anyway */ }
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
      const { ShareBridge, NotifyBridge: NB } = getPlugins();
      // Android waits for the pinned shortcut's plugin; the iPhone app, which
      // has no pinned shortcut, for the notifications one.
      if (onThisPhone('pinnedCapture') ? ShareBridge?.setQuickCaptureEnabled : NB?.requestPermission) {
        clearInterval(poll);
        waitForStep(ONBOARDING_STEPS.homeTour)
          .then(waitForCalm)
          .then(() => {
            if (cancelled) return;
            // A returning account has this step marked done while it waits
            // (they get the "welcome back" chat instead of the walkthrough).
            if (isStepDone(ONBOARDING_STEPS.permissions)) return;
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
      if (offerPin && pinWanted) await getPlugins().ShareBridge?.setQuickCaptureEnabled({ enabled: true });
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
            {offerPin ? 'We need to ask for a couple of permissions' : 'We need to ask for one permission'}
          </DialogTitle>
          <DialogDescription>
            {offerPin
              ? `So you can get the most out of ADHDone. First, ${phoneOs()} will ask if it can send you notifications — every reminder and alarm rides on that.`
              : `So you can get the most out of ADHDone. ${phoneOs({ capital: true })} will ask if it can send you notifications — every reminder and alarm rides on that.`}
          </DialogDescription>
        </DialogHeader>

        {declined ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm font-medium">
              Without notifications, ADHDone can't remind you of anything.
            </p>
            <p className="text-sm text-gray-600">
              Reminders, alarms and check-ins all come through as notifications. You can turn them on now, or
              later in Settings.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)} variant="outline" className="flex-1">Maybe later</Button>
              <Button onClick={handleAllow} disabled={busy} className="flex-1">
                {busy ? 'One sec...' : 'Turn on'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {offerPin && (
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
            )}
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

// ── "Keep reminding me until I mark it complete" vs quiet hours ─────────────
//
// The question the task pipeline asks BEFORE it books a repeating rhythm the
// user wants nagged until done (see reminderScheduler.askQuietHoursNag): run
// through the night too? This only puts it on screen and hands the answer
// back; the pipeline marks the task and books it right the first time.
// Closing it, or five minutes of silence, counts as no.
const NAG_ANSWER_TIMEOUT_MS = 5 * 60 * 1000;

function clockWords(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return hhmm || '';
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === '00' ? `${hour12} ${suffix}` : `${hour12}:${m[2]} ${suffix}`;
}

export function QuietHoursNagPrompt({ user, theme }) {
  const dark = theme === 'dark';
  // { task, resolve } while a question is waiting for its answer.
  const [pending, setPending] = useState(null);
  // Takes its turn with other popups, but as the answer to something the user
  // just did it shows the moment the screen is free.
  const shown = usePopupTurn(!!pending, { reactive: true });

  useEffect(() => {
    window.__quietHoursNagAsk = (task) => new Promise((resolve) => {
      setPending((prev) => {
        // One at a time: a second question while one is up is answered no.
        if (prev) { resolve(false); return prev; }
        return { task, resolve };
      });
    });
    return () => { if (window.__quietHoursNagAsk) delete window.__quietHoursNagAsk; };
  }, []);

  // Unanswered too long: no, and the pipeline books with quiet hours.
  useEffect(() => {
    if (!pending) return undefined;
    const t = setTimeout(() => answer(false), NAG_ANSWER_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const answer = (yes) => {
    const p = pending;
    setPending(null);
    try { p?.resolve(!!yes); } catch (e) { /* already answered */ }
  };

  if (!pending) return null;
  const task = pending.task;

  const every = NAG_INTERVALS[task.reminder_interval] || 'every hour';
  const start = clockWords(user?.quiet_hours_start || '22:00');
  const end = clockWords(user?.quiet_hours_end || '08:00');
  const title = task.title.length > 60 ? `${task.title.slice(0, 57)}...` : task.title;

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) answer(false); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <Moon className="w-5 h-5" />
            Keep going through the night?
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            "{title}" will keep reminding you {every} until you mark it done. Your quiet hours are {start} to {end} — should it keep going through those too?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => answer(false)} className="flex-1">No, stay quiet</Button>
          <Button onClick={() => answer(true)} className="flex-1">Yes, keep going</Button>
        </div>
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

const SHARE_PHOTO_ART = "data:image/webp;base64,UklGRp4jAABXRUJQVlA4WAoAAAAwAAAAywEAnAEASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIBwMAAAGgs23b2rz5h1kzMRjCYIfLzDh2pbFds5W54cQQ+pisz4otyRa9d8HUQylcpjciJkChL5BnLqXrJG2d6JJ0zAcp/NUBSVGHJM+x/rP+s/6z/rP+s/6z/vvf9kuSzPMonUbpDEqHUTqI0gHrP+s/679/C4dQyqNURKmA0oF5P9YTkJJmiFFO8jnKz/kRORFInqMZS5ETgiR/1lK3EYHkOZoLq4BSEaVDKB2Y88N3DEiJG4Ikf9ZS2iIpcFKQPEdTr/ajVEApj1JxYunAVKw9KB1B6SxKl1A6h1IJpTJKJ1HKoZSfWMqhdBSlMkol6z/rP+s/67+pEmWUzqFUQCmPUg6lYyiVUSrNXCqjdA6lQyjlp2RFjRAk+RzlUDqGUhml0sTSGZQuoPQMSk+j9BRKb6H0NkrPo/S09Z/130SeaZMUPU5I6mqeDzcGybRDkORb/82weg6lCyidQOkZlJ5G6W0lnRSjlxR1hdFzNHVICgOOnkbpDYWNqIfTq9uIsWl+pNDp1dsI3Dd3KAxEcWUnSeY566VXUCqjVLL+s8LwSWo35sUKXJLCwPpvLi+/SVK7MVvpAkonUdqF0imUyvIcjkpTsY6j9AxKz6H0mtw1ji5kxhgiSpmJQpJSLwZJm49J0obh4UiG3EqMw9MZ0tpCTMPzWdLGegpSurllaPCc7EgrTRrajSxpaTMm4Tm5a5nS0oLPwqMkU1qvuAaDp5Qst7KVBkuPQgpelrSUZEpSdK0JwZuSttOsScZrxRQsO9lTsOEp/f/vVUn+rSfAXwF4W5Kuu0+G///Nx3/RAkP1D3p0GfrC61FDqP1Ju8fVAKD44d2kR6va4Se6UlXv5i0fn+Szn/touUWPWfn8Ub/VNj0rP6yr/+KdlJ2H325rwPj2NXTMlY4Gv3p/y6fGbF39UEM3FhJovFqg4YO6w4x5sKBRBrUUmaWKPxJVrwLj3azFGvHN6wktTi3S6Ku1Livxwrb+xrhe3yLFPKp3BjLDKHTvVjEJ7ldudTWwZ4aR4l8rkGwtdsJYgwMAVlA4IKAeAAAwrgCdASrMAZ0BPp1Kn0ylpCMipFHJuLATiWduyI9Y/CVsBc97PkYhfzvjjji+YBz/vMf+1PrF+kv+5+oB/gOp99Bjpdf3WymX0H/mO3b/R+KvlE97+5XyVX/7T/5n99f5nnb/1/CPgEfl38o/3fAD7P5hfuX9f79n/f9Ffsn/2fcA/XD/newv/M8Mr1n2Bf6X/iv+76tmid699hD9h+uCNJhtoqygSzAGX15rR8FTOJGEPL8DtTsl+MJo13jp3Ls4kYQ8vxhbjC3A8YnV7RZmcqqe1sUoQ/eDTZNQd8pxmJTnf/ueyfkx8UD2hvKOKZfFtU9rjvfoaijYempnruT785ZoL/hPEUM1XId0skGAlmdmVivTGurqnqBw17SYcv3YDN09rguypkIlyWRHkp0SJpz3foExjTWx38ILXvJ5MO/R4uxo1BZcNtez8Cr36RarxEAhQX1L+XnOJn2MiohIMSIWnX//LZqxpA05K+RQC/BN5E92pDziQnzXe2PwKLGq8nmTlX/ny6/oayWGup+nt7lsX7QTGytljtXLmlM2tK4DD0pdusmm5zMhUcePaAkrTxNxvtQrXlfHNOsEhcM0Ig8gt2J3eqLVcJcwmu7bpXPQkTRVjCodR3i5nP7JKN7Vqj2h1UTM81nKL2LSg0EEuRRSJ+4mppptKRpsUx3/iOsocl2TA1nwWH8iuxxQ0LQE97QkmRvFv6h6nYm7u9tnAQha15Bbs8Kj/RBhJAKKrOFKD3H9YRHWKlCKvq7LFFi/FVVVX1tamwKn4k3GQ+PZy//TShDFi0oKNkEjxas4wxaSxokcromX0j/P2TIa2q/JEY+lFlr1RSfj13VvtLXOQOJjMwMwFLBfNqg7rw5A1osObfx09CFk7O6fJn/lq2CS4brx8ZYsF++0UTjM1MZf01OCvMXT2ojsjYGYTSHYjBe/qozVL/wJB4csochBwYQWUoFAld8TpmhcSbg9au20n23bMyvXU7/VzzOGbyQD272m2mqpw4N8wNzilPl0SFrOvamO7URTonhVfXg1p5Q9q/YwK4sFuMgrpDCCFdAq6qBrQTovgAAF7I4OeX0JYr9nZRJePXYzG3vHOMjjfVpFYQDCEtlXoiF+NwmPiPT5WTobIvTw+neQSxO9YiUws3GWIn5kuKsItAgwHvvrM3uo1h5tw7ty1BrVHKiKq8AtJX8yw8LofH2gIsnTacc5fl416LHho837vGTOqiEHVrsrM5k0j2SjDMx/K2j7xqCR3AZJSYdykQ5Cqym6FqgSfzE2DFr+mItzZgfwrdi2UQ20NyxN4l1oG5u6OR6g/udIRMOgeh83/ZPlORQPQZPLuZ7K/bSjRKiTpzjOhlijuYmUnOpZEsHHNFFTAi0iQU12WA7K3r5qOSd2jYsvcRzADzTopAkh3+FmtaDfIWbgB5UDMNQ/rsKX+Gn2zXuG2PUl4fNwuNM7EEEuRTrLokmb9A2Wcfm4f2TpmVUsafOvLJf7bnLX5n+z4xf/hygj0CRadaDNCC8DHIY6wDG+SfNWcH7x3mFxyNFZQL5Z4z929pQ6pyXUNsjAPvfJ/h9d7CHyZDTB70H+WN67ku1nfiaG5DDPw6AOdJKaRf0KMPnl7mERvdxVVY5QjrTvmtz3X2lLbYOedU648KKbH9kG/gJjKeVjvR8Vtfes/+8Xp22s313byY5fT5J1WRwSEN3Og0rwBLHS7WoQae+9+nRjA49QQo80n5JsPI9/Yu+RCNoOf1aN4+kCCuKOnqilBRKfy9QT6iNKGZHqeKbAvbY9/6+ILHq11Q/7b+tK3PYTfyZ5tiuBAUk3yFEDZIQvAaWSejniyiXSeg7hXKDrRkTo2GTl8yyGHa0d+Q4ea8QAAPTf/mVcdeY/LtlTiWBxvfpr8DhXtwiuZfnkYOwKXDJW9MDzP/XVhypw7AZhLKNLGiaJKwRk4JQkgNoGgSeKYBKtWkCOqNr20c9TvS5dhhU37WwFblkM/y0crjSqni5jFaVOSWmkIkIeheolDJI+jyblXm8Yn7448+KYFSu/ApNuDFYCahgWCFirRyQQagzonjhECenmSleSLt7Y3GdG6pY0kvRboZoCITB3x1crLHokYJQFAA+4M6W6j06eqSJHDCyJ2y51Cx22qjsiAy/OtIKt+QNcIW2ICmMj7xQXI1g6oUV1/Ro3bLcAhdYTqGtW+uSFk6UCr4nyVD67NMtapwdBcPJcqIBcmktqOseJeWzArPQgZfQVUBaE9QErSycuwIDPqmOxgpoJg3oacgSq0PxOtfjVpHjYU5tNhYVWAfUxB5lfbXSkuFyEgBQLJuHublvdxKByuoz7m75kPksDb18sareUQM/7+eBaD2ZvNo+1OqZC/57FzfKiwZSxX8ND30LTpE0oCcGk/v4fAAQsMiDyXcSQOpPD8fUxj2QevIzlMwaJwOKFJ4an4R+5oi138KIAb1/uGqP/ZrmBTOimsfWYi0xOEd5eFQNCaNORvXEnLBmCxtjG2wrhHDvpcvZY81U6XO1Nc1O9C/iIF3qRkDvqnvUHbOpni+WSDxfN3Q/pnIjMWegzfyZSpUIC5U7fmQeeVLzgFDCl5N8sHDw/ZY5wrrWzjK7EcgCcbI++oDJM06hbb7lpcVdSpuXr8MFLrw0eiqrokTqQ/9DGhAOuCf2CByZkb8XEIC8o0I2oGmljiD+y4jRCtul6uxYjQBSRdXUm8xcNXWoIT+5xy9Muws0ik6iATtMTFSdI9ERoRNUgl8axUprZClBfXqLYw8gXqyzTRHWC4foaXgZ6PBf4PM2EXgHuX6p0aXeCBnkOBp1D2qTzmfFvhOIUdQCvW8QrjUypi/S8yLLPy/IknU9LhRHXYWjd205VoqFwcXQ1p+Ml7d357Cw/5ELBgfVb+wL5fwbIiEE2O/ZAe9kgL2dDYq3JFwfMSNVRy4fsd8KMUioHSc4Ssh3xqkxkq9wsnGbqubh5RsjmV80Y8U6reDgx8vA8HpjI3gq1vhPTflw8V5gVMmrbe+CuRmWD4BG5kbXsYVAkFw9QYfgmeLzDnk69NGf3OTyjDZRyD84VIuAP3iaT2S+EvlG5p6+ESOuFRi1ZNuDhG8HWxrmcspSKXduchaay+ldqa8LwHKIsGs0NQ156TtwrE4kIcJqNFmPjQ72aytzUQlJeP5oRxEEMCa2imI1hlFE3Qbw9Ex0I7wk9dZbLHFNaTYuCPXk+eDhbU2ehGbgOFAO35iUodEoOdsJmnF5qfCdDaytAeN4gLv2+ai3MBcBHkCsDlGSW25zaX/k+ZCT2ElO83Q+gOdxKqBMaUM06vv0/Xsl+arAvai+IDZ8l0IIzRgtb5/nNryWiOS0cJJxDAVMZZqxedn86CJNVUJ+AlXEwnssop8lEotZ9dXfPTSpopdMFLkjD3H/CdUp6zeZQn5RoFMb1zn19LPiIJTXZMea8P/ARbowo+WesMCxOiui8pAACYaCHQAJm5rzmPMbwKto8XYRbreHfJGT6VSjbcvzRK8U7i/qEG9YTgi6JPBPr9SmM45kf8RMe/+qkSVtj4KuZukBXTbTheAm7ZrwBlR/SMa1lIx01qUKUYpyKIcKSGXsYFVRbvApVUT2PGfAkLYOOrWKRF1yfHetxoAMBXQYqMkcoII/w/PfFjvltPn9BM9UjFEGAL1jsN+/RZ/DjepcaIaOn/uk/s2Os3zC0YrBo9JniRw5/+dDg4kGCBCDS6s8BmOOyNB1/xvqbxtr0VLM1B/nsMY2TMK0xyKk+AlgOMoOiwaLQxjxVMW8H7upbZRELPqwF3xK2LeD93AE8xrEem2RIGiijy0NSzvivMTGP16ks6BbAS7IigBnEeLfOW4yGBwUtM2rLZxGX82WYQkPTA1KZSixHwDsOp7oMXFREdH/ZkG3HURbxC7rO2VfNfc8amZpw+WQUqjET8ZkkJhX5J9D9p6c9dVAhXAAAAAkiGy8USJuR9MsAP3zh91e3ahaLufnUXopN9ISKenZC35CTZUu1GtFMwJ9eQ+oZbi9fgEMR6AT6Y4iE4f3xoB2PHHYHkM5mm8hZsXmprejQVGyvNzeeCUV/lA82DhRfIxtyoE2RA3C7ef4GCOIXwWUljot2NvKXEhqkPmMDFvTTyFAns89uSmRrgrmRaSS2GFsq1sXl389ebGHB1v9LT7NfOFmCw+kFeiMKycx/5TirHvW6vG+Y/0WwVy5Us8B8Cbxo7PXtP9W91rW+zIacA5Ld8j3S/PJ7xCnjAxTCgBYg0BoTTfZAMTvsb+AzC1+RBEirJ3dw5BJkvqyjYPabZ1Wqts+EHNJxg+BwNXgqd9/NnsjMhw5XeQw6TsX2mXhKWYz2J/dt0MjZu2ZkfAWbYk4NS7n/PKdJfDykgtcDN3qRFhtMXnenKANLgkLzI1GmBRIAh0Vax9zbaK5wKpgAAAVjN8kLE2phUS305zAfH5UGHzOiJTNK5AC3ZFEZM9sKX5C0oeWmbu2+5Q/xZ4zukn9QTzf5/KUuakITFd5g2RZYReZrC7VZKlZnq/zfeS5f2kQc27BnVfbXBfzEK6Xz+0HbogjceOBCuBDYEnn7M6vOwi2n6R51szMUYYoeVvJISxMIjSIB1eNTssYyZr8X+jCbsQ2YUD51duM9AC148Fl3OyPbu3G18CUB6UEcQjHjwJvL7aMPjP8CnJTXAzv0SBe7vAAAUUBnPU5ZtSO3sVmtV9Yrp8UJDnG6OYcyxc9+6Ppx/SP78APDvYDPFuhaYd9fxYMiRY/8ikZTKsL17DEghwYGgE0b6LyKUASJoCHr6UHmkBysKwt16AibsLBGKyzA5YvKonlbGjCm3jQb2UkWb9JVPuUilms21E8KTqaIC18IWWNgNjlv/8IlI0aYkI86JhTI4RtHf0FlRVNfGEMpMVbOzBpQKaeIBnwp94AHgygLrkkjJ9zudPQJqLlk24DhxEL6vsBDS/CAbI0hd+HKkb2+m4ncfLdoxy8fgKWopn4FnvCi9fpZ9HqSmlA45vzdzUnCtkqrAJlZMwVCh9cx4vRUuFJa3n+kstGv7WMbk4GAe/NN1mVeUORYVIEbfNCu9iGwyemyPtlIPUA+taas441m3//8O+O4HKKJ6oQcbxRS5Pm1pUfZDiuCPoXFhgI1CwcdpXjYoGtKnua/p4Q8N0aJFj6f+iDET+6uwSPVgvxT60Auz7CGgmR5PJHAwO2QFjFniXwxxaWt2Raulca1V3heeLMfcRse6cZbSFPjZJTTMQ+vw2lTIJKyW69toB8Va5LqXQfpWIjxEopwIrfoPF5bEO7tI++x/V2zMQWmPn5urahWbCddqDgXD68z+LYMthxTG61Cx+F0P+HhmWlTcnzXm41GKLm7HjWu0gaPvOuBUWh55H0hHOHBDd0LqNcLKFRxMLD5pedLYP6ZYZDBNTeAyOWTJxGIzMYDcEsoUD6YHJngHrnEJKC/zjF8sxa6zMnPdutH5XBLUkqGUODB9WnEm0oa3auld2ftRQ5sXViIK7owCho9LrBCGvnuUNpLGr68+4/jKmItzGRuDheq0Xkq7w1jbPObTsG6n6L6473SkfiJX/N/RKRgF2CTjZemUIMBTKZkkYjzcJSIQ6hizi1Noc4fMNhxXEW1r9fqEfRu48zsT21GwDLobt+PghZjnOZrnNAGAIsx3B8ORnVVEJWI8Le1oPhtdK/pkqDIaowW/fX/6kIDXR3ousCYYnjaaOgf8LB6j1xnlIX8CPEJj5yiJ/WCm8BpbOmu09EKiS5mTLgr6ep1/Uu8aDEMP/LUAQDphABqpOLux/97Q/WM651Hktv9iP/JD1olGh4AVdpr7FBUbGGW9/SyaWzFTKvqAzFhkq8xE4icAFCylfmmuDuclRThNCrr5srRdZ9GLV5jvoFiw8NkTJUupq7tdHKohi2Jq4wPin8mrjnJvNQTMHXvJFGmVg4Kq5EbNncNgkZUR7ZybUe2nO6gV23QloETy2HMGPhFJCnKA27NebZNLzX8X1XIlft4glcYAa9fllXJu96f+qbHa7y+713vz1/j+eHivWLHyb+5864y4PYI4NX1rOjoxximzQiVSPDlZ67APqNfuYVj+XY4yhBKssWwcREfD69yj4U8+ZELeTNp/FVu1LE36IY1guHMJUzjuI5WO7+0g1ls69u5A5sc+sKBSLpn3dGRu1zVeTriinEYcGTsyo5okkPLHYvnJgYCfx7R4S/vdRsZwqiV0+df3+SygGPG3Ooy0EFRjJcc07xi7T+4aDKMAm35AmIwtGmvHLclZgttzdS7QEIAKaPQ0f4s0tDtgYU/B3bH7nZtSba0XC6s8ibXTpUwmDJc2F5ldNBQW0uZspaMWq4MrAQsxpxmnzF/Dr6lZZXxwVeRKHhQZVnGfxgLKlrq/EdK5VGvcnWdkAtyciLkJVY2yr1jm44iiQcvnsUZk7HsAJ6gSNNH95MD3i+dbFteH84tHwaBWvJGcU4r+PILMKpGxizLBGwKvWQ0tX+3fCfLwLYrisAwnJgLy55AMGiRw8AWUewtqtOz9ieVpSPlg7v0N4Iy4zliF8HFyCoZ8xOkiap7e3LOfpmOedDtSSX+mJ5+uiTREr1RG/NISG3do9QhcsPwWaeOOC3ZZlz3lB2y8dzUPH3da2pExQLXBd+2nvX+upMwQD2gGkEPtC8qSHd7mdjpP4MnMoIAG18HqdK2PFYq6NsaNw9oo3T3fxVEDgepZvZZNddVUPnjtO8PyH8qWMvWjYv5iNTo+gdAutniQcqUgy8lObg8fYksAedzG7Y++o3kOiNZA6786wpcOkXwCiAa89NqQGAnW347TxJSi8x+kyqfSmbFrCR9ddK/vxhSdH4yRaqVd4FNkr/03Id2KY1UkLXIgOK/o6DLAeGafhSzpjFOq26l6B5HuMubQ7pPOqzfD/kq1igPGE1RyfycHkHEDUge9w5DPn0J2DjEmaj/eRc0+EkR4+rg6rYe8G7dPxKMLsC7LahxREIXY/WfrffGsH9ydK6ZSUnBYpVQeiQqe8Df7cd990W7jq+c3CfidBOKD4YoHMdNdbNTrMh/Z/A0QQ/kkRcRvlsyo80+6LuF/HVT91e78OCYFOJTVCtudLJ2Wj4XaWRdKp0oFwcNK0cz+iqv9rxAW+f/eyR/QOGLHY/C0OxC7a6lP/7Ua13PURkOqD0+54oMUtLQo+pt54BP2Pcc6Nrk8/ZefMtqdbXkCrmv1ja5oJ4/eu+5rvE34j/gB3Ut7XeBReeDDVDlAwaanAnQEw1P6odj6oupBW4g+75b/c3fSlEnWNKJZzG/O7p/ISXYleLXiL2iHz7Nmk2rjjhXn7CETihAa+iI9kg5qKy0uQztwB7G/xG6WoeqHVLCRsazR706TezhkAPr+zw9+5R8UgzssJBExnhG6BjOv+CYy3NXausLxAQskQI5qdh9jksZxJF6q7LXDZ8crKqZY5CzAWCucPIj+CIL5t4S0JaSznITuO4JCBJdh/aQfyZVWcz4gDRxdFDB+VhTAcRV2qXQOtls0kAnFiGLLuY8lbnjG7HoHi+Yoc4KzeEQkDA9NMQI0/v+PptSlaUFovGyFMiaQ1FsnG64PItv43HaM+TTtKypXPdjNIfr5dhFRKkhpElRp7ClT2y77tAYE6eAZn993ZR6Px1n9Y15J1bF2nuuXjdJtUHizd0u0hWTjHWIAFgdIfiZqXscqLHJ19RgtEZnfhB8sgKZD/Uz0p/lzz6KnA37sbXbIjBnssm3aFeWFNB2lVVyli+4PAN2js55L2cDZ2uQtk2D+F1l1S8dfOQPga2C4+aMgb2oDPL88tAd9E5sxd/yTNw1T91K7N1L91JZrMoWafvzb22KLZpdIdck71yUYr4bnA9gqPQdorkyvTS6i+zOs87X3QfEfu5zE3X6Ml3+dmv/9I9tXRmeQljaXTHt59R3BKO2Ddzz3jMylGRlLDMHm+y6krV68ku96fCGleOGz/8XIWY/iJVXAHO9L/5xgzYclJ+wH3E4Pt2dC/1rL/+aC29wa16EhrgR9vZCZ7hVJRnY1iU5W0WOtqro5lyiqHbzeby8LkdsG3d+jhf315h58ozKUD4+UtZ8htZlInlOU6uMzvbp1mJPR3kKO5BZMAyJYuznbhvuySTL4qs1IxprEpXL1klXSmA8hU4qURlPgBQIzG4BByLpQCBFHBG9o5diUPw6hoYgZVIU22dmndPgwWOo5ctDU3rTGmQaK/rvdKVDrdy4qoYZ0LQOU/U7M1HSDaCeBGOCyWLNn0HFGkXCFmgasa2PmKcYC0ewOgMdBBlrTdCsgzYnKWXXMEmqPZZ5mbprZ48Inr4BZr2pYkMy11nFw3WxgdypsTnfZP7yzgrfAz7JxSzk9QN0TjkOzTBRP2CurYyvgIOb/FmL3E0gOHZ6KUqF/V/iGzNr+grJ978cb4fcGndXdEhDEnP6F74URVJDCCzJXqfypdJ4LORIICQpHdE3RkNv8nBJG4qHVaIrY1Q5JSIyYJzGNZexGiXuxGt4qDhkk2cB9vz50Q0ANlHd39TbR1I7XMIhwhohW5mSTSCNk4O/93VoqTEixdqTadq4xMlwefXS9aEqV86cdnwaQc9+OfafeOcf0NxmUFBGezLv4XgzLkYMm55Tu1sdlYS6utWNXMa7SZt4ns4GoHZj9RHwK+Ylud8ICgc/CrliUYNbmkps3PDSCs3F0VITtI69sF/P27WAvoOe2jxCnOTprf9lN4G9O0CDKqVJ6ecbOAaV3t4XliCMGTUoScDHpQyj5tgVUTsIxt7ckkkK43MViBpWmctb0tKdmKAsyc5edmrdubOde7+1X4ehsRtteB2vzGlDn981brxvHAtOAPENlAimGnZB/k7CGZ6HSri8Tm7g0o7EUvvtAcYeM5hIuYuLp9XD0Z81+aGWUvDUQ9tg/lqhrUvET3D/BdMC1/MfTSVTpM+KVoAK2v7Oddubcsm9EFX9cNSkHzEJQ//hnTf5JIXQNNXv67JTqKnhlJW3HjMbaSUCXKUqNROTyHwFfMS2Kh9wYNvpEr5Jb7tgIVFxZbMDpX+B1qx+mr/QmNe5rFydM1G0Xmfxp5ztfXD2Sll62eTb6txRgWbmrO3dsyUm7a1W2YDuTv0gyd3yivVDvvNShaPLr3uOXcbPq4wYsiF4J+h3xoyBf0Zh1RL+OoZS5B3praWdbE4RjmyENXcvXmru4S1eTim3JJ0EnJJZJ58PT1rCFD8re+fkr3HWASWTVpFoeQOKisVHhFU26IuJETiwWwClbtg5iM15x2pE/rcL/QpFkdbtRE2ZgPPi9MHOtZi7NI9iko9nfosr90r9yqBrRwcZyQ1OkU/pWV27MBpLhAiRDufO/OlZYzk2CDFY1H0QoV64n5FZTPlmNf61h7+yxspPjp9wexEeMEtRMgxXdH/vpBe8/KIkV5q9K95UwOvbGeqFjLSBYh+fnU7dKjfge8HrCLDVzqJygNMQ3PdDsJpGcg1UkkCJ0ba2phLYPY5u9d/pvw/qdveuEOC8VA3rSVFWsMjRb/vp+L0TRNTkmRnDqUu7G3P5k1YpTnoF/tZKEA6w26Vg8/hK6MjfOuehJlztmwxK7hw27z0lmD8QMtoEgh4ZY+jbG5R3KMHi04Ns9F8SugGfBJAmAYj19B1yDtNgi0FRqf0O8xZwg8/lPBp5PmA7AA+0wuoZvKDD21E122jHkh1fdlmRDYgbT4+qPHRgnkmoEI+1Zlb4uBpeY32xErRvDnrYTFFVMs2vtglBSOkeQMpvaUCXsUNboCj0ONhq1rdj+f3NFurpSMjd6dEsWdmNGmgiRDLkS2jlbROL0Qsu+34wK/6T1hF3+RY05EdKEM1QjSxaMVC1JKaAiVGvwsMKKA/1wc9/oVPeNRRVlz4eSkDV+xh/jYJGSwM7iSmjALP46p0jg2MdASE8gSN/PHTDai6GUuzWeosLTS7wNKHfaED1+LI+66csDunA4yKah8O72/0kBe80rV39jA7C9SbVuzKc2u7tiUWSqJipwJWHVSXSHCzBrVrto8AAD6QR1KjDuT4N2aMt2LtLId4xsiJ42bF/7M7+4OS9pmt1eR7CZAMULreAl108LAnHxza2+ggpscZx3V43AcIVwogTY6eVqa3ldNlNRJE/CoavWzoY5YSHAtEn1xYj0tCzBXrjsl174rB4DrJeScK3njDaYCIGjuUcEnHNrdIR0k9U63+Iy4rvtKFOWysLPYOPIAViQjLAZ4A+Q7rYeQe1cilKOuADWu7HL/hcdTvQUV0oUgS2CTI451sYk4QN+Y8uIR2iGQSOU4UqbDWc7R4P9MTmw9H3N8xL3eh8M5+AKLVvpfKc0k2tyRG0kFIv7AnsM0+XX64YZHqtmmRNj7DL8AiVYK3CqMa7G51I4exSfb0GaBMND7ZMcx5o/XwIQJM8uUDXGurWvqhxhPFEcoAAAAk4BOWEddCYtMA0vWVeducc7nD3DZQXbU9oxrPzZNn/wCx7CLkPJuAA";

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
    // Its pictures and its first row are Android's (share sheet, pinned
    // notification): never in the iPhone app.
    if (!onThisPhone('pinnedCapture')) return;

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

  // Second and later times: a switch the phone once had can go missing again
  // (a reinstall, an update, a battery-saver toggle), and the set-up above
  // only ever ran once per account — Sally finished it with full-screen,
  // overlay and battery all still off and was never asked again. So on open,
  // for anyone who chose alarms and already did the set-up, if the phone says
  // something is off, this same screen comes back with just the missing rows.
  // At most once a day, only once notifications themselves are on (the Home
  // row and its popup handle those first, and two popups never stack), and
  // only after the first-run tour and a calm moment.
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    let cancelled = false;
    (async () => {
      // Picking alarms counts too: closing the app on the sound step skips
      // the set-up for good, and this is then the only thing that asks.
      if (!isStepDone(ALARM_SETUP_STEP) && !isStepDone(ALERT_STYLE_STEP)) return;
      let last = 0;
      try { last = Number(localStorage.getItem(ALARM_RECHECK_KEY)) || 0; } catch (e) { /* fresh */ }
      if (Date.now() - last < 24 * 60 * 60 * 1000) return;
      const plugin = await waitForPlugin('AlarmBridge', 5000);
      if (cancelled || !plugin) return;
      let u = null;
      try { u = await base44.auth.me(); } catch (e) { return; }
      if (cancelled || u?.alarm_mode !== 'alarm') return;
      const st = await alarmPermissionStatus();
      if (cancelled || !st || !st.notifications) return;
      if (alarmSwitchesOff(st).length === 0) return;
      await waitForStep(ONBOARDING_STEPS.homeTour);
      await waitForCalm();
      if (cancelled) return;
      try { localStorage.setItem(ALARM_RECHECK_KEY, String(Date.now())); } catch (e) { /* asks again next open, then */ }
      window.dispatchEvent(new CustomEvent('alarm-permissions-needed', { detail: st }));
    })();
    return () => { cancelled = true; };
  }, []);
  // First-time set-up: the same dialog also carries the alarm-sound chooser,
  // which needs the account record for the current choice.
  const [setup, setSetup] = useState(false);
  const [me, setMe] = useState(null);
  // Set-up also asks, and won't close without an answer: vibrate only while
  // the phone is on silent, vibrate or Do Not Disturb? (true / false; anything
  // else = not answered yet.) Only on a build that can do it.
  const [quietAnswer, setQuietAnswer] = useState(undefined);
  // ...and the same for "Silent alarms during events?".
  const [eventAnswer, setEventAnswer] = useState(undefined);
  // 'timers': asked the first time a focus timer or task timer starts —
  // those always ring like an alarm, so the wording says why.
  const [feature, setFeature] = useState('');

  useEffect(() => {
    const onNeeded = (e) => {
      setStatus(e.detail || null);
      const isSetup = !!e.detail?.setup;
      setSetup(isSetup);
      setFeature(e.detail?.feature || '');
      setQuietAnswer(undefined);
      setEventAnswer(undefined);
      if (isSetup) {
        base44.auth.me().then((u) => {
          setMe(u);
          if (typeof u?.alarm_vibrate_when_quiet === 'boolean') setQuietAnswer(u.alarm_vibrate_when_quiet);
          if (typeof u?.alarm_quiet_during_events === 'boolean') setEventAnswer(u.alarm_quiet_during_events);
        }).catch(() => {});
      }
      setOpen(true);
    };
    window.addEventListener('alarm-permissions-needed', onNeeded);
    return () => window.removeEventListener('alarm-permissions-needed', onNeeded);
  }, []);

  // Re-reads the phone's answer for every row. Some of these grants happen in
  // a system dialog drawn OVER this screen (notifications, battery), so the
  // page never goes hidden and a visibilitychange listener alone never fired;
  // others come back from a settings screen a beat before Android reports the
  // new state. Every check used to wait for the page to say it was visible
  // again, which can lag well behind the app actually being back — so a
  // switch just turned on kept showing "Allow" for several seconds. Now: a
  // check every second while the dialog is open (no waiting on the page), and
  // a burst of checks the moment Android says the app is back (the App
  // plugin's resume), when the page reports visible, and when a request
  // resolves.
  const refreshRef = useRef(() => {});
  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    let stopped = false;
    const later = [];
    const refresh = () => {
      alarmPermissionStatus().then((s) => {
        if (!stopped && s) setStatus((prev) => ({ ...(prev || {}), ...s }));
      }).catch(() => {});
    };
    const recheck = () => {
      refresh();
      [300, 1000, 2500, 5000].forEach((ms) => later.push(setTimeout(() => { if (!stopped) refresh(); }, ms)));
    };
    refreshRef.current = recheck;
    const timer = setInterval(refresh, 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') recheck(); };
    document.addEventListener('visibilitychange', onVisible);
    let appHandle = null;
    try {
      Promise.resolve(window.Capacitor?.Plugins?.App?.addListener?.('resume', recheck))
        .then((h) => { if (stopped) h?.remove?.(); else appHandle = h; })
        .catch(() => {});
    } catch (e) { /* no App plugin: the checks above still run */ }
    return () => {
      stopped = true;
      clearInterval(timer);
      later.forEach(clearTimeout);
      refreshRef.current = () => {};
      exitOnboardingSurface();
      document.removeEventListener('visibilitychange', onVisible);
      appHandle?.remove?.();
    };
  }, [open]);

  if (!status) return null;
  const AlarmBridge = window.Capacitor?.Plugins?.AlarmBridge;
  const { NotifyBridge } = getPlugins();
  const tryOpen = (fn) => {
    try {
      Promise.resolve(fn())
        .catch(() => {})
        .then(() => refreshRef.current());
    } catch (e) { /* stays on the list */ }
  };

  const notificationsRow = {
    key: 'notifications',
    ok: !!status.notifications,
    label: 'Notifications',
    why: 'Without this, nothing from ADHDone reaches you: no reminders, no alarms, nothing.',
    action: () => tryOpen(() => NotifyBridge?.requestPermission?.()),
  };
  // The iPhone app has none of Android's switches; the one thing it may ask
  // for besides notifications is AlarmKit's own permission, when its
  // getStatus reports one (`alarms`).
  const rows = !onThisPhone('androidSwitches') ? [
    notificationsRow,
    ...(status.alarms === undefined ? [] : [{
      key: 'alarms',
      ok: !!status.alarms,
      label: 'Alarms',
      why: 'Lets ADHDone ring full screen, even on silent or in a Focus.',
      action: () => tryOpen(() => AlarmBridge?.requestAlarmAccess?.()),
    }]),
  ] : [
    notificationsRow,
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
      why: "Samsung puts apps it thinks you don't use to sleep, and a sleeping app's reminders and alarms can come late or not at all.",
      action: () => tryOpen(() => AlarmBridge?.requestIgnoreBatteryOptimizations?.()),
    },
  ];
  const allOk = rows.every((r) => r.ok);
  // Both yes/no questions have to be answered before set-up can close.
  const quietPending = setup && (
    (alarmQuietChoiceSupported() && typeof quietAnswer !== 'boolean') ||
    (eventQuietSupported() && typeof eventAnswer !== 'boolean')
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !quietPending) setOpen(false); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${quietPending ? '[&>button:last-child]:hidden ' : ''}${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <AlarmClock className="w-5 h-5" />
            {feature === 'timers'
              ? 'Timers ring like an alarm'
              : setup ? 'Set up full-screen reminders' : allOk ? 'All set — your phone can ring it' : 'Let your phone ring the alarm'}
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            {feature === 'timers'
              ? `The focus timer and task timers ring when their time is up, so ${phoneOs()} needs these switched on. You can say no — they'll still work, just quieter and easier to miss.`
              : setup
              ? (allOk
                ? `Pick the sound it rings with. Every switch ${phoneOs()} needed is already on.`
                : `Pick the sound it rings with, then let ${phoneOs()} know it may ring — tap each one and you'll hop out to a settings screen and straight back.`)
              : allOk
                ? `Every switch ${phoneOs()} needed is on.`
                : `${phoneOs({ capital: true })} keeps these off until you say yes. Tap each one — you'll hop out to a settings screen and straight back.`}
          </DialogDescription>
        </DialogHeader>

        {setup && <AlarmSoundPicker user={me} theme={theme} className="pb-1" />}
        {setup && (
          <AlarmQuietChoice
            value={quietAnswer}
            onChange={setQuietAnswer}
            theme={theme}
            className={`border-t pt-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}
          />
        )}
        {setup && (
          <AlarmEventQuietChoice
            value={eventAnswer}
            onChange={setEventAnswer}
            theme={theme}
            className={`border-t pt-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}
          />
        )}

        {!allOk && (
          <p className={`text-xs rounded-md p-2 ${dark ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
            Please turn on every one. Any switch left off can make your reminders and alarms
            late, easy to miss, or not show up at all. Without Notifications, nothing gets through.
          </p>
        )}

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

        {quietPending && (
          <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Pick Yes or No for each question above to finish.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {allOk ? (
            <Button onClick={() => setOpen(false)} disabled={quietPending} className="w-full">Done</Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)} disabled={quietPending} className="w-full">
              Later — it's in Settings → Reminders
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
// widgetBridge's once-per-account "first time alarms are turned on" set-up.
// Picking the sound here covers what that set-up would have asked, so it is
// marked done and the permissions screen only opens when Android is missing a
// switch.
const ALARM_SETUP_STEP = 'onboarding_alarm_setup_done';
// When this phone last re-opened the walk-through on its own (see
// AlarmPermissionsDialog): once a day at most.
const ALARM_RECHECK_KEY = 'alarm_permissions_recheck_at';
// The demo push the welcome chat plans a few minutes out (same key there):
// its words and time, plus its id once booked.
const FIRST_WIN_DEMO_KEY = 'first_win_demo_push';
// OneSignalInit fires this once the phone is linked to the account for pushes;
// the welcome chat fires the other when it plans a demo.
const PUSH_LINKED_EVENT = 'adhdone:push-linked';
const FIRST_WIN_PLANNED_EVENT = 'adhdone:first-win-planned';
// Booked once per account (the welcome chat sets the same flag).
const FIRST_WIN_KEY = 'onboarding_first_win_push_booked';
// A demo that still can't be booked this long after its planned time is
// dropped — arriving much later it would no longer read as a demo.
const FIRST_WIN_DEMO_STALE_MS = 15 * 60 * 1000;
// Never booked closer than this, so it can't land on top of the question
// that's open when it gets booked.
const FIRST_WIN_DEMO_MIN_LEAD_MS = 90 * 1000;

const readFirstWinDemo = () => {
  try { return JSON.parse(localStorage.getItem(FIRST_WIN_DEMO_KEY) || 'null'); } catch (e) { return null; }
};
const saveFirstWinDemo = (demo) => {
  try {
    if (demo) localStorage.setItem(FIRST_WIN_DEMO_KEY, JSON.stringify(demo));
    else localStorage.removeItem(FIRST_WIN_DEMO_KEY);
  } catch (e) {}
};

// Book the welcome chat's demo once this phone can receive it. The chat used
// to book it on the spot, but a new phone isn't linked to the account for
// pushes until after the notifications question, so that push had nowhere to
// go and never arrived. The link can take a few seconds to settle on
// OneSignal's side, hence the retries.
let firstWinDemoBooking = null;
function bookFirstWinDemo() {
  const waiting = readFirstWinDemo();
  if (!waiting || waiting.id || firstWinDemoBooking) return firstWinDemoBooking;
  firstWinDemoBooking = (async () => {
    for (const pause of [2000, 5000, 10000, 20000]) {
      await new Promise((r) => setTimeout(r, pause));
      const demo = readFirstWinDemo();
      if (!demo || demo.id) return;
      const planned = Date.parse(demo.at);
      if (!(planned > Date.now() - FIRST_WIN_DEMO_STALE_MS)) { saveFirstWinDemo(null); return; }
      const sendAt = new Date(Math.max(planned, Date.now() + FIRST_WIN_DEMO_MIN_LEAD_MS)).toISOString();
      // Inside their quiet hours too: they are in the app setting it up right
      // now, and it arrives a few minutes later (never more than 15 minutes
      // after it was planned, see the stale check above). Anna, Oct 23 2026:
      // it "should break quiet hours if its actually arriving soon after they
      // get through that onboarding part of the app" (RULES.md §9 Q4).
      const alarm = demo.alarm === true;
      try {
        const me = await base44.auth.me();
        if (!me?.email) return;
        const res = await base44.functions.invoke('schedulePush', {
          toUserExternalId: me.email,
          title: demo.title,
          body: demo.body,
          sendAtISO: sendAt,
          data: alarm ? { type: 'first_win_demo', alarm: true } : { type: 'first_win_demo' },
        });
        const id = res?.data?.notificationId;
        if (!id) continue;
        // Full-screen alarms may have been picked while this was booking.
        const latest = readFirstWinDemo() || demo;
        saveFirstWinDemo({ ...demo, at: sendAt, id, alarm });
        if (latest.alarm === true && !alarm) await ringFirstWinDemo();
        return;
      } catch (e) {
        // try again after the next pause
      }
    }
  })().finally(() => { firstWinDemoBooking = null; });
  return firstWinDemoBooking;
}

if (typeof window !== 'undefined') {
  window.addEventListener(PUSH_LINKED_EVENT, () => { bookFirstWinDemo(); });
  window.addEventListener(FIRST_WIN_PLANNED_EVENT, () => {
    if (window.__adhdonePushLinked) bookFirstWinDemo();
  });
  // Everyone new gets the demo reminder after their first task, wherever they
  // add it (Anna, Oct 22 2026). It used to come only from a task added in the
  // welcome chat, so someone who skipped that and added one from Home or the
  // Tasks page (M, Oct 16 2026) heard nothing at all on their first day. Only
  // an account made in the last 2 days, in the phone app, and only once (the
  // same flag the chat sets).
  window.addEventListener('task-created', async (ev) => {
    try {
      if (!window.Capacitor?.isNativePlatform?.()) return;
      if (firstUseSeen(FIRST_WIN_KEY) || readFirstWinDemo()) return;
      const title = String(ev?.detail?.task?.title || '').trim();
      if (!title) return;
      const me = await base44.auth.me().catch(() => null);
      const made = Date.parse(me?.signed_up_at || me?.created_date || '');
      if (!(Number.isFinite(made) && Date.now() - made < 2 * 24 * 60 * 60 * 1000)) return;
      if (firstUseSeen(FIRST_WIN_KEY) || readFirstWinDemo()) return;
      markFirstUseSeen(FIRST_WIN_KEY);
      saveFirstWinDemo({
        title: 'This is what a reminder looks like 👋',
        body: `"${title}" is on your list. When it's time, we'll nudge you just like this.`,
        at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      });
      window.dispatchEvent(new Event(FIRST_WIN_PLANNED_EVENT));
    } catch (e) { /* no demo, then */ }
  });
}

// Someone who picks full-screen alarms while the welcome chat's demo reminder
// is still on its way should get the demo as an alarm — it is there to show
// what THEIR reminders will look like. Cancel the booked push and book the
// same one, same time, asking to ring on arrival. Too close to call (under a
// minute out) is left alone rather than risk two. Not booked yet: it is simply
// booked as an alarm when it is.
async function ringFirstWinDemo() {
  const demo = readFirstWinDemo();
  if (!demo?.at || demo.alarm === true) return;
  if (!demo.id) {
    saveFirstWinDemo({ ...demo, alarm: true });
    return;
  }
  const at = Date.parse(demo.at);
  if (!(at > Date.now() + 60 * 1000)) return;
  try { localStorage.removeItem(FIRST_WIN_DEMO_KEY); } catch (e) {}
  try {
    const { cancelScheduledReminder } = await import('@/components/utils/reminderScheduler');
    await cancelScheduledReminder([demo.id]);
    const me = await base44.auth.me();
    if (!me?.email) return;
    await base44.functions.invoke('schedulePush', {
      toUserExternalId: me.email,
      title: demo.title,
      body: demo.body,
      sendAtISO: demo.at,
      data: { type: 'first_win_demo', alarm: true },
    });
  } catch (e) {
    console.error('Could not re-book the demo reminder as an alarm:', e);
  }
}

export function AlertStylePrompt({ user, theme }) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('first');
  const [busy, setBusy] = useState(false);
  // 'choose' → the question; 'sound' → right after picking full-screen, the
  // ring sound is picked here instead of being left for Settings to find.
  const [step, setStep] = useState('choose');
  const [me, setMe] = useState(null);
  // Vibrate only while the phone is on silent, vibrate or Do Not Disturb?
  // Asked on the sound step, and the step won't close without an answer
  // (only on a build that can do it). Same for "Silent alarms during events?".
  const [quietAnswer, setQuietAnswer] = useState(undefined);
  const [eventAnswer, setEventAnswer] = useState(undefined);
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
    // The welcome chat's first task counts from the moment it is typed, not
    // once it is saved: setting it up takes a few seconds and can be cut off
    // (the app sent to the background mid-parse), and the question is about
    // how reminders arrive, not about that one task. Gated on the saved task
    // alone, one failed first task meant never being asked at all.
    let unsubscribe = () => {};

    waitForPlugin('AlarmBridge').then((plugin) => {
      if (cancelled || !plugin) return;
      window.addEventListener('task-created', onCreated);
      unsubscribe = subscribeCaptures((list) => { if (list.length) show('first'); });
      // Already has a task (an account from before full-screen reminders
      // existed, or a capture made outside the app)? Then it's an introduction.
      base44.entities.Task.filter({ status: 'active' }, '-created_date', 1)
        .then((rows) => { if (!cancelled && rows?.length) show('intro'); })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      window.removeEventListener('task-created', onCreated);
      unsubscribe();
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
      // Answered — never asked again, even if the app closes on the sound step.
      markStepDone(ALERT_STYLE_STEP);
      await refreshAlarms();
      if (style === 'alarm') {
        ringFirstWinDemo();
        base44.auth.me().then((u) => {
          setMe(u);
          if (typeof u?.alarm_vibrate_when_quiet === 'boolean') setQuietAnswer(u.alarm_vibrate_when_quiet);
          if (typeof u?.alarm_quiet_during_events === 'boolean') setEventAnswer(u.alarm_quiet_during_events);
        }).catch(() => {});
        setStep('sound');
      } else {
        finish();
      }
    } catch (e) {
      // Leave the default (regular notifications) in place; Settings has the switch.
      finish();
    } finally {
      setBusy(false);
    }
  };

  // Sound picked (or skipped): close, then ask Android for anything it's
  // still missing — only if something is actually off.
  const soundDone = async () => {
    finish();
    markStepDone(ALARM_SETUP_STEP);
    try { await requestAlarmPermissions(); } catch (e) {}
  };

  const card = `w-full text-left rounded-xl border p-4 transition-colors ${dark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50'}`;
  const panel = `max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`;

  if (step === 'sound') {
    const quietPending =
      (alarmQuietChoiceSupported() && typeof quietAnswer !== 'boolean') ||
      (eventQuietSupported() && typeof eventAnswer !== 'boolean');
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o && !quietPending) soundDone(); }}>
        <DialogContent className={`${quietPending ? '[&>button:last-child]:hidden ' : ''}${panel}`}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
              <AlarmClock className="w-5 h-5" /> Pick your alarm sound
            </DialogTitle>
            <DialogDescription className={dark ? 'text-gray-400' : ''}>
              This is what your reminders will ring with. Tap Play to hear one.
            </DialogDescription>
          </DialogHeader>

          <AlarmSoundPicker user={me} theme={theme} className="pb-1" />

          <AlarmQuietChoice
            value={quietAnswer}
            onChange={setQuietAnswer}
            theme={theme}
            className={`border-t pt-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}
          />

          <AlarmEventQuietChoice
            value={eventAnswer}
            onChange={setEventAnswer}
            theme={theme}
            className={`border-t pt-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}
          />

          {quietPending && (
            <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
              Pick Yes or No for each question above to finish.
            </p>
          )}
          <Button onClick={soundDone} disabled={quietPending} className="w-full">Done</Button>

          <p className={`text-xs pt-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
            You can change it anytime in Settings.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

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

          <p className={`text-sm font-medium ${dark ? 'text-amber-300' : 'text-amber-700'}`}>
            Heads up: it rings out loud even when your phone is on silent, vibrate or Do Not Disturb.
            {alarmQuietChoiceSupported() ? " If you try it, you'll get to choose whether it only vibrates then." : ''}
          </p>

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
              Rings out loud like an alarm clock, takes over the screen even when it's locked, and keeps going until you snooze or dismiss it. It rings even when your phone is on silent, vibrate or Do Not Disturb{alarmQuietChoiceSupported() ? " (next, you can choose to have it only vibrate then)" : ''}.
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

// "Here are your quiet hours: keep them or change them." Asked once, and only
// of an account whose profile has quiet_hours_review_pending set — that is set
// by hand from the dashboard, never by the app. It shows at the start of an
// app open; if the Tasks walkthrough (PageIntroTour) is due in the same open,
// it goes right after that instead. Saving works exactly like Settings → Quiet
// Hours. Either answer, or closing it, clears the flag so it never comes back.
const hhmmLabel = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

// It also asks anyone whose quiet hours look like they miss when they sleep
// (Anna, Oct 18 2026: "If someone says they work the night shift, prompt them
// to make new quiet hours. Next time she opens, lets prompt that by quietly
// addressing that the app may be sending her notifications at times she does
// not prefer"). checkQuietHoursFit judges that from what they told the app
// about themselves, their quiet hours and their work hours, only when one of
// those has changed since it last looked, and keeps the answer on the profile
// as quiet_hours_fit. Keep these, Save or closing it marks it answered, so it
// only comes back if one of those changes and the hours look wrong again.
// When their quiet hours were still the starting 10 PM to 8 AM and the model
// was clear about when they sleep, checkQuietHoursFit has already moved them
// (Anna, Oct 19 2026: what they tell the app has to be acted on); then this
// says so instead of asking, once, with the new hours ready to change.
// The same as fitKey in base44/functions/checkQuietHoursFit: change both
// together.
const fitKey = (u) => JSON.stringify([
  String(u?.about_me || '').trim(),
  u?.quiet_hours_enabled !== false,
  u?.quiet_hours_start || '22:00',
  u?.quiet_hours_end || '08:00',
  u?.work_schedule_mode || 'fixed',
  (Array.isArray(u?.work_fixed_days) ? u.work_fixed_days : [])
    .map((d) => [Number(d?.day), d?.arrive_by || '', d?.ends_at || '']),
]);
// The Layout (and this popup with it) mounts again on every page, often before
// the account record catches up: so this open's answer, the key last answered
// here, and when it last looked are kept outside the component. It looks at
// most every half hour, so something they type in mid-setup is asked about on
// a later open, not in the middle of it.
let fitThisOpen = null;
let fitAnsweredKey = null;
let fitLookedAt = 0;
const FIT_LOOK_GAP_MS = 30 * 60 * 1000;

export function QuietHoursReviewPrompt({ user, theme, currentPageName }) {
  const dark = theme === 'dark';
  const [wanted, setWanted] = useState(false);
  // 'review' (quiet_hours_review_pending) or 'fit' (their hours look wrong).
  const [mode, setMode] = useState('review');
  const [fit, setFit] = useState(null);
  const [enabledWas, setEnabledWas] = useState(true);
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('08:00');
  const [was, setWas] = useState({ start: '22:00', end: '08:00' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const shown = usePopupTurn(wanted);
  const pageRef = useRef(currentPageName);
  pageRef.current = currentPageName;
  const checked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    // Once per app open. Not restarted or cancelled when the account record
    // is refreshed mid-wait (that happens often) — only if this goes away.
    if (!user || checked.current) return;
    checked.current = true;
    const review = user.quiet_hours_review_pending === true;
    if (!review) {
      // Nothing it could judge from, or it looked a moment ago: nothing to ask.
      const hasWork = (Array.isArray(user.work_fixed_days) && user.work_fixed_days.length > 0) ||
        user.work_schedule_mode === 'varies';
      if (!String(user.about_me || '').trim() && !hasWork) return;
      if (Date.now() - fitLookedAt < FIT_LOOK_GAP_MS) return;
      fitLookedAt = Date.now();
    }
    const s = user.quiet_hours_start || '22:00';
    const e = user.quiet_hours_end || '08:00';
    setStart(s);
    setEnd(e);
    setWas({ start: s, end: e });
    setEnabledWas(user.quiet_hours_enabled !== false);
    setMode(review ? 'review' : 'fit');
    // The Tasks walkthrough opens on its own the first app open after setup,
    // from Home. Same test it uses; when it's due, wait for it to open (it
    // marks itself seen as it does), and the turn below then waits for it to
    // close.
    const walkthroughDue =
      !localStorage.getItem(seenKey('Tasks')) &&
      isStepDone(ONBOARDING_STEPS.welcome) &&
      isStepDone(ONBOARDING_STEPS.homeTour) &&
      isStepDone(ALERT_STYLE_STEP) &&
      (!!user.about_me || isStepDone(ONBOARDING_STEPS.catchUp)) &&
      pageRef.current === 'Home';
    (async () => {
      if (!review) {
        const key = fitKey(user);
        let f = fitThisOpen && fitThisOpen.key === key ? fitThisOpen
          : (user.quiet_hours_fit && user.quiet_hours_fit.key === key ? user.quiet_hours_fit : null);
        if (!f) {
          try {
            const res = await base44.functions.invoke('checkQuietHoursFit', {});
            f = res?.data && typeof res.data.fits === 'boolean' ? res.data : null;
          } catch (err) {
            f = null;
          }
          if (f) fitThisOpen = f;
        }
        if (f && f.applied && f.applied.told !== true && fitAnsweredKey !== f.key) {
          // Already moved to when they sleep: the phone follows now, and the
          // popup tells them.
          if (!mounted.current) return;
          setFit(f);
          setMode('applied');
          setStart(f.applied.start);
          setEnd(f.applied.end);
          setWas({ start: f.applied.start, end: f.applied.end });
          setEnabledWas(true);
          try {
            localStorage.setItem('quiet_hours_enabled', 'true');
            localStorage.setItem('quiet_hours_start', f.applied.start);
            localStorage.setItem('quiet_hours_end', f.applied.end);
          } catch (err) { /* storage off */ }
          refreshAlarms().catch(() => {});
        } else {
          if (!f || f.fits !== false || f.answered_key === f.key || fitAnsweredKey === f.key) return;
          if (!mounted.current) return;
          setFit(f);
          if (f.start && f.end) {
            setStart(f.start);
            setEnd(f.end);
          }
        }
      }
      if (walkthroughDue) {
        const began = Date.now();
        while (mounted.current && !localStorage.getItem(seenKey('Tasks')) && Date.now() - began < 30000) {
          await new Promise((r) => setTimeout(r, 500));
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (mounted.current) setWanted(true);
    })();
  }, [user]);

  const finish = async (save) => {
    setSaving(true);
    setError('');
    try {
      if (save) {
        // Picking hours here because theirs looked wrong means they want them on.
        const enabled = mode === 'fit' || mode === 'applied' ? true : user?.quiet_hours_enabled !== false;
        localStorage.setItem('quiet_hours_enabled', enabled ? 'true' : 'false');
        localStorage.setItem('quiet_hours_start', start);
        localStorage.setItem('quiet_hours_end', end);
        const changes = {
          quiet_hours_enabled: enabled,
          quiet_hours_start: start,
          quiet_hours_end: end,
          quiet_hours_review_pending: false,
        };
        // Hours they picked themselves: answered, and nothing to judge again
        // until something else changes.
        const picked = (mode === 'fit' || mode === 'applied') && fit ? fitKey({ ...user, ...changes }) : null;
        if (picked) {
          changes.quiet_hours_fit = {
            ...fit, key: picked, fits: true, start: null, end: null, by: 'them',
            at: new Date().toISOString(), answered_key: picked,
            ...(fit.applied ? { applied: { ...fit.applied, told: true } } : {}),
          };
        }
        await base44.auth.updateMe(changes);
        if (picked) {
          fitAnsweredKey = picked;
          fitThisOpen = changes.quiet_hours_fit;
        }
        if (enabled) {
          await base44.functions.invoke('applyQuietHours', { quietStart: start, quietEnd: end }).catch(() => {});
        }
        // Same as Settings: nothing booked on the phone may ring inside the
        // new window.
        refreshAlarms().catch(() => {});
      } else if ((mode === 'fit' || mode === 'applied') && fit) {
        // Asked (or told) once for these hours and these words; not held open
        // on a save.
        fitAnsweredKey = fit.key;
        base44.auth.updateMe({
          quiet_hours_fit: { ...fit, answered_key: fit.key, ...(fit.applied ? { applied: { ...fit.applied, told: true } } : {}) },
        }).catch(() => {});
      } else {
        await base44.auth.updateMe({ quiet_hours_review_pending: false });
      }
      setWanted(false);
    } catch (e) {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const changed = start !== was.start || end !== was.end || (mode === 'fit' && !enabledWas);

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o && !saving) finish(false); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <Moon className="w-5 h-5" />
            Your quiet hours
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            {mode === 'applied' ? (
              <>
                Going by what you told us, we moved your quiet hours to {hhmmLabel(was.start)} to{' '}
                {hhmmLabel(was.end)}, so reminders and alarms stay silent while you're most likely
                asleep. If you sleep at other times, change them here.
              </>
            ) : mode === 'fit' ? (
              <>
                ADHDone might be sending you reminders at times that don't suit you.{' '}
                {enabledWas ? (
                  <>
                    Right now your quiet hours are {hhmmLabel(was.start)} to {hhmmLabel(was.end)},
                    so reminders and alarms can start at {hhmmLabel(was.end)}.
                  </>
                ) : (
                  <>Right now your quiet hours are off, so reminders and alarms can come at any hour.</>
                )}{' '}
                If you sleep at other times, set your quiet hours to match.
                {fit?.start && fit?.end ? ' We filled in times that might suit you better, so change them if they’re off.' : ''}
              </>
            ) : (
              <>
                Reminders and alarms stay silent during your quiet hours, unless you set a
                time inside them yourself, like a 5 AM flight. Right now yours are{' '}
                {hhmmLabel(was.start)} to {hhmmLabel(was.end)}, so the app's own reminders can
                start as early as {hhmmLabel(was.end)}. Want to change them?
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="qh-review-start" className={dark ? 'text-gray-200' : ''}>Quiet from</Label>
            <Input
              id="qh-review-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={dark ? 'bg-gray-700 text-white border-gray-600' : ''}
            />
          </div>
          <div>
            <Label htmlFor="qh-review-end" className={dark ? 'text-gray-200' : ''}>Until</Label>
            <Input
              id="qh-review-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={dark ? 'bg-gray-700 text-white border-gray-600' : ''}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          You can change these any time in Settings.
        </p>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={() => finish(false)} disabled={saving} className="flex-1">
            {mode === 'applied' ? 'Looks right' : 'Keep these'}
          </Button>
          <Button onClick={() => finish(true)} disabled={saving || !changed || !start || !end} className="flex-1">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "There's a new version." ONE update popup, ever, and it only says that —
// no list of what's new (Anna, Oct 7 2026) — so someone several versions
// behind gets this single card, never one per version they skipped. When a
// new build ships, bump NEWEST_BUILD; don't add a second update popup.
//
// Shows on the phone app only, on EVERY app open until the newest build is
// installed (Anna, Oct 8 2026: "every app open until updated" — it used to
// be once a day), and only while NEWEST_BUILD_ON_PLAY is true. Once per
// open, not once per page: this Layout remounts on every navigation, so the
// "asked this open" mark lives outside the component. Not again within ten
// minutes of tapping Update, since Play may be downloading it. The Update button
// opens the Play Store on builds that can (NotifyBridge.openPlayStore, added
// to the phone code after the first 1.3.9 AAB was built, so it ships in the
// next build made); older builds can't open another app from here (the app
// keeps web links inside itself), so there it shows the three steps instead.
//
// Alarm users are also asked the vibrate-only question here. The answer is
// saved to the account now and reaches the phone after the update
// (WidgetTaskSync hands it over on every app open), so first-time alarm
// set-up won't ask it again.
// Asked (actually on screen) during this open. Reset when the app comes back
// to the front after a while away; a quick switch to a text and back is the
// same open.
let updateAskedThisOpen = false;
let updateHiddenAt = 0;
let updateOpenWatcher = false;
const UPDATE_NEW_OPEN_AFTER_MS = 5 * 60 * 1000;
// When Update was last tapped: Play may be downloading the build, so no card
// for a while, even across opens.
const UPDATE_TAPPED_KEY = 'app_update_prompt_update_tapped_at';
const UPDATE_TAPPED_QUIET_MS = 10 * 60 * 1000;
// Switch to true only once the newest build is out on Google Play to everyone
// (not partway through a staged rollout). Before that there is nothing to
// update to, so the popup must stay hidden.
const NEWEST_BUILD_ON_PLAY = true; // 1.3.9 approved on Play, Sep 2026
// 1.3.12 is the build that can tell silent mode and Do Not Disturb apart for
// vibrate-only alarms (AlarmBridge.setQuietWhen). Approved on Google Play
// Sep 25, 2026, so 1.3.9-1.3.11 phones get this card and it offers that choice.
const QUIET_CHOICE_ON_PLAY = true;
// Flip to true only once the build that records notes (RecorderBridge) is out
// on Google Play to everyone. Then every phone without it gets this one card,
// leading with notes; a phone also missing the vibrate-only choice or 1.3.9's
// quiet hours (AlarmBridge.quietFor) is told about those too. Until then the
// card stays about 1.3.12, so nobody is sent to Play for a build that isn't
// there. (Sep 30, 2026: the build Play approved that day turned out not to
// have the recorder - Anna's phone lost Record Notes on updating to it.)
// Oct 1, 2026: on. A brand-new Play install (build 36, 1.3.13) reports
// RecorderBridge, and Anna's phone does too.
const NOTES_BUILD_ON_PLAY = true;
// 1.3.15 (build 38) is the build where Later on an alarm or reminder gives the
// task a real break (3 hours; a second Later the same day waits until tomorrow
// morning), alarms and the read-aloud voice are louder, a snoozed alarm stays
// quiet once its task is finished, deleted or parked, a new nudge replaces an
// older alarm waiting for the same task, the phone keeps a log of what rang
// (Settings → Notifications → What rang), and an appointment's night-before
// heads-up has a "Write questions" button. (1.3.14, build 37, was meant to
// carry the first three but shipped without its phone code — a version bump
// only; it was accepted on Play Oct 7, 2026, and 1.3.15 on Oct 8.) The card
// goes by the phone's own build number (Capacitor's App.getInfo, the same
// number WidgetTaskSync files as app_build), so the next build only needs
// NEWEST_BUILD bumped. The plugin checks stay for builds that report no number.
// Build 40 (1.3.17: alarm fixes, "Notice when I wake up", Home or Back stops
// a ringing alarm) is live on Google Play, Oct 12 2026, and build 41 (1.3.18)
// was accepted the same day. Build 42 (1.3.19: per-part capture hand-off,
// event alarms with event buttons only, wake-time and alarm fixes) was
// approved on Google Play Oct 14 2026.
const LATER_BUILD_ON_PLAY = true;
const NEWEST_BUILD = 42;
const hasQuietHoursBuild = () =>
  typeof window !== 'undefined' &&
  typeof window.Capacitor?.Plugins?.AlarmBridge?.quietFor === 'function';
const hasQuietChoiceBuild = () =>
  typeof window !== 'undefined' &&
  typeof window.Capacitor?.Plugins?.AlarmBridge?.setQuietWhen === 'function';
const hasRecorderBuild = () =>
  typeof window !== 'undefined' && !!window.Capacitor?.Plugins?.RecorderBridge;
const hasNewestBuildByPlugins = () =>
  NOTES_BUILD_ON_PLAY
    ? hasRecorderBuild()
    : QUIET_CHOICE_ON_PLAY ? hasQuietChoiceBuild() : hasQuietHoursBuild();
// This phone's build number (versionCode); 0 when it can't be read (yet).
const phoneBuild = async () => {
  try {
    const info = await window.Capacitor?.Plugins?.App?.getInfo?.();
    const n = Number(info?.build);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
};
export function AppUpdatePrompt({ user, theme }) {
  const dark = theme === 'dark';
  const [wanted, setWanted] = useState(false);
  const [askVibrate, setAskVibrate] = useState(false);
  const [vibrate, setVibrate] = useState(null);
  // The 1.3.12 wording and the four-way vibrate question (see QUIET_CHOICE_ON_PLAY).
  const [choiceLive, setChoiceLive] = useState(false);
  const [quietWhen, setQuietWhen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const shown = usePopupTurn(wanted);
  const checked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // This open has had its ask once the card is really on screen — not when
  // it decides to ask, so a page switch before its turn came doesn't lose it.
  useEffect(() => {
    if (shown) updateAskedThisOpen = true;
  }, [shown]);
  const updateTappedRecently = () => {
    try {
      const t = Number(localStorage.getItem(UPDATE_TAPPED_KEY) || 0);
      return Number.isFinite(t) && Date.now() - t < UPDATE_TAPPED_QUIET_MS;
    } catch (e) { return false; }
  };
  const noteUpdateTapped = () => {
    try { localStorage.setItem(UPDATE_TAPPED_KEY, String(Date.now())); } catch (e) { /* no storage */ }
  };

  useEffect(() => {
    // Once per mount; not restarted when the account record refreshes.
    if (!user || checked.current) return;
    if (!NEWEST_BUILD_ON_PLAY) return;
    checked.current = true;
    if (!window.Capacitor?.isNativePlatform?.()) return;
    // Android only: it counts Android build numbers and sends people to the
    // Play Store. The iPhone app has its own numbers and store (Anna, Oct 22
    // 2026); it gets no update card until one is made for it.
    if (!onThisPhone('playUpdate')) return;
    // A return to the app after a while away is a new open.
    if (!updateOpenWatcher) {
      updateOpenWatcher = true;
      try {
        window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            updateHiddenAt = Date.now();
            return;
          }
          if (updateHiddenAt && Date.now() - updateHiddenAt >= UPDATE_NEW_OPEN_AFTER_MS) updateAskedThisOpen = false;
        });
      } catch (e) { /* no App plugin: once per page load */ }
    }
    if (updateAskedThisOpen) return;
    // One ask per app open. While the "What can we do better?" popup is still
    // waiting on this account (FeedbackAskPrompt), it has this open to itself;
    // this card takes the next open, after it's been answered (Anna, Oct 7
    // 2026). Read once here, so answering it during this open doesn't bring
    // the card up behind it.
    if (user.feedback_ask?.asked_at && !user.feedback_ask?.answered_at) return;
    (async () => {
      // The phone's own build number decides at once. Only a phone that
      // doesn't report one (older builds) is judged by its plugins, and those
      // can show up a moment after the page loads (the side menu's quiet
      // button waits for them too), so that case gets up to 8 seconds. It
      // used to wait the full 8 seconds even with the number in hand: on Oct 8
      // 2026 the card was ready 8 seconds after Anna opened the app and she
      // had closed it 3 seconds later, so it never got its turn.
      let build = 0;
      for (let i = 0; i < 16 && mounted.current; i++) {
        build = LATER_BUILD_ON_PLAY ? await phoneBuild() : 0;
        if (build > 0) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!mounted.current) return;
      if (build > 0 ? build >= NEWEST_BUILD : hasNewestBuildByPlugins()) return;
      if (updateTappedRecently() || updateAskedThisOpen) return;
      if (!mounted.current) return;
      const live = QUIET_CHOICE_ON_PLAY;
      setChoiceLive(live);
      // Only a build that can open the Play Store from here (1.3.10+) gets an
      // Update button. An older one is shown the steps straight away, with
      // nothing to tap that can't do anything.
      const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;
      setShowSteps(!(typeof NotifyBridge?.startAppUpdate === 'function' || typeof NotifyBridge?.openPlayStore === 'function'));
      // With the four-way choice: alarm users who haven't picked which quiet
      // counts yet, except anyone who already said "ring out loud".
      const askFour = user.alarm_mode === 'alarm' && user.alarm_vibrate_when_quiet !== false
        && !['silent', 'dnd', 'both'].includes(user.alarm_quiet_when);
      const askTwo = user.alarm_mode === 'alarm' && typeof user.alarm_vibrate_when_quiet !== 'boolean';
      setAskVibrate(live ? askFour : askTwo);
      trackFire('update_prompt', { props: { action: 'shown' } });
      setWanted(true);
    })();
  }, [user]);

  const pickVibrate = async (on) => {
    setSaving(true);
    setError('');
    try {
      await base44.auth.updateMe({ alarm_vibrate_when_quiet: on });
      setVibrate(on);
    } catch (e) {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Saved to the account now; the phone gets it on the next app open after
  // the update (WidgetTaskSync).
  const pickQuietWhen = async (w) => {
    const on = w !== 'off';
    setSaving(true);
    setError('');
    try {
      await base44.auth.updateMe(on ? { alarm_vibrate_when_quiet: true, alarm_quiet_when: w } : { alarm_vibrate_when_quiet: false });
      setQuietWhen(w);
    } catch (e) {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const update = async () => {
    trackFire('update_prompt', { props: { action: 'update' } });
    const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;
    // 1.3.12+: Google Play's own update screen, right here in the app.
    if (typeof NotifyBridge?.startAppUpdate === 'function') {
      try {
        const r = await NotifyBridge.startAppUpdate();
        if (r?.result === 'started') {
          noteUpdateTapped();
          setWanted(false);
          return;
        }
        // Backed out of Play's screen: leave this card up.
        if (r?.result === 'cancelled') return;
      } catch (e) { /* the Play Store page instead */ }
    }
    if (typeof NotifyBridge?.openPlayStore === 'function') {
      try {
        await NotifyBridge.openPlayStore();
        noteUpdateTapped();
        setWanted(false);
        return;
      } catch (e) { /* show the steps instead */ }
    }
    // The store couldn't be opened: the steps take the button's place.
    setShowSteps(true);
  };

  const notNow = () => {
    trackFire('update_prompt', { props: { action: 'not_now' } });
    setWanted(false);
  };

  const sub = dark ? 'text-gray-400' : 'text-gray-600';
  const main = dark ? 'text-gray-200' : 'text-gray-900';

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o && !saving) notNow(); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <Sparkles className="w-5 h-5" />
            There's an update!
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-400' : ''}>
            A new version of ADHDone is ready.
          </DialogDescription>
        </DialogHeader>

        {askVibrate && choiceLive && (
          <div className={`rounded-xl border p-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
            <p className={`text-sm font-medium ${main}`}>
              Should alarms only vibrate when your phone is quiet?
            </p>
            <p className={`text-xs mt-1 ${sub}`}>
              This starts working once you update. You can change it any time in Settings.
            </p>
            <QuietWhenButtons value={quietWhen} onPick={pickQuietWhen} disabled={saving} />
          </div>
        )}

        {askVibrate && !choiceLive && (
          <div className={`rounded-xl border p-3 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
            <p className={`text-sm font-medium ${main}`}>
              When your phone is on silent, vibrate or Do Not Disturb, should alarms only vibrate?
            </p>
            <p className={`text-xs mt-1 ${sub}`}>
              This starts working once you update. You can change it any time in Settings.
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant={vibrate === true ? 'default' : 'outline'}
                disabled={saving}
                onClick={() => pickVibrate(true)}
                className="flex-1"
              >
                {vibrate === true && <Check className="w-4 h-4 mr-1" />}Yes, just vibrate
              </Button>
              <Button
                size="sm"
                variant={vibrate === false ? 'default' : 'outline'}
                disabled={saving}
                onClick={() => pickVibrate(false)}
                className="flex-1"
              >
                {vibrate === false && <Check className="w-4 h-4 mr-1" />}No, ring out loud
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {showSteps && (
          <p className={`text-sm rounded-xl p-3 ${dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-800'}`}>
            Open the Play Store app, search for ADHDone and tap Update.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {showSteps ? (
            <Button onClick={notNow} disabled={saving} className="flex-1">
              Got it
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={notNow} disabled={saving} className="flex-1">
                Not now
              </Button>
              <Button onClick={update} disabled={saving} className="flex-1">
                Update
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "Notice when I wake up", offered once (Anna, Oct 12 2026). Two ways in:
//  - Accounts made before this shipped get it the first app open where the
//    phone can do it (build 39 on): right after they update.
//  - Newer accounts get it only when their mornings look like an alarm is
//    catching them asleep: on 3 different mornings in the last 7 days, an
//    alarm in the first 2 hours after their quiet hours end was closed with
//    Later, Back or Home within 10 seconds of starting to ring ("when any
//    alarm goes off and wakes me up, its been dismissed within like 3
//    seconds"). Read from the phone's own ring log (What rang), which keeps 7
//    days; the window follows their quiet hours so night-shift people count
//    their own mornings.
// Never if the setting is already on, or if they ever switched it off
// themselves; never on top of another popup (usePopupTurn). Shown once ever
// (User.wake_offer_seen_at).
const WAKE_OFFER_SINCE = Date.parse('2026-10-13T05:00:00Z'); // midnight Oct 13, Austin time
const WAKE_OFFER_KEY = 'adhdone_wake_offer_seen';
const ROUGH_MORNINGS = 3;
const ROUGH_REACTION_MS = 10 * 1000;
const MORNING_WINDOW_MIN = 120;
// Checked at most once an hour while the app stays open (it can sit in the
// background for days), so a third rough morning is noticed the same morning.
let wakeOfferCheckedAt = 0;
// Wake-up detection on, but Android not letting ADHDone run in the background
// (the battery switch): the phone holds back the check that reports the first
// unlock, so it often never reports and the morning waits (Oct 16 2026:
// Rebecca's summary went at 12:11 PM; the phones with the switch on reported
// by 8:30). The same popup then asks for that one switch: right after the
// setting is turned on, and on a later open at most once a day while it's
// still off. Not for someone on full-screen alarms, whose own walkthrough
// already asks for it daily (two asks for one switch would stack).
const WAKE_BG_ASKED_KEY = 'adhdone_wake_background_asked';
const backgroundHeldBack = async () => {
  const st = await alarmPermissionStatus().catch(() => null);
  return !!st && st.ignoringBatteryOptimizations === false;
};

const platformMs = (v) => {
  if (!v) return NaN;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).getTime();
};

// Mornings in the ring log where an alarm right after quiet hours ended was
// swatted away (Later, Back or Home within 10 seconds).
function roughMornings(rows, quietEnd) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(quietEnd || '08:00'));
  const endMin = m ? Number(m[1]) * 60 + Number(m[2]) : 8 * 60;
  const days = new Set();
  for (const r of rows || []) {
    if (!r || r.kind !== 'alarm') continue;
    if (r.ended !== 'later' && r.ended !== 'closed') continue;
    const at = Number(r.at);
    const endedAt = Number(r.endedAt);
    if (!Number.isFinite(at) || !Number.isFinite(endedAt) || endedAt - at > ROUGH_REACTION_MS) continue;
    const d = new Date(at);
    const sinceEnd = (d.getHours() * 60 + d.getMinutes() - endMin + 1440) % 1440;
    if (sinceEnd >= MORNING_WINDOW_MIN) continue;
    // The morning it belongs to: the day the window opened (it can cross midnight).
    days.add(new Date(at - sinceEnd * 60000).toDateString());
  }
  return days.size;
}

export function WakeOfferPrompt({ user, theme }) {
  const dark = theme === 'dark';
  const [wanted, setWanted] = useState(false);
  const [mornings, setMornings] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Asking only for the background switch (wake-up detection is already on).
  const [bgOnly, setBgOnly] = useState(false);
  // The background switch is off while wake-up detection is on.
  const [bgMissing, setBgMissing] = useState(false);
  const shown = usePopupTurn(wanted);
  const pending = useRef(false);
  const AB = () => window.Capacitor?.Plugins?.AlarmBridge;
  const quietEnd = () => {
    try { return localStorage.getItem('quiet_hours_end') || user?.quiet_hours_end || '08:00'; } catch (e) { return user?.quiet_hours_end || '08:00'; }
  };

  useEffect(() => {
    if (!user || wanted || Date.now() - wakeOfferCheckedAt < 60 * 60 * 1000) return;
    // Never in the iPhone app: it can't see unlocks (Anna, Oct 22 2026: "that
    // popup cant happen either"). The phone's switch is what counts, the same
    // as below, so an account switched on from an Android phone goes back to
    // "never set" here; otherwise Smart Reminders would wait each morning for
    // a wake-up this phone can't report. Opening the Android phone again
    // turns it back on from that phone's own switch.
    if (isIPhoneApp()) {
      if (user.wake_watch === true) base44.auth.updateMe({ wake_watch: null }).catch(() => {});
      return;
    }
    if (!window.Capacitor?.isNativePlatform?.() || typeof AB()?.wakeWatchStatus !== 'function') return;
    wakeOfferCheckedAt = Date.now();
    (async () => {
      try {
        const st = await AB().wakeWatchStatus();
        // The phone's own switch is what counts (Anna, Oct 12 2026: after
        // reinstalling, her phone had it off while her account still said on,
        // so Smart Reminders would have waited every morning for a wake-up the
        // phone wasn't watching for). On the phone: on for the account too.
        // Off on the phone but on for the account: back to "never set", which
        // also lets this offer ask once.
        const phoneOn = !!st?.enabled && st?.hasAccess !== false;
        let watch = user.wake_watch;
        if (phoneOn) {
          if (watch !== true) await base44.auth.updateMe({ wake_watch: true }).catch(() => {});
          if (user.alarm_mode === 'alarm' || typeof AB()?.requestIgnoreBatteryOptimizations !== 'function') return;
          let asked = 0;
          try { asked = Number(localStorage.getItem(WAKE_BG_ASKED_KEY)) || 0; } catch (e) { /* fresh */ }
          if (Date.now() - asked < 24 * 60 * 60 * 1000) return;
          if (await backgroundHeldBack()) {
            setOn(true);
            setBgOnly(true);
            setBgMissing(true);
            setWanted(true);
          }
          return;
        }
        if (watch === true) {
          await base44.auth.updateMe({ wake_watch: null }).catch(() => {});
          watch = null;
        }
        if (user.wake_offer_seen_at || watch === false) return;
        try { if (localStorage.getItem(WAKE_OFFER_KEY)) return; } catch (e) { /* no storage */ }
        const made = platformMs(user.created_date);
        if (Number.isFinite(made) && made < WAKE_OFFER_SINCE) {
          setWanted(true);
          return;
        }
        const rows = await readRingLog(7);
        if (Array.isArray(rows) && roughMornings(rows, quietEnd()) >= ROUGH_MORNINGS) {
          setMornings(true);
          setWanted(true);
        }
      } catch (e) {
        console.warn('Wake-up offer check failed:', e?.message || e);
      }
    })();
  }, [user]);

  // Once it's really on screen it counts as offered, whatever they choose.
  useEffect(() => {
    if (!shown) return;
    if (bgOnly) {
      try { localStorage.setItem(WAKE_BG_ASKED_KEY, String(Date.now())); } catch (e) { /* no storage */ }
      return;
    }
    try { localStorage.setItem(WAKE_OFFER_KEY, String(Date.now())); } catch (e) { /* no storage */ }
    base44.auth.updateMe({ wake_offer_seen_at: new Date().toISOString() }).catch(() => {});
  }, [shown]);

  // While the background row is up: Android's battery prompt is drawn over
  // the app (the page never goes hidden), so the switch is re-read every
  // second rather than on coming back.
  useEffect(() => {
    if (!shown || !bgMissing) return undefined;
    const id = setInterval(async () => {
      if (!(await backgroundHeldBack())) setBgMissing(false);
    }, 1000);
    return () => clearInterval(id);
  }, [shown, bgMissing]);

  const allowBackground = async () => {
    setNote('');
    try {
      await AB().requestIgnoreBatteryOptimizations();
    } catch (e) {
      setNote("Couldn't open that setting. You can allow it in Android's battery settings for ADHDone.");
    }
  };

  const turnOn = async () => {
    const r = await AB().setWakeWatch({ enabled: true, quietEnd: quietEnd() });
    if (r?.enabled) {
      await base44.auth.updateMe({ wake_watch: true }).catch(() => {});
      setOn(true);
      setNote('');
      // The moment it's turned on is when the one other switch it needs is
      // asked for (the app's rule: each permission when its feature is used).
      if (user?.alarm_mode !== 'alarm' && typeof AB()?.requestIgnoreBatteryOptimizations === 'function' && await backgroundHeldBack()) {
        setBgMissing(true);
      }
    } else {
      setOn(false);
      setNote('Usage access is still off. Switch it on for ADHDone, then try again.');
    }
  };

  // Back from Android's Usage access screen: finish turning it on.
  useEffect(() => {
    if (!shown) return undefined;
    const back = async () => {
      if (!pending.current || document.visibilityState !== 'visible') return;
      pending.current = false;
      setBusy(true);
      try {
        const st = await AB().wakeWatchStatus();
        if (st?.hasAccess) await turnOn();
        else setNote('Usage access is still off. Switch it on for ADHDone, then try again.');
      } catch (e) {
        setNote("Couldn't turn it on. You can try again in Settings.");
      } finally {
        setBusy(false);
      }
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [shown]);

  const toggle = async (want) => {
    setBusy(true);
    setNote('');
    try {
      if (want) {
        const st = await AB().wakeWatchStatus();
        if (!st?.hasAccess) {
          pending.current = true;
          await AB().openUsageAccessSettings();
          return;
        }
        await turnOn();
      } else {
        await AB().setWakeWatch({ enabled: false });
        await base44.auth.updateMe({ wake_watch: false }).catch(() => {});
        setOn(false);
      }
    } catch (e) {
      setNote("Couldn't change it. You can try again in Settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o && !busy) setWanted(false); }}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
            <AlarmClock className="w-5 h-5" />
            {bgOnly ? 'One more switch for wake-up detection' : mornings ? "Start reminders when you're up?" : 'New: notice when you wake up'}
          </DialogTitle>
          {bgOnly ? (
            <DialogDescription className={dark ? 'text-gray-400' : ''}>
              Your phone is limiting ADHDone in the background, so it can miss the first time you
              unlock your phone in the morning. When it does, your morning reminders wait longer
              than they need to. Letting ADHDone run in the background fixes that.
            </DialogDescription>
          ) : (
            <DialogDescription className={dark ? 'text-gray-400' : ''}>
              {mornings ? 'Your morning reminders seem to be catching you before you\'re up. ' : ''}
              ADHDone can start your day's reminders the first time you unlock your phone in the
              morning, instead of at a set time. Anything you set for a specific time still goes
              off on time. It uses Android's Usage access only to see when your phone was first
              unlocked each day.
            </DialogDescription>
          )}
        </DialogHeader>
        {!bgOnly && (
          <div className="flex items-center justify-between gap-3 py-1">
            <span className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-900'}`}>Notice when I wake up</span>
            <Switch checked={on} onCheckedChange={toggle} disabled={busy} />
          </div>
        )}
        {on && (bgMissing || bgOnly) && (
          <div className="flex items-center justify-between gap-3 py-1">
            <span className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
              {bgMissing ? 'Let ADHDone run in the background' : 'Running in the background'}
            </span>
            {bgMissing ? (
              <Button size="sm" onClick={allowBackground} disabled={busy}>Allow</Button>
            ) : (
              <Check className="w-5 h-5 text-green-500" />
            )}
          </div>
        )}
        {note && <p className="text-xs text-red-500">{note}</p>}
        <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          You can change this any time in Settings.
        </p>
        <Button variant={on && !bgMissing ? 'default' : 'outline'} onClick={() => setWanted(false)} disabled={busy} className="w-full">
          {on && !bgMissing ? 'Done' : 'Not now'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
