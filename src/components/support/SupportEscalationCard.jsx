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

// ── "Was that a request for ADHDone?" ─────────────────────────────────────────
//
// One-time popup for when something a person captured was really a request for
// the app itself — a feature they want — and it wrongly became a task. It shows
// when their profile carries pending_feedback_prompt ({ text, task_id, queued_at })
// and has not been answered yet.
//
// Same consent rule as the card above: nothing leaves the app unless they tap
// Send. They see their OWN words and can change them first — the app never
// writes the request for them. Whichever button they press, the prompt is
// marked answered so it never comes back, and the ways-to-add popup is marked
// seen so first-run education never lands on top of this.
export function FeedbackPrompt({ user }) {
  const pending = user?.pending_feedback_prompt;
  const waiting = !!(pending?.text && !pending?.answered_at);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const started = useRef(false);

  useEffect(() => {
    if (!waiting || started.current) return;
    started.current = true;
    setText(String(pending.text));
    let cancelled = false;
    waitForCalm().then(() => { if (!cancelled) setOpen(true); });
    return () => { cancelled = true; };
  }, [waiting, pending]);

  useEffect(() => {
    if (!open) return;
    enterOnboardingSurface();
    return exitOnboardingSurface;
  }, [open]);

  // Overwritten, never set to null: the schema types this field as an object
  // and would reject null, which would leave the popup coming back forever.
  const markAnswered = async (answer) => {
    markStepDone('onboarding_ways_seen');
    try {
      await base44.auth.updateMe({
        pending_feedback_prompt: { answered_at: new Date().toISOString(), answer },
      });
    } catch (e) {
      // Worst case it shows once more next time — never worth an error here.
    }
  };

  const handleSend = async () => {
    const message = text.trim();
    if (!message) return;
    setStatus('sending');
    try {
      await base44.functions.invoke('sendSupportRequest', {
        message,
        transcript:
          'Sent from the "was that a request for ADHDone?" popup. What they originally captured: "' +
          String(pending?.text || '').slice(0, 1000) + '"',
      });
      setStatus('sent');
      markAnswered('sent');
    } catch (e) {
      console.error('Failed to send feature request:', e);
      setStatus('error');
    }
  };

  const handleClose = () => {
    setOpen(false);
    if (status !== 'sent') markAnswered('dismissed');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-border">
        {status === 'sent' ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-bold text-foreground">Sent to Anna</h2>
            </div>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              She reads every one of these herself. If she replies, it'll come to your email.
            </p>
            <Button onClick={() => setOpen(false)} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <h2 className="text-xl font-bold text-foreground">Was that a request for ADHDone?</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              It sounded like something you'd like the app to do, and it turned into a task by
              mistake. Want to send it to Anna, who builds the app? You can change the wording first.
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="text-[15px]"
            />
            {status === 'error' && (
              <p className="text-sm text-red-500">Couldn't send that — please try again.</p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleSend}
                disabled={status === 'sending' || !text.trim()}
                className="flex-1"
              >
                {status === 'sending'
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending…</>
                  : 'Send to Anna'}
              </Button>
              <Button onClick={handleClose} variant="outline" disabled={status === 'sending'} className="flex-1">
                No thanks
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
