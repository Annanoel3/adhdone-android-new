import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import ChatBubble from './ChatBubble';
import OnboardingBrandMark from './OnboardingBrandMark';
import useTypewriter from './useTypewriter';
import SCRIPT from './welcomeScript';
import { claimHandle } from '@/functions/claimHandle';
import { enqueueCapture } from '@/lib/pendingCaptures';
import { firstUseSeen, markFirstUseSeen } from './FirstUseDialog';
import { ONBOARDING_STEPS, markStepDone } from './onboardingGate';

// The "this is what a reminder looks like" push: booked once per account, a
// few minutes after the first task goes in, through the same reminder pipe
// every real reminder uses — so it proves the whole path, not just the app.
const FIRST_WIN_KEY = 'onboarding_first_win_push_booked';
const FIRST_WIN_MINUTES = 3;
// Where the demo push is remembered (words + send time, and its id once it is
// booked). QuickCapturePrompt books it and the alarm question reads it — same key.
const FIRST_WIN_DEMO_KEY = 'first_win_demo_push';
// Tells QuickCapturePrompt a demo is waiting, in case this phone is already
// linked for pushes (then it books straight away).
const FIRST_WIN_PLANNED_EVENT = 'adhdone:first-win-planned';

// "When should it remind you?" — three taps that fit the time of day, plus a
// way out for someone who already typed a time. `phrase` is what gets added
// to the capture, in the same plain words the parser reads from anyone;
// `said` is how the chat repeats it back.
function whenOptions(now = new Date()) {
  const h = now.getHours();
  const opts = [];
  if (h < 21) opts.push({ label: 'In an hour', phrase: 'in 1 hour', said: 'an hour from now' });
  if (h < 18) opts.push({ label: 'Tonight at 7', phrase: 'tonight at 7pm', said: 'tonight at 7' });
  opts.push({ label: 'Tomorrow at 9', phrase: 'tomorrow at 9am', said: 'tomorrow at 9' });
  if (h >= 18) opts.push({ label: 'Tomorrow at 7 PM', phrase: 'tomorrow at 7pm', said: 'tomorrow at 7 PM' });
  if (h >= 21) opts.push({ label: 'Tomorrow at noon', phrase: 'tomorrow at 12pm', said: 'tomorrow at noon' });
  return opts.slice(0, 3);
}

// The notifications question used to be its own card after the chat (with the
// pinned-shortcut offer). Answered here instead, at the moment it makes sense,
// and settled the same way that card did, so everything downstream — the
// re-ask on Home, OneSignal waiting for an answer, the shortcut offer on the
// second open — behaves exactly as before.
function settleNotifications() {
  try {
    localStorage.setItem('quick_capture_prompt_seen', 'true');
    localStorage.setItem('notifications_setup_answered_at', String(Date.now()));
  } catch (e) { /* asked again later, then */ }
  markStepDone(ONBOARDING_STEPS.permissions);
}

// The first-run conversation. Answers are saved as they're given (not batched at
// the end) so someone who closes the app halfway through still keeps their name.
export default function WelcomeChat({ onDone, script = SCRIPT, initialName = '' }) {
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  // A name the profile already holds, so a script without a name beat can
  // still address the person by it.
  const [name, setName] = useState(initialName || '');
  const [handle, setHandle] = useState('');
  const [about, setAbout] = useState('');
  const [task, setTask] = useState('');
  // How they answered "when should it remind you?" (the spoken form), and
  // the notifications question ('allowed' / 'declined').
  const [when, setWhen] = useState('');
  const [notify, setNotify] = useState('');
  // The pinned quick-capture shortcut rides with the notifications question
  // (it IS a notification), on by default, same as the card it replaced.
  const [pinWanted, setPinWanted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  // Beats that don't apply are stepped over (a "when?" with no task; the
  // notifications question outside the phone app, where there is nothing to
  // ask). Decided as each beat comes up, not once at the start: the phone's
  // notification bridge attaches a moment after the web layer boots.
  useEffect(() => {
    const b = script[idx];
    if (!b) return;
    const noBridge = b.input === 'notify' && !window.Capacitor?.Plugins?.NotifyBridge?.requestPermission;
    const gone =
      (typeof b.skip === 'function' && b.skip(name, handle, about, task, when, notify)) || noBridge;
    // No notifications question here (a browser): the task goes in now instead.
    if (noBridge && task && hasWhenBeat) captureTask(task, phraseRef.current);
    if (gone) setIdx((i) => i + 1);
  }, [idx, script, name, handle, about, task, when, notify]);

  const beat = script[idx];
  const line = beat ? beat.text(name || 'you', handle, about, task, when, notify) : '';
  const { shown, done } = useTypewriter(line, 28, idx);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [shown, history.length]);

  // Lines with nothing to answer roll on by themselves after a short beat.
  useEffect(() => {
    if (!done || !beat || beat.input || beat.final) return;
    const t = setTimeout(() => {
      setHistory((h) => [...h, { from: 'app', text: line }]);
      setIdx((i) => i + 1);
    }, 550);
    return () => clearTimeout(t);
  }, [done, beat, line]);

  const answer = (value) => {
    setHistory((h) => [
      ...h,
      { from: 'app', text: line },
      ...(value ? [{ from: 'user', text: value }] : []),
    ]);
    setDraft('');
    setIdx((i) => i + 1);
  };

  const submitName = () => {
    const value = draft.trim();
    if (!value) return;
    setName(value);
    // The name they give IS their username (display_name) — the same field the
    // Settings page edits. Names collide, so the server also mints a unique
    // handle (name + number) that future social features can key on.
    base44.auth.updateMe({ preferred_name: value, display_name: value }).catch(() => {});
    claimHandle({ name: value })
      .then((r) => setHandle(r?.data?.handle || ''))
      .catch(() => {});
    answer(value);
  };

  const submitAbout = () => {
    const value = draft.trim();
    setAbout(value);
    if (value) base44.auth.updateMe({ about_me: value }).catch(() => {});
    answer(value);
  };

  // The task waits for the time they pick, then goes in once. A script with
  // no "when" beat (the catch-up) adds it straight away.
  const hasWhenBeat = script.some((b) => b.input === 'when');

  // Once, whichever path gets there first (see submitNotify and the skip above).
  const capturedRef = useRef(false);
  const captureTask = (value, phrase) => {
    if (capturedRef.current) return;
    capturedRef.current = true;
    // Same path as typing it on Home: parsed, saved, reminders scheduled. The
    // time they tapped rides along in plain words, the way anyone would type it.
    enqueueCapture({ text: phrase ? `${value}. Remind me ${phrase}.` : value });
    if (!firstUseSeen(FIRST_WIN_KEY)) {
      markFirstUseSeen(FIRST_WIN_KEY);
      // Only planned here, not booked. On a new phone nothing is linked to
      // this account for pushes yet — that happens after the notifications
      // question — so a push booked now had nowhere to go and never arrived.
      // QuickCapturePrompt books it the moment the phone is linked, at this
      // same time if that is still ahead.
      const demo = {
        title: 'This is what a reminder looks like 👋',
        body: `"${value}" is on your list. When it's time, we'll nudge you just like this.`,
        at: new Date(Date.now() + FIRST_WIN_MINUTES * 60 * 1000).toISOString(),
      };
      try { localStorage.setItem(FIRST_WIN_DEMO_KEY, JSON.stringify(demo)); } catch (e) {}
      window.dispatchEvent(new Event(FIRST_WIN_PLANNED_EVENT));
    }
  };

  const submitTask = () => {
    const value = draft.trim();
    if (!value) return;
    setTask(value);
    if (!hasWhenBeat) captureTask(value, '');
    answer(value);
  };

  // The time they tapped is kept until the notifications question is answered;
  // the task goes in right after that (see submitNotify).
  const phraseRef = useRef('');
  const submitWhen = (opt) => {
    setWhen(opt ? opt.said : '');
    phraseRef.current = opt ? opt.phrase : '';
    answer(opt ? opt.label : 'It already has a time');
  };

  // Android's own prompt, from the chat, and the pinned shortcut right behind
  // it when they left it on. Whatever they answer, the question counts as
  // asked; a "no" is asked once more, plainly, on a later open.
  const submitNotify = async (allow) => {
    if (allow) {
      setBusy(true);
      const plugins = window.Capacitor?.Plugins || {};
      try { await plugins.NotifyBridge?.requestPermission?.(); } catch (e) { /* the row on Home takes it from here */ }
      if (pinWanted) {
        try { await plugins.ShareBridge?.setQuickCaptureEnabled?.({ enabled: true }); } catch (e) { /* the Settings toggle shows the real error */ }
      }
      setBusy(false);
    }
    settleNotifications();
    setNotify(allow ? 'allowed' : 'declined');
    // Only now does the task go in. Its reminders are pushes, and a push booked
    // before this phone is linked for them is refused and lost — the link
    // starts the moment the question is answered (OneSignalInit), and the
    // booking itself waits for it (scheduleReminder). Answered either way,
    // the task still goes in: with a "no" nothing can be booked, and the
    // reminder plan is kept for when notifications get turned on.
    if (task) captureTask(task, phraseRef.current);
    answer(allow ? 'Allow notifications' : 'Not now');
  };

  return (
    <div className="space-y-4">
      <OnboardingBrandMark />

      <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
        {history.map((m, i) => (
          <ChatBubble key={i} from={m.from}>{m.text}</ChatBubble>
        ))}
        {beat && (
          <ChatBubble from="app">
            {shown}
            {!done && <span className="opacity-40">▍</span>}
          </ChatBubble>
        )}
        <div ref={endRef} />
      </div>

      {done && beat?.input === 'name' && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            placeholder="Your name"
          />
          <Button onClick={submitName} disabled={!draft.trim()}>Send</Button>
        </div>
      )}

      {done && beat?.input === 'about' && (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="A sentence or two — whatever feels relevant."
          />
          <div className="flex gap-2">
            <Button onClick={submitAbout} disabled={!draft.trim()} className="flex-1">Send</Button>
            <Button variant="ghost" onClick={() => answer('')}>Skip</Button>
          </div>
        </div>
      )}

      {done && beat?.input === 'task' && (
        <div className="space-y-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitTask()}
            placeholder="Like: call the pharmacy"
          />
          <div className="flex gap-2">
            <Button onClick={submitTask} disabled={!draft.trim()} className="flex-1">Add it</Button>
            <Button variant="ghost" onClick={() => answer('')}>Skip</Button>
          </div>
        </div>
      )}

      {done && beat?.input === 'when' && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {whenOptions().map((opt) => (
              <Button key={opt.label} variant="outline" onClick={() => submitWhen(opt)} className="h-auto py-2 text-sm leading-tight whitespace-normal">
                {opt.label}
              </Button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => submitWhen(null)} className="w-full text-xs">It already has a time</Button>
        </div>
      )}

      {done && beat?.input === 'notify' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Pin a quick-capture shortcut</p>
              <p className="text-xs text-muted-foreground">A shortcut in your notification tray. Thought hits, you tap it, it's saved — no opening the app.</p>
            </div>
            <Switch checked={pinWanted} onCheckedChange={setPinWanted} aria-label="Pin the quick-capture shortcut" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => submitNotify(true)} disabled={busy} className="flex-1">
              {busy ? 'One sec...' : 'Allow notifications'}
            </Button>
            <Button variant="outline" onClick={() => submitNotify(false)} disabled={busy}>Not now</Button>
          </div>
        </div>
      )}

      {done && beat?.final && (
        <Button onClick={onDone} className="w-full">Let's go</Button>
      )}
    </div>
  );
}