import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackFire } from '@/lib/appTrack';
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
import { onThisPhone } from '@/lib/phonePlatform';

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

// Skip on "what's one thing…": instead of an empty list, three tap-to-pick
// things most people need anyway (Anna, Nov 4 2026: "use the lazy path as an
// opportunity to show personality and relatability"). Each is a real, small
// task for today, so a pick gets the same "when?" and the same first reminder
// as a typed one. Exactly these three, always (Anna: "pick the top 3 most
// likely to be chosen and use only those"); "Really, nothing today" skips for
// real. Written here, not taken from anyone's tasks.
const TASK_OFFER_LINE = "No pressure — brains don't take requests. These count too. Tap one and it's on your list:";
const TASK_OFFERS = [
  "Drink a glass of water (it's been judging me)",
  "Answer the text I've opened four times",
  'Find my keys before I need them',
];
const TASK_OFFER_DECLINE = 'Really, nothing today';
function pickTaskOffers() {
  return TASK_OFFERS;
}

// "When should it remind you?" — three taps, nothing else (A task that
// already names its time skips the question entirely; see saysWhen in
// welcomeScript.) `phrase` is what gets added to the capture, in the same plain
// words the parser reads from anyone; `said` is how the chat repeats it back.
//
// Anna, Nov 8 2026: "Before 7 p.m.: in 30 minutes, later today, tomorrow at 9.
// After 7 p.m.: in 30 minutes, in an hour, tomorrow at 9." and "9 p.m. and
// after: in 30 minutes, tomorrow at 9, sometime tomorrow." Later today and
// Sometime tomorrow have no clock time: Smart Reminders gives that task its
// first reminder 1.5 to 5 hours on (FIRST WIN in cronSmartTaskNudge; `firstWin`
// marks them, saved as User.first_win_pick). Before this, from 6 PM on it was
// one today and two tomorrow, and before 6 PM two today and one tomorrow, with
// "Sometime today" underneath.
const IN_30 = { label: 'In 30 minutes', phrase: 'in 30 minutes', said: '30 minutes from now' };
const TOMORROW_AT_9 = { label: 'Tomorrow at 9', phrase: 'tomorrow at 9am', said: 'tomorrow at 9' };
function whenOptions(now = new Date()) {
  const h = now.getHours();
  if (h >= 21) {
    return [IN_30, TOMORROW_AT_9, { label: 'Sometime tomorrow', phrase: 'tomorrow', said: 'tomorrow', firstWin: 'sometime_tomorrow' }];
  }
  const second = h < 19
    ? { label: 'Later today', phrase: 'later today', said: 'later today', firstWin: 'later_today' }
    : { label: 'In an hour', phrase: 'in 1 hour', said: 'an hour from now' };
  return [IN_30, second, TOMORROW_AT_9];
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
  // The iPhone app has no pinned notification (Anna, Oct 22 2026).
  const offerPin = onThisPhone('pinnedCapture');
  const [busy, setBusy] = useState(false);
  // (Until Nov 4 2026 the line after the name waited up to 2.5 s, with a
  // "…" bubble, for the server to mint the @handle, because the next line
  // used to name it. No line has named it since Oct 27 2026 — the handle
  // promised sharing the app doesn't have — so the wait was a pause for
  // nothing; the handle is still minted, just not waited for.)
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  // The chat's own scroll box, kept at the bottom while a line types out.
  const listRef = useRef(null);
  const pinnedRef = useRef(true);
  const lastLenRef = useRef(0);
  // "Add my work hours" under the last line (Anna, Nov 2 2026, "idea 1"):
  // only when checkQuietHoursFit judged that their about-you answer has a
  // job, shifts or school with set hours in it, and none are saved yet. It
  // opens Settings → Places at the schedule card.
  const [offerWork, setOfferWork] = useState(false);
  const navigate = useNavigate();

  // Whether the phone already allows ADHDone's notifications (iPhone app).
  // Apple shows its "Allow notifications?" box once per install; after that
  // asking again does nothing on screen. Anna, Nov 6 2026, re-testing with a
  // fresh account on the same iPhone: the line said the iPhone was about to
  // ask, and the only thing that happened was the app's own button. Already
  // allowed: the question is stepped over and counts as answered "yes".
  // null = not known yet (the beat then shows as usual).
  const [phoneAllows, setPhoneAllows] = useState(null);
  useEffect(() => {
    if (offerPin) return undefined;
    let stopped = false;
    const started = Date.now();
    const look = async () => {
      const NB = window.Capacitor?.Plugins?.NotifyBridge;
      if (!NB?.getPermissionState) {
        if (!stopped && Date.now() - started < 15000) setTimeout(look, 500);
        return;
      }
      try {
        const st = await NB.getPermissionState();
        if (!stopped) setPhoneAllows(!!st?.granted);
      } catch (e) { /* unknown: the question shows as usual */ }
    };
    look();
    return () => { stopped = true; };
  }, [offerPin]);

  // Beats that don't apply are stepped over (a "when?" with no task; the
  // notifications question outside the phone app, where there is nothing to
  // ask). Decided as each beat comes up, not once at the start: the phone's
  // notification bridge attaches a moment after the web layer boots.
  useEffect(() => {
    const b = script[idx];
    if (!b) return;
    const noBridge = b.input === 'notify' && !window.Capacitor?.Plugins?.NotifyBridge?.requestPermission;
    const alreadyOn = b.input === 'notify' && !offerPin && phoneAllows === true && !notify;
    if (alreadyOn) {
      settleNotifications();
      setNotify('allowed');
    }
    const gone =
      (typeof b.skip === 'function' && b.skip(name, handle, about, task, when, notify)) || noBridge || alreadyOn;
    // No notifications question here (a browser, or an account that already
    // answered it when the chat is picked back up): the task goes in now
    // instead of after that answer.
    if (b.input === 'notify' && gone && task && hasWhenBeat) captureTask(task, phraseRef.current);
    if (gone) setIdx((i) => i + 1);
  }, [idx, script, name, handle, about, task, when, notify, phoneAllows]);

  // The about-you question is asked once per account, wherever it comes up
  // (the welcome chat ends with it; the catch-up asks it otherwise): reaching
  // it counts, answered, skipped or closed, so it is never asked twice.
  useEffect(() => {
    if (script[idx]?.input === 'about') markStepDone(ONBOARDING_STEPS.catchUp);
  }, [idx, script]);

  const beat = script[idx];
  // The last argument says whether there is a name to say (they can skip the
  // name question); lines that greet by name drop it when there isn't.
  const line = beat ? beat.text(name || 'you', handle, about, task, when, notify, { named: !!name }) : '';
  const { shown, done } = useTypewriter(line, 28, idx);

  // Where someone is in the chat: one event each time a question (or the
  // closing "Let's go") is fully on screen. Nov 12 2026: a new account left 14
  // seconds in, and nothing recorded which line it was on (Anna: "find out
  // why ... This is too strong of a trend for there not to be a reason").
  // Only the step is kept, never what anyone typed.
  const beatKind = beat ? (beat.final ? 'done' : beat.input || '') : '';
  useEffect(() => {
    if (!done || !beatKind) return;
    trackFire('welcome_chat', { props: { beat: beatKind, step: idx } });
  }, [done, beatKind, idx]);

  // Anna, Nov 6 2026 (iPhone): "The chat scrolls really slowly down while
  // it's sending things". This was a smooth scrollIntoView on every typed
  // letter (every 28 ms): each one restarted the last one's animation, so the
  // box crawled and lagged behind the text. Now the box itself jumps to the
  // bottom once per frame, no animation, and only while they're at the
  // bottom: someone who scrolls up to reread isn't pulled back down until
  // the next message lands.
  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    if (history.length !== lastLenRef.current) {
      lastLenRef.current = history.length;
      pinnedRef.current = true;
    }
    if (!pinnedRef.current) return undefined;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
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

  const submitName = async () => {
    const value = draft.trim();
    if (!value) return;
    setName(value);
    // The name they give IS their username (display_name) — the same field the
    // Settings page edits. Names collide, so the server also mints a unique
    // handle (name + number) that future social features can key on. Neither
    // save holds the chat up: the next line starts at once.
    base44.auth.updateMe({ preferred_name: value, display_name: value }).catch(() => {});
    claimHandle({ name: value })
      .then((r) => { const got = r?.data?.handle || ''; if (got) setHandle(got); })
      .catch(() => { /* no line needs it */ });
    setHistory((h) => [...h, { from: 'app', text: line }, { from: 'user', text: value }]);
    setDraft('');
    setIdx((i) => i + 1);
  };

  // Skip on the name (only where the script allows it: the first-run chat).
  // Nothing is saved as their name; the question counts as answered so it
  // isn't asked again (ONBOARDING_STEPS.nameSkipped).
  const skipName = () => {
    markStepDone(ONBOARDING_STEPS.nameSkipped);
    trackFire('welcome_name_skip', {});
    answer('');
  };

  const submitAbout = () => {
    const value = draft.trim();
    setAbout(value);
    // Their quiet hours follow what they just told us, right away: "I work
    // nights" moves the starting 10 PM-8 AM to when they sleep
    // (checkQuietHoursFit; Anna, Oct 19 2026).
    if (value) {
      base44.auth.updateMe({ about_me: value })
        .then(() => base44.functions.invoke('checkQuietHoursFit', {}))
        .then((r) => { if (r?.data?.offer_work_hours === true) setOfferWork(true); })
        .catch(() => {});
    }
    answer(value);
  };

  const showWorkOffer = offerWork && done && !!beat?.final;
  useEffect(() => {
    if (showWorkOffer) trackFire('work_hours_offer', { props: { action: 'shown' } });
  }, [showWorkOffer]);
  const openWorkHours = () => {
    trackFire('work_hours_offer', { props: { action: 'open' } });
    onDone();
    navigate('/settings?section=places#work-hours');
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

  // Skip on the task: the offers come up under their own line (see
  // TASK_OFFERS). The beat stays the task beat; only what's under it changes.
  const [taskOffers, setTaskOffers] = useState(null);
  const skipTask = () => {
    const offers = pickTaskOffers();
    setTaskOffers(offers);
    setHistory((h) => [...h, { from: 'app', text: line }, { from: 'app', text: TASK_OFFER_LINE }]);
    setDraft('');
    trackFire('welcome_task_offer', { props: { action: 'shown' } });
  };
  const pickTaskOffer = (text) => {
    trackFire('welcome_task_offer', { props: { action: 'picked', pick: TASK_OFFERS.indexOf(text) } });
    setTask(text);
    if (!hasWhenBeat) captureTask(text, '');
    setHistory((h) => [...h, { from: 'user', text }]);
    setTaskOffers(null);
    setIdx((i) => i + 1);
  };
  const declineTaskOffers = () => {
    trackFire('welcome_task_offer', { props: { action: 'declined' } });
    setHistory((h) => [...h, { from: 'user', text: TASK_OFFER_DECLINE }]);
    setTaskOffers(null);
    setIdx((i) => i + 1);
  };

  // The time they tapped is kept until the notifications question is answered;
  // the task goes in right after that (see submitNotify).
  const phraseRef = useRef('');
  const submitWhen = (opt) => {
    setWhen(opt ? opt.said : '');
    phraseRef.current = opt ? opt.phrase : '';
    // Later today / Sometime tomorrow: Smart Reminders gives this task its
    // first reminder 1.5 to 5 hours on (FIRST WIN in cronSmartTaskNudge). Saved
    // now, on the tap, so it's there before the task is (the task goes in after
    // the notifications answer) and a closed app can't lose it.
    if (opt?.firstWin && task) {
      base44.auth.updateMe({
        first_win_pick: { pick: opt.firstWin, at: new Date().toISOString(), text: String(task).slice(0, 200) },
      }).catch(() => {});
    }
    answer(opt ? opt.label : '');
  };

  // Android's own prompt, from the chat, and the pinned shortcut right behind
  // it when they left it on. Whatever they answer, the question counts as
  // asked; a "no" is asked once more, plainly, on a later open.
  const submitNotify = async (allow) => {
    if (allow) {
      setBusy(true);
      const plugins = window.Capacitor?.Plugins || {};
      try { await plugins.NotifyBridge?.requestPermission?.(); } catch (e) { /* the row on Home takes it from here */ }
      if (offerPin && pinWanted) {
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

      <div ref={listRef} onScroll={onListScroll} className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
        {history.map((m, i) => (
          <ChatBubble key={i} from={m.from}>{m.text}</ChatBubble>
        ))}
        {/* While the task offers are up, the question is already in the
            history above them, so the live bubble steps aside. */}
        {beat && !taskOffers && (
          <ChatBubble from="app">
            {/* The rest of the line is already there, invisible, so every
                word sits where it will end up. Typed one letter at a time
                into an empty bubble, a long word started at the end of a
                row and then jumped down to the next one once it no longer
                fit, which looked like it started the word over (Anna, Nov 6
                2026: "it will like type the word build and super quickly
                start over the word"). No cursor: its gray block sat where
                the first letter goes before typing began ("the first letter
                of each message has like a gray highlight over it"). */}
            {shown}
            {!done && <span className="opacity-0 select-none" aria-hidden="true">{line.slice(shown.length)}</span>}
          </ChatBubble>
        )}
        <div ref={endRef} />
      </div>

      {done && beat?.input === 'name' && !beat.skippable && (
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

      {/* The first-run chat's name question: the same box, with Skip beside
          Send, laid out like the task question that follows it. */}
      {done && beat?.input === 'name' && beat.skippable && (
        <div className="space-y-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            placeholder="Your name"
          />
          <div className="flex gap-2">
            <Button onClick={submitName} disabled={!draft.trim()} className="flex-1">Send</Button>
            <Button variant="ghost" onClick={skipName}>Skip</Button>
          </div>
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

      {done && beat?.input === 'task' && !taskOffers && (
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
            <Button variant="ghost" onClick={skipTask}>Skip</Button>
          </div>
        </div>
      )}

      {beat?.input === 'task' && taskOffers && (
        <div className="space-y-2">
          {taskOffers.map((text) => (
            <Button key={text} variant="outline" onClick={() => pickTaskOffer(text)} className="w-full h-auto py-2 text-sm leading-tight whitespace-normal">
              {text}
            </Button>
          ))}
          <Button variant="ghost" onClick={declineTaskOffers} className="w-full text-xs">{TASK_OFFER_DECLINE}</Button>
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
        </div>
      )}

      {done && beat?.input === 'notify' && (
        <div className="space-y-2">
          {offerPin && (
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Pin a quick-capture shortcut</p>
              <p className="text-xs text-muted-foreground">A shortcut in your notification tray. Thought hits, you tap it, it's saved — no opening the app.</p>
            </div>
            <Switch checked={pinWanted} onCheckedChange={setPinWanted} aria-label="Pin the quick-capture shortcut" />
          </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => submitNotify(true)} disabled={busy} className="flex-1">
              {busy ? 'One sec...' : 'Allow notifications'}
            </Button>
            <Button variant="outline" onClick={() => submitNotify(false)} disabled={busy}>Not now</Button>
          </div>
        </div>
      )}

      {showWorkOffer && (
        <div className="rounded-xl border p-3 space-y-2">
          <p className="text-sm">Add your work hours and nudges can stay quiet while you're working.</p>
          <Button variant="outline" onClick={openWorkHours} className="w-full">Add my work hours</Button>
        </div>
      )}

      {done && beat?.final && (
        <Button onClick={onDone} className="w-full">Let's go</Button>
      )}
    </div>
  );
}