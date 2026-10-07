import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { Mail, Loader2, Check } from 'lucide-react';
import { markStepDone } from '@/components/onboarding/onboardingGate';
import {
  waitForCalm,
  enterOnboardingSurface,
  exitOnboardingSurface,
} from '@/components/onboarding/onboardingSurface';

// Consent step before anything from a Support Space conversation is emailed to
// the developer. Nothing is sent unless the user taps Send.
export default function SupportEscalationCard({ message, transcript, theme, onDismiss }) {
  const [status, setStatus] = useState('idle');

  const handleSend = async () => {
    setStatus('sending');
    try {
      await base44.functions.invoke('sendSupportRequest', { message, transcript });
      setStatus('sent');
    } catch (e) {
      console.error('Failed to send support request:', e);
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <div className={`p-4 rounded-lg mr-12 flex items-start gap-2 ${
        theme === 'dark' ? 'bg-green-900/30 text-green-200' : 'bg-green-50 text-green-800'
      }`}>
        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-sm">Sent to customer support — replies are usually quick, so keep an eye on your email.</p>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg mr-12 space-y-3 ${
      theme === 'dark' ? 'bg-blue-900/30 border border-blue-800' : 'bg-blue-50 border border-blue-200'
    }`}>
      <div className="flex items-start gap-2">
        <Mail className={`w-4 h-4 mt-0.5 flex-shrink-0 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`} />
        <div>
          <p className={`text-sm font-medium ${theme === 'dark' ? 'text-blue-100' : 'text-blue-900'}`}>
            Would you like to send this to customer support?
          </p>
          <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-blue-200' : 'text-blue-700'}`}>
            Your message, this conversation, and your name and email would be emailed to the developer. Nothing is sent unless you tap Send. Support replies are usually fast.
          </p>
        </div>
      </div>
      {status === 'error' && (
        <p className="text-xs text-red-500">Couldn't send that — please try again.</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSend} disabled={status === 'sending'} className="bg-blue-600 hover:bg-blue-700 text-white">
          {status === 'sending' ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</> : 'Send to support'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDismiss} disabled={status === 'sending'}>
          No thanks
        </Button>
      </div>
    </div>
  );
}

// ── "Want to send this to the developer?" ────────────────────────────────────
//
// One-time popup for when something a person captured was really meant for the
// app itself: a feature they want, or something that isn't working right. It
// shows when their profile carries pending_feedback_prompt ({ text, queued_at },
// plus task_id when an admin queued it for something that wrongly became a
// task) that has not been answered yet. The capture check queues it on its own
// now (checkTaskCategory's "app_feedback"): their words are kept in the Parking
// Lot and this asks whether to send them on. A capture made while the app is
// open shows it right away (the 'feedback-prompt-queued' event); one made from
// outside the app shows it the next time the app opens. The app speaks in its
// own voice here: it is the app that noticed, not a person reading their notes.
//
// Same consent rule as the card above: nothing leaves the app unless they tap
// "Yes, send it". They see their OWN words and can change them first — the app
// never writes the request for them.
//
// Every answer is recorded on their profile, whether or not the email arrives:
//   answer "yes"        — plus sent_text, and email "sent" or "failed"
//   answer "no"         — pressed No thanks
//   answer "dismissed"  — closed it with the X
// Tapping outside or pressing Escape does nothing, so a stray tap can never count
// as an answer. Once answered it never shows again, and the ways-to-add popup is
// marked seen so first-run education never lands on top of this.
// ── "What can we do better?" ─────────────────────────────────────────────────
//
// A one-time ask for feedback, sent to chosen accounts by an admin through
// broadcastAnnouncement (ask: 'feedback'). That stamps feedback_ask.asked_at on
// each profile and sends a push that simply opens the app; this popup is what
// they see — on that tap, or the next time they open the app on their own. It
// is answered once (sent, "Not now", or closed with the X) and never shows
// again. What they type goes to the developer through sendSupportRequest, the
// same road as the popup below. Tapping outside or Escape does nothing, so a
// stray tap can't spend the one ask.
export function FeedbackAskPrompt({ user }) {
  const ask = user?.feedback_ask;
  const waiting = !!(ask?.asked_at && !ask?.answered_at);
  const key = waiting ? String(ask.asked_at) : '';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const shownFor = useRef('');
  const askRef = useRef(ask);
  askRef.current = ask;

  useEffect(() => {
    if (!key || shownFor.current === key) return;
    let cancelled = false;
    waitForCalm().then(() => {
      if (cancelled || shownFor.current === key) return;
      shownFor.current = key;
      setText('');
      setStatus('idle');
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  // Overwritten, never set to null (the schema types it as an object).
  const record = async (fields) => {
    try {
      await base44.auth.updateMe({
        feedback_ask: {
          asked_at: askRef.current?.asked_at,
          answered_at: new Date().toISOString(),
          ...fields,
        },
      });
    } catch (e) {
      console.error('Could not record the feedback answer:', e);
    }
  };

  const handleSend = async () => {
    const message = text.trim();
    if (!message) return;
    setStatus('sending');
    // Their words are saved first, so they are never lost if the email fails.
    await record({ answer: 'yes', sent_text: message, email: 'sending' });
    try {
      await base44.functions.invoke('sendSupportRequest', {
        message,
        transcript: 'Sent from the "What can we do better?" popup (the one-time feedback ask).',
      });
      await record({ answer: 'yes', sent_text: message, email: 'sent' });
    } catch (e) {
      console.error('Feedback email failed:', e);
      await record({
        answer: 'yes',
        sent_text: message,
        email: 'failed',
        email_error: String(e?.message || e).slice(0, 300),
      });
    }
    setStatus('done');
  };

  const handleNo = (answer) => {
    record({ answer });
    setOpen(false);
  };

  const handleOpenChange = (o) => {
    if (o) return;
    if (status === 'sending') return;
    if (status === 'done') { setOpen(false); return; }
    handleNo('dismissed');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-border"
      >
        {status === 'done' ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-bold text-foreground">Got it, thank you</h2>
            </div>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              This goes straight to the developer. If there's a reply, it'll come to your email.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <h2 className="text-xl font-bold text-foreground">What can we do better?</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Tell us what's missing, confusing, or annoying. Most feedback becomes a real change
              in the app within days.
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Anything, big or small"
              className="text-[15px]"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSend}
                disabled={status === 'sending' || !text.trim()}
                className="flex-1"
              >
                {status === 'sending'
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending…</>
                  : 'Send'}
              </Button>
              <Button
                onClick={() => handleNo('no')}
                variant="outline"
                disabled={status === 'sending'}
                className="flex-1"
              >
                Not now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackPrompt({ user }) {
  // Queued during this visit, or waiting on the profile from before.
  const [queued, setQueued] = useState(null);
  useEffect(() => {
    const onQueued = (e) => { if (e?.detail?.text) setQueued(e.detail); };
    window.addEventListener('feedback-prompt-queued', onQueued);
    return () => window.removeEventListener('feedback-prompt-queued', onQueued);
  }, []);
  const pending = queued || user?.pending_feedback_prompt;
  const waiting = !!(pending?.text && !pending?.answered_at);
  // Which question this is. Keyed by a plain string, so the account record
  // refreshing underneath (a new object, same question) can't cancel the wait
  // or show it twice.
  const key = waiting ? String(pending.queued_at || pending.text) : '';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const shownFor = useRef('');
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (!key || shownFor.current === key) return;
    let cancelled = false;
    waitForCalm().then(() => {
      if (cancelled || shownFor.current === key) return;
      shownFor.current = key;
      setText(String(pendingRef.current?.text || ''));
      setStatus('idle');
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  // Keeps what was queued and adds the answer on top. Overwritten, never set to
  // null: the schema types this field as an object and would reject null.
  const record = async (fields) => {
    const answeredAt = new Date().toISOString();
    setQueued((q) => (q ? { ...q, answered_at: answeredAt } : q));
    try {
      await base44.auth.updateMe({
        pending_feedback_prompt: {
          text: pending?.text,
          ...(pending?.task_id ? { task_id: pending.task_id } : {}),
          queued_at: pending?.queued_at,
          answered_at: answeredAt,
          ...fields,
        },
      });
    } catch (e) {
      console.error('Could not record the feature request answer:', e);
    }
  };

  const handleYes = async () => {
    const message = text.trim();
    if (!message) return;
    setStatus('sending');
    markStepDone('onboarding_ways_seen');
    // The yes and their words are saved FIRST, so they are never lost even if
    // the email to the developer fails.
    await record({ answer: 'yes', sent_text: message, email: 'sending' });
    try {
      await base44.functions.invoke('sendSupportRequest', {
        message,
        transcript:
          (pending?.task_id
            ? 'Sent from the "I think this was a feature request" popup. What they originally captured: "'
            : 'Sent from the "send this to the developer?" popup, right after they added it in the app. What they originally captured: "') +
          String(pending?.text || '').slice(0, 1000) + '"',
      });
      await record({ answer: 'yes', sent_text: message, email: 'sent' });
    } catch (e) {
      console.error('Feature request email failed:', e);
      await record({
        answer: 'yes',
        sent_text: message,
        email: 'failed',
        email_error: String(e?.message || e).slice(0, 300),
      });
    }
    // Either way the request is on record where the developer can see it.
    setStatus('done');
  };

  const handleNo = (answer) => {
    markStepDone('onboarding_ways_seen');
    record({ answer });
    setOpen(false);
  };

  const handleOpenChange = (o) => {
    if (o) return;
    if (status === 'sending') return;
    if (status === 'done') { setOpen(false); return; }
    handleNo('dismissed');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-border"
      >
        {status === 'done' ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-bold text-foreground">Got it</h2>
            </div>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              The developer will see this. If there's a reply, it'll come to your email.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {pending?.task_id ? (
              <>
                <h2 className="text-xl font-bold text-foreground">I think this was a feature request</h2>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  It turned into a task, but it sounds like something you'd like ADHDone to do. Want
                  to send it to the developer? You can change the wording first.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-foreground">Want to send this to the developer?</h2>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  This sounds like it's about ADHDone itself, like a feature you'd like or something
                  that isn't working right. I saved it in your Parking Lot. Want to send it to the
                  developer too? You can change the wording first.
                </p>
              </>
            )}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="text-[15px]"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleYes}
                disabled={status === 'sending' || !text.trim()}
                className="flex-1"
              >
                {status === 'sending'
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending…</>
                  : 'Yes, send it'}
              </Button>
              <Button
                onClick={() => handleNo('no')}
                variant="outline"
                disabled={status === 'sending'}
                className="flex-1"
              >
                No thanks
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
