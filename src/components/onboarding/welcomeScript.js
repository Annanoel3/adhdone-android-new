import { phoneOs } from '@/lib/phonePlatform';

// The first-run conversation, as data. Each beat is one line the app types; a
// beat with `input` waits for the user before moving on; a beat with `skip`
// is left out when it returns true. Keeping the script separate from the flow
// component means the copy can be reworded without touching logic.
//
// Voice: the first line is the ONE place the builder introduces herself — after
// that it's the app talking to the user, so everything below stays in the app's
// voice ("this app", "we") and never says "I'm Anna" again.
//
// Shape: the whole first sitting is a name, one task, one time, one permission,
// then the alert-style question — under a minute. It used to open with a bio
// and a Places explainer before the first task, and most new people left
// inside four minutes with nothing set up that could reach them.
// The about-you question is NOT in the first sitting any more (Anna, Nov 4
// 2026: "Make about me on second open"): it comes on the second open
// (CatchUpDialog, ABOUT_NOW scripts in catchUpScript.js), and someone who
// skips it there or never opens the app a second time gets one push about it
// (cronDailyTips). Nov 1 – Nov 4 2026 it was the last beat here, optional;
// Sep 29 – Nov 1 2026 it waited for the first checked-off task instead, and
// almost nobody got it: 3 of 16 new accounts. Someone on night shifts had
// nowhere to say so, and kept quiet hours of 10 PM to 8 AM — silent through
// their shift, ringing while they sleep (Anna, Nov 1 2026: "someone with a
// night shift would have nowhere to put that").
// Did they already say when, inside the task itself? "call the dentist at 3",
// "dentist tomorrow", "pay rent friday", "in 20 minutes" — then "when should
// it remind you?" is a question they just answered, so it isn't asked; the
// parser reads the time out of their words the same as it does on Home. Only
// plain time words count — a bare number ("pick up 3 things") is not a time.
export function saysWhen(text) {
  const t = String(text || '').toLowerCase();
  return /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/.test(t)
    || /\bat\s+\d{1,2}(:\d{2})?\b/.test(t)
    || /\b(today|tonight|tomorrow|tmrw|this (morning|afternoon|evening|weekend)|next week|noon|midnight)\b/.test(t)
    || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b/.test(t)
    || /\bin\s+(a|an|\d+)\s*(min|mins|minute|minutes|hour|hours|hr|hrs|day|days|week|weeks)\b/.test(t)
    || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/.test(t)
    || /\b\d{1,2}\/\d{1,2}\b/.test(t);
}

const SCRIPT = [
  {
    text: () => "Hey, welcome to ADHDone. Built by Anna, who got tired of missing doctor's appointments and of apps that don't work.",
  },
  {
    text: () => "First things first: what should we call you? You can change it in Settings anytime.",
    input: 'name',
  },
  {
    // The first win comes right after the name. One real thing on the list
    // inside the first minute, before a bio, a tour or a permission — so there
    // is a reminder to arrive, and a reason to come back. (The about-you
    // question comes on the second open, CatchUpDialog.)
    // (The @handle line that used to sit here promised sharing with friends,
    // which the app doesn't have; Anna, Oct 27 2026: no advertising what isn't there.)
    // It asks for something they can do today, so their first real reminder can
    // land on something they can check off. After 9 PM it says tomorrow. The
    // "When should it remind you?" buttons are In 30 minutes, then Later today
    // (In an hour from 7 PM), then Tomorrow at 9 (Anna, Nov 8 2026), so
    // someone who means tomorrow can still pick it (Anna, Nov 2 2026, after
    // Connie and Caterina's first reminders were both the next morning).
    text: (name) => `Nice to meet you, ${name}! What's one thing you keep forgetting that you could knock out ${new Date().getHours() >= 21 ? 'tomorrow' : 'today'}? Type it in and it's on your list.`,
    input: 'task',
  },
  {
    // Three taps, no typing. Skipped when they skipped the task, and when the
    // task already says when (Anna, Oct 13 2026: "it already has a time" as a
    // button made no sense — the app can tell, so it doesn't ask).
    text: () => "When should it remind you?",
    input: 'when',
    skip: (name, handle, about, task) => !task || saysWhen(task),
  },
  {
    // The notifications question, asked at the one moment it makes sense —
    // right after they set a time — with the reason on it. Only in the phone
    // app; the browser has nothing to ask (WelcomeChat skips it there).
    text: (name, handle, about, task, when) =>
      task
        ? `${when ? `Set for ${when}. ` : ''}So it can reach you, ${phoneOs()}'s about to ask if ADHDone can send notifications.`
        : `So reminders can reach you, ${phoneOs()}'s about to ask if ADHDone can send notifications.`,
    input: 'notify',
  },
  {
    // The closing line. Nothing that reaches them comes after this; the
    // about-you question waits for the second open.
    text: (name, handle, about, task, when, notify) =>
      notify === 'declined'
        ? "Without notifications nothing from ADHDone can reach you. You can turn them on any time from the row at the top of Home."
        : task
          ? `You're set. ${when ? `First reminder: ${when}.` : "It'll remind you when it's time."}`
          : "You're set — add something from Home whenever you're ready.",
    final: true,
  },
];

// Picking the first run back up. Someone who gave their name and then closed
// the app (Anna, Nov 4 2026, halfway through on the iPhone, closed it for an
// update: "if somebody doesn't complete the whole thing, it needs to come
// back") used to count as done, because having a name looked like having
// finished. Now the chat returns on the next open at the beat they left:
// a one-line "welcome back", then the task (unless one is already on their
// list), its time, the notifications question (unless already answered on
// this account), and the closing line. Nothing already answered is asked
// twice.
export function resumeScript({ hasTask = false, notifyAnswered = false } = {}) {
  const rest = SCRIPT.slice(2).map((beat) => {
    if (beat.input === 'task') {
      return {
        ...beat,
        text: () => `What's one thing you keep forgetting that you could knock out ${new Date().getHours() >= 21 ? 'tomorrow' : 'today'}? Type it in and it's on your list.`,
        skip: () => hasTask,
      };
    }
    if (beat.input === 'notify') {
      return { ...beat, skip: () => notifyAnswered };
    }
    if (beat.final && hasTask) {
      // Their first task went in last time; this sitting didn't add one.
      return {
        ...beat,
        text: () => "You're set — your first task is already on your list.",
      };
    }
    return beat;
  });
  return [
    { text: (name) => `Welcome back, ${name}! Let's pick up where we left off.` },
    ...rest,
  ];
}

export default SCRIPT;
