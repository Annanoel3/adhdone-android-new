import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackFire } from '@/lib/appTrack';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import OnboardingBrandMark from './OnboardingBrandMark';
import TourProgressDots from './TourProgressDots';
import SCRIPT from './welcomeScript';
import { claimHandle } from '@/functions/claimHandle';
import { enqueueCapture } from '@/lib/pendingCaptures';
import { firstUseSeen, markFirstUseSeen } from './FirstUseDialog';
import { ONBOARDING_STEPS, isStepDone, markStepDone } from './onboardingGate';
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

// THE PICKS, ON THE TASK CARD FROM THE START (Anna, Nov 15 2026: "show the
// picks can be visible. Just do a text box and show the picks below"). Three
// tap-to-pick things most people need anyway sit under the box, so the one
// question that asks for a thought to be typed can also be answered with a
// tap: of the six accounts that joined Nov 13 to 15, the two that stopped
// partway both stopped on this question. Each is a real, small task for today,
// so a pick gets the same "when?" and the same first reminder as a typed one.
// Exactly these three, always (Anna, Nov 4 2026: "pick the top 3 most likely
// to be chosen and use only those"). Written here, not taken from anyone's
// tasks. Skip under them skips for real.
// (Nov 4 to Nov 15 2026 they only came up after Skip, under the line "No
// pressure — brains don't take requests. These count too. Tap one and it's on
// your list:", with "Really, nothing today" as the real skip. With nothing to
// skip first, that line has nothing to answer to; a short label stands there.)
const TASK_OFFER_LABEL = 'Or tap one:';
const TASK_OFFERS = [
  "Drink a glass of water (it's been judging me)",
  "Answer the text I've opened four times",
  'Find my keys before I need them',
];

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
// The phone's bridge for the notifications question. It attaches a moment
// after the web layer boots (see the wait in WelcomeChat).
const hasNotifyBridge = () => !!window.Capacitor?.Plugins?.NotifyBridge?.requestPermission;
// Is this the phone app at all? Known from the first moment, unlike the
// bridge: the phone puts its own object on the page before any of the site's
// code runs, and that object is what Capacitor reads for isNativePlatform.
const inPhoneApp = () => !!(window.Capacitor?.isNativePlatform?.() || window.androidBridge || window.webkit?.messageHandlers?.bridge);

function settleNotifications() {
  try {
    localStorage.setItem('quick_capture_prompt_seen', 'true');
    localStorage.setItem('notifications_setup_answered_at', String(Date.now()));
  } catch (e) { /* asked again later, then */ }
  markStepDone(ONBOARDING_STEPS.permissions);
}

// CARDS, NOT A CHAT (Anna, Nov 15 2026: "people dont like the chat aspect of
// it. Makes it seem like more work maybe. We should make it more like brief
// cards that pop up with simple answers. (Same answers as now, just seems like
// less effort than a chat maybe)"). Until then every line typed itself out a
// letter at a time into a chat bubble, answers stacked up as a conversation to
// scroll, and each question's box only appeared once its line had finished
// typing. Now one question is on screen at a time, all of it at once: the
// question in bold, anything said on the way to it in small type above, the
// same answers under it, and dots for how far along they are. The script
// files, the questions, the answers, what each answer saves and the order are
// all unchanged; the file keeps its name because the same player runs every
// script (first run, picked back up, the second-open about-you question, the
// name re-ask).
//
// A beat that asks something (or closes the flow) gets a card. A beat that
// only says something has no card of its own: it is the small print at the
// top of the next card, so nobody taps through a card with nothing to answer.
const isStop = (b) => !!b && (!!b.input || !!b.final);
function nextStop(script, from) {
  let i = from;
  while (i < script.length && !isStop(script[i])) i += 1;
  return i;
}

// One line of a script, laid out for a card without rewording it: the
// sentence that asks is the bold question, what comes before it sits above in
// small type and what comes after sits below. A line that asks nothing leads
// with its first sentence. ("Nice to meet you, Sam! What's one thing you keep
// forgetting that you could knock out today? Type it in and it's on your
// list." is those three parts.)
export function cardParts(text) {
  const bits = (String(text || '').match(/[^.!?]+(?:[.!?]+["\u201d\u2019')]*|$)/g) || []).map((b) => b.trim()).filter(Boolean);
  const ends = (b) => /\?["\u201d\u2019')]*$/.test(b);
  const q = bits.findIndex(ends);
  if (q >= 0) return { lead: bits.slice(0, q).join(' '), title: bits[q], sub: bits.slice(q + 1).join(' ') };
  return { lead: '', title: bits[0] || '', sub: bits.slice(1).join(' ') };
}

// The scripts mark a stressed word *like this*; it shows in italics.
const rich = (text) => String(text || '').split(/\*([^*]+)\*/g).map((bit, i) => (i % 2 ? <em key={i}>{bit}</em> : bit));

// The first-run questions, one card at a time. Answers are saved as they're
// given (not batched at the end) so someone who closes the app halfway through
// still keeps their name.
export default function WelcomeChat({ onDone, script = SCRIPT, initialName = '' }) {
  // Always on a beat that has a card (see isStop).
  const [idx, setIdx] = useState(() => nextStop(script, 0));
  // Where the small print for the card on screen starts: every line said
  // since the last card they answered.
  const [leadFrom, setLeadFrom] = useState(0);
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
  // null = not known yet (the card waits a moment for it; see bridgeWait).
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
      } catch (e) {
        // Unknown, and it won't become known: the question shows as usual
        // (false rather than null, so the card stops waiting for an answer).
        if (!stopped) setPhoneAllows(false);
      }
    };
    look();
    return () => { stopped = true; };
  }, [offerPin]);

  // THE NOTIFICATIONS QUESTION COMES FIRST NOW (welcomeScript.js; Anna, Nov 22
  // 2026: "Move the notifications"), so it can come up before the phone's
  // bridge has attached, and on the iPhone before the phone has said whether
  // it already allows them. Stepping over it then, as "nothing to ask here",
  // would skip the question on the very phones it is for; showing it and
  // taking it away a moment later would be a card that flashes. So in the
  // phone app that card waits until both are known (the hello line shows
  // meanwhile): up to 12 seconds for the bridge, then up to 2 more on the
  // iPhone for its answer. A browser is known at once (inPhoneApp) and waits
  // for nothing: the card is stepped over before the screen is drawn.
  const [bridgeWait, setBridgeWait] = useState(() => (inPhoneApp() ? 'waiting' : 'none'));
  const notifyReady = hasNotifyBridge() && (offerPin || phoneAllows !== null);
  const onNotifyBeat = script[idx]?.input === 'notify';
  useEffect(() => {
    if (!onNotifyBeat || bridgeWait !== 'waiting' || notifyReady) return undefined;
    const started = Date.now();
    let seenAt = 0;
    const timer = setInterval(() => {
      if (hasNotifyBridge()) {
        if (!seenAt) seenAt = Date.now();
        // Android has nothing more to wait for. The iPhone's answer arrives
        // by itself (phoneAllows, above) and ends this wait; this is the cap.
        if (offerPin || Date.now() - seenAt > 2000) setBridgeWait('here');
        return;
      }
      if (Date.now() - started > 12000) setBridgeWait('none');
    }, 100);
    return () => clearInterval(timer);
  }, [onNotifyBeat, bridgeWait, notifyReady, offerPin]);
  // The notifications card was stepped over without being shown (a browser,
  // already allowed, already answered): it gets no dot either.
  const [notifyStepped, setNotifyStepped] = useState(false);
  // Already answered on this phone before this sitting began (they answered
  // it, closed the app before the name, and are back at the start): not
  // asked twice. Read once, so answering it in this sitting changes nothing
  // about the card that is up.
  const notifySettledAtStart = useRef(isStepDone(ONBOARDING_STEPS.permissions));

  // Beats that don't apply are stepped over (a "when?" with no task; the
  // notifications question outside the phone app, where there is nothing to
  // ask). Decided as each beat comes up, not once at the start: the phone's
  // notification bridge attaches a moment after the web layer boots.
  // (A layout effect: it runs before the screen is drawn, so a card that
  // doesn't apply is stepped over without ever showing.)
  useLayoutEffect(() => {
    const b = script[idx];
    if (!b) return;
    const isNotify = b.input === 'notify';
    const skipped = typeof b.skip === 'function' && !!b.skip(name, handle, about, task, when, notify);
    const settledBefore = isNotify && notifySettledAtStart.current;
    // Still waiting on the phone (see bridgeWait): neither shown nor stepped
    // over yet. One that was answered before has nothing to wait for.
    if (isNotify && !skipped && !settledBefore && !notifyReady && bridgeWait === 'waiting') return;
    const noBridge = isNotify && !hasNotifyBridge();
    const alreadyOn = isNotify && !offerPin && phoneAllows === true && !notify;
    if (alreadyOn) {
      settleNotifications();
      setNotify('allowed');
    }
    const gone = skipped || noBridge || alreadyOn || settledBefore;
    if (isNotify && gone) setNotifyStepped(true);
    // The task waits for its time, then goes in. With the notifications
    // question already behind them, a "when?" that is stepped over because the
    // task says when is that moment.
    if (b.input === 'when' && gone && task && !script.slice(idx + 1).some((x) => x.input === 'notify')) captureTask(task, phraseRef.current);
    // No notifications question here (a browser, or an account that already
    // answered it when the chat is picked back up): the task goes in now
    // instead of after that answer.
    if (b.input === 'notify' && gone && task && hasWhenBeat) captureTask(task, phraseRef.current);
    if (gone) setIdx((i) => nextStop(script, i + 1));
  }, [idx, script, name, handle, about, task, when, notify, phoneAllows, bridgeWait, notifyReady]);
  // The same test, for this render: is the beat we're on one of those?
  const beatGone = (b) => {
    if (!b) return false;
    const noBridge = b.input === 'notify' && !hasNotifyBridge() && bridgeWait !== 'waiting';
    const settledBefore = b.input === 'notify' && notifySettledAtStart.current;
    const alreadyOn = b.input === 'notify' && !offerPin && phoneAllows === true && !notify;
    return (typeof b.skip === 'function' && !!b.skip(name, handle, about, task, when, notify)) || noBridge || alreadyOn || settledBefore;
  };

  // The about-you question is asked once per account, wherever it comes up
  // (the welcome chat ends with it; the catch-up asks it otherwise): reaching
  // it counts, answered, skipped or closed, so it is never asked twice.
  useEffect(() => {
    if (script[idx]?.input === 'about') markStepDone(ONBOARDING_STEPS.catchUp);
  }, [idx, script]);

  const beat = script[idx];
  const skippedNow = beatGone(beat);
  // The notifications card, still waiting on the phone (see bridgeWait).
  const holding = beat?.input === 'notify' && !skippedNow && !notifyReady && bridgeWait === 'waiting';
  // The last argument says whether there is a name to say (they can skip the
  // name question); lines that greet by name drop it when there isn't.
  const sayArgs = [name || 'you', handle, about, task, when, notify, { named: !!name }];
  const line = beat ? beat.text(...sayArgs) : '';
  // Everything said since the last card they answered, as this card's small
  // print (a hello, a "Thanks, Sam!", a "welcome back").
  const saidOnTheWay = [];
  for (let i = leadFrom; i < idx && i < script.length; i += 1) {
    if (script[i] && !isStop(script[i])) saidOnTheWay.push(script[i].text(...sayArgs));
  }

  // Where someone is in the welcome: one event each time a question (or the
  // closing "Let's go") is on screen. Nov 12 2026: a new account left 14
  // seconds in, and nothing recorded which line it was on (Anna: "find out
  // why ... This is too strong of a trend for there not to be a reason").
  // Only the step is kept, never what anyone typed. `ui: 'cards'` tells these
  // apart from the chat that asked the same questions until Nov 15 2026 (its
  // events have no `ui`), so the two can be compared (ownerFirstDays).
  const beatKind = beat ? (beat.final ? 'done' : beat.input || '') : '';
  useEffect(() => {
    if (!beatKind || skippedNow || holding) return;
    trackFire('welcome_chat', { props: { beat: beatKind, step: idx, ui: 'cards' } });
  }, [beatKind, idx, skippedNow, holding]);

  // On to the next card. What was said before this point has been read.
  const advance = () => {
    setDraft('');
    setLeadFrom(idx + 1);
    setIdx(nextStop(script, idx + 1));
  };

  const answer = () => advance();

  const submitName = async () => {
    const value = draft.trim();
    if (!value) return;
    setName(value);
    // The name they give IS their username (display_name) — the same field the
    // Settings page edits. Names collide, so the server also mints a unique
    // handle (name + number) that future social features can key on. Neither
    // save holds anything up: the next card shows at once.
    base44.auth.updateMe({ preferred_name: value, display_name: value }).catch(() => {});
    claimHandle({ name: value })
      .then((r) => { const got = r?.data?.handle || ''; if (got) setHandle(got); })
      .catch(() => { /* no line needs it */ });
    advance();
  };

  // Skip on the name (only where the script allows it: the first-run chat).
  // Nothing is saved as their name; the question counts as answered so it
  // isn't asked again (ONBOARDING_STEPS.nameSkipped).
  const skipName = () => {
    markStepDone(ONBOARDING_STEPS.nameSkipped);
    trackFire('welcome_name_skip', {});
    answer();
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
    answer();
  };

  const showWorkOffer = offerWork && !!beat?.final;
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
        body: `"${value}" is on your list. When it's time, we'll remind you just like this.`,
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
    answer();
  };

  // The picks under the box (see TASK_OFFERS), and the real skip under them.
  // The events keep their names from when the picks came up after Skip:
  // shown (now: the task card is on screen), picked, declined (now: Skip).
  const pickTaskOffer = (text) => {
    trackFire('welcome_task_offer', { props: { action: 'picked', pick: TASK_OFFERS.indexOf(text) } });
    setTask(text);
    if (!hasWhenBeat) captureTask(text, '');
    advance();
  };
  const declineTaskOffers = () => {
    trackFire('welcome_task_offer', { props: { action: 'declined' } });
    advance();
  };
  const taskCardUp = beat?.input === 'task' && !skippedNow;
  useEffect(() => {
    if (taskCardUp) trackFire('welcome_task_offer', { props: { action: 'shown' } });
  }, [taskCardUp, idx]);

  // The time they tapped is kept until the notifications question is answered;
  // the task goes in right after that (see submitNotify).
  const phraseRef = useRef('');
  const submitWhen = (opt) => {
    setWhen(opt ? opt.said : '');
    phraseRef.current = opt ? opt.phrase : '';
    // Later today / Sometime tomorrow: Smart Reminders gives this task its
    // first reminder 1.5 to 5 hours on (FIRST WIN in cronSmartTaskNudge). Saved
    // now, on the tap, alongside the task itself (below), so a closed app
    // can't lose it; the planner only reads it at its next look.
    if (opt?.firstWin && task) {
      base44.auth.updateMe({
        first_win_pick: { pick: opt.firstWin, at: new Date().toISOString(), text: String(task).slice(0, 200) },
      }).catch(() => {});
    }
    // With the notifications question already behind them (it is the first
    // card since Nov 22 2026), this is where the task goes in. In a script
    // that still asks it after this, the task waits for that answer as before.
    if (task && !script.slice(idx + 1).some((b) => b.input === 'notify')) captureTask(task, phraseRef.current);
    answer();
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
    answer();
  };

  // Whatever path was taken, a task they gave is in by the closing card.
  const atEnd = !!beat?.final;
  useEffect(() => {
    if (atEnd && task) captureTask(task, phraseRef.current);
  }, [atEnd, task]);

  // What the card says.
  const parts = cardParts(line);
  const smallPrint = [...saidOnTheWay, parts.lead].filter(Boolean);
  // Dots: one per card this script can show, the one on screen wide.
  const stops = script.map((b, i) => (isStop(b) ? i : -1)).filter((i) => i >= 0 && !(notifyStepped && script[i].input === 'notify'));
  const stepNumber = stops.indexOf(idx) + 1;
  // The first card of a sitting doesn't put the keyboard up by itself: they
  // get to read it whole first (the dialogs don't focus anything on opening
  // either). Every card after it is ready to type into, as the chat was.
  const typeReady = leadFrom > 0;

  return (
    <div className="space-y-5">
      <OnboardingBrandMark />

      {holding && saidOnTheWay.length > 0 && (
        <div className="space-y-2">
          {saidOnTheWay.map((t, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">{rich(t)}</p>
          ))}
        </div>
      )}

      {beat && !skippedNow && !holding && (
        <div
          key={idx}
          className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
        >
          <div className="space-y-2">
            {smallPrint.map((t, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground">{rich(t)}</p>
            ))}
            <h3 className="text-lg font-bold leading-snug text-foreground">{rich(parts.title)}</h3>
            {parts.sub && <p className="text-sm leading-relaxed text-muted-foreground">{rich(parts.sub)}</p>}
          </div>

          {beat.input === 'name' && !beat.skippable && (
            <div className="space-y-2">
              <Input
                autoFocus={typeReady}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitName()}
                placeholder="Your name"
                className="h-11"
              />
              <Button onClick={submitName} disabled={!draft.trim()} className="w-full h-11 text-base">Send</Button>
            </div>
          )}

          {/* The first-run name question: the same box, with Skip beside
              Send, laid out like the task question that follows it. */}
          {beat.input === 'name' && beat.skippable && (
            <div className="space-y-2">
              <Input
                autoFocus={typeReady}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitName()}
                placeholder="Your name"
                className="h-11"
              />
              <div className="flex gap-2">
                <Button onClick={submitName} disabled={!draft.trim()} className="flex-1 h-11 text-base">Send</Button>
                <Button variant="ghost" onClick={skipName} className="h-11">Skip</Button>
              </div>
            </div>
          )}

          {beat.input === 'about' && (
            <div className="space-y-2">
              <Textarea
                autoFocus={typeReady}
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="A sentence or two — whatever feels relevant."
              />
              <div className="flex gap-2">
                <Button onClick={submitAbout} disabled={!draft.trim()} className="flex-1 h-11 text-base">Send</Button>
                <Button variant="ghost" onClick={() => answer()} className="h-11">Skip</Button>
              </div>
            </div>
          )}

          {/* The box, then the picks: type one or tap one. The box doesn't
              put the keyboard up by itself here, whatever card came before:
              the keyboard would cover the picks. */}
          {beat.input === 'task' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitTask()}
                  placeholder="Like: call the pharmacy"
                  className="h-11 flex-1 min-w-0"
                />
                <Button onClick={submitTask} disabled={!draft.trim()} className="h-11 text-base shrink-0">Add it</Button>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{TASK_OFFER_LABEL}</p>
                {TASK_OFFERS.map((text) => (
                  <Button key={text} variant="outline" onClick={() => pickTaskOffer(text)} className="w-full h-auto min-h-11 py-2.5 text-sm leading-tight whitespace-normal">
                    {text}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" onClick={declineTaskOffers} className="w-full">Skip</Button>
            </div>
          )}

          {beat.input === 'when' && (
            <div className="space-y-2">
              {whenOptions().map((opt) => (
                <Button key={opt.label} variant="outline" onClick={() => submitWhen(opt)} className="w-full h-11 text-base">
                  {opt.label}
                </Button>
              ))}
            </div>
          )}

          {beat.input === 'notify' && (
            <div className="space-y-2">
              {offerPin && (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Pin a quick-capture shortcut</p>
                  <p className="text-xs text-muted-foreground">Save a thought from your notification tray without opening the app.</p>
                </div>
                <Switch checked={pinWanted} onCheckedChange={setPinWanted} aria-label="Pin the quick-capture shortcut" />
              </div>
              )}
              <div className="flex gap-2">
                <Button onClick={() => submitNotify(true)} disabled={busy} className="flex-1 h-11 text-base">
                  {busy ? 'One sec...' : 'Allow notifications'}
                </Button>
                <Button variant="outline" onClick={() => submitNotify(false)} disabled={busy} className="h-11">Not now</Button>
              </div>
            </div>
          )}

          {showWorkOffer && (
            <div className="rounded-xl border p-3 space-y-2">
              <p className="text-sm">Add your work hours and reminders can stay quiet while you work.</p>
              <Button variant="outline" onClick={openWorkHours} className="w-full">Add my work hours</Button>
            </div>
          )}

          {beat.final && (
            <Button onClick={onDone} className="w-full h-11 text-base">Let's go</Button>
          )}
        </div>
      )}

      {stepNumber > 0 && (
        <div className="flex justify-center">
          <TourProgressDots stepNumber={stepNumber} totalSteps={stops.length} />
        </div>
      )}
    </div>
  );
}
