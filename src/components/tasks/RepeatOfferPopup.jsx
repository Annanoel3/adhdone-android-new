import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { winLook } from "@/components/wins/winsTheme";

// "Every day around this time?" (Anna, Nov 1 2026). The two people who open
// ADHDone every day both have a to-do that repeats daily; "pills" and "take
// birth control" were saved as one-time, checked off once, and the app went
// quiet. logTaskCompletion marks a checked-off one-time to-do that people
// normally do every day with repeat_offer { time, made_at } (time = when they
// actually did it, so the app never guesses morning or night). This asks once:
// a few seconds after an in-app check-off (after Undo has had its moment, and
// never while an ad is waiting for a pause), and the same few seconds after
// Done on a reminder or the phone's alarm, which lands them on Home (Anna,
// Nov 1 2026: "What about people that barely open the app and check tasks
// done by pressing done on an alarm"; it used to wait for their next open).
// If they've left by then, it's there on the next open. Yes adds a separate daily to-do through captureText,
// the same parser as everything else. Asked once (Anna, Nov 9 2026: "make
// sure it doesnt ask this for the same task over and over. Only once. And
// account for different wording"): the moment it's on screen it's stamped
// shown_at on the task (and remembered on this phone), it's never put up
// again, and logTaskCompletion never offers that kind of task again, however
// it's worded. Adding a task still never asks anything.
const DAY = 24 * 60 * 60 * 1000;
const OFFER_DAYS = 3;
// One offer at a time, at most one every half hour.
const BETWEEN_MS = 30 * 60 * 1000;
// After a check-off: Undo first (4 s), and logTaskCompletion asks the model.
const AFTER_DONE_MS = [7000, 15000, 25000, 40000];
const AD_OWED_KEY = "admgr_ad_owed";
// Offers already on screen on this phone, in case stamping shown_at on the
// task didn't make it (the app closed that second, no connection).
const SHOWN_KEY = "repeat_offer_shown";
const shownHere = new Set();

function shownBefore(id) {
  if (shownHere.has(id)) return true;
  try {
    const list = JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]");
    return Array.isArray(list) && list.includes(id);
  } catch { return false; }
}

function rememberShown(id) {
  shownHere.add(id);
  try {
    const list = JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]");
    const next = [...(Array.isArray(list) ? list : []).filter((x) => x !== id), id].slice(-50);
    localStorage.setItem(SHOWN_KEY, JSON.stringify(next));
  } catch { /* the shown_at stamp still covers it */ }
}

const ms = (v) => {
  const s = String(v || "");
  if (!s) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};

function clock12(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// "starting tomorrow" when they already did it today, or the time has passed;
// "starting today" when it was done on an earlier day and the time is still ahead.
function startingWhen(task, hhmm) {
  const doneAt = new Date(ms(task.completed_at) || ms(task.repeat_offer?.made_at) || Date.now());
  const now = new Date();
  if (dayKey(doneAt) === dayKey(now)) return "tomorrow";
  const [h, m] = String(hhmm).split(":").map((n) => parseInt(n, 10));
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at.getTime() > now.getTime() + 5 * 60 * 1000 ? "today" : "tomorrow";
}

function adWaiting() {
  try { return localStorage.getItem(AD_OWED_KEY) === "1"; } catch { return false; }
}

// The Layout remounts on every page change, so the watching lives out here.
let show = null; // the mounted popup's way to put a task up
let email = "";
let lastShownAt = 0;
let lastLookAt = 0;
let looking = false;
let timers = [];
let listening = false;
let upNow = false; // an offer is waiting its turn or on screen

// For the "What's next?" box (WhatsNextPopup): it waits while an offer is up,
// since a Yes here means the list isn't empty after all.
export function repeatOfferUp() {
  return upNow;
}

async function findOffer() {
  const done = await base44.entities.Task.filter({ created_by: email, status: "completed" }, "-updated_date", 25);
  const task = (done || []).find((t) =>
    t.repeat_offer?.time &&
    !t.repeat_offer.answer &&
    !t.repeat_offer.shown_at &&
    !shownBefore(t.id) &&
    Date.now() - ms(t.repeat_offer.made_at) < OFFER_DAYS * DAY
  ) || null;
  if (!task) return null;
  // They made it repeat some other way since: nothing to offer.
  if (task.task_family) {
    const open = await base44.entities.Task.filter(
      { created_by: email, status: "active", task_family: task.task_family }, "-updated_date", 20
    );
    if ((open || []).some((t) => t.recurrence_pattern && t.recurrence_pattern !== "none")) return null;
  }
  return task;
}

// True once something is up (or nothing more to do this time).
async function look(afterDone) {
  if (!show || !email || looking) return false;
  if (Date.now() - lastShownAt < BETWEEN_MS) return true;
  if (afterDone && adWaiting()) return false;
  looking = true;
  lastLookAt = Date.now();
  try {
    const task = await findOffer();
    if (!task || !show) return false;
    lastShownAt = Date.now();
    show(task);
    return true;
  } catch (e) {
    console.warn("[RepeatOffer] check failed:", e?.message || e);
    return false;
  } finally {
    looking = false;
  }
}

function scheduleLooks(inApp) {
  timers.forEach(clearTimeout);
  timers = [];
  let settled = false;
  for (const wait of AFTER_DONE_MS) {
    timers.push(setTimeout(async () => {
      if (settled) return;
      if (await look(inApp)) settled = true;
    }, wait));
  }
}

const afterDone = () => scheduleLooks(true);
// Done on a reminder or alarm (TaskNotification): no ad comes at that pause,
// so there's no ad to wait for.
const afterReminderDone = () => scheduleLooks(false);

function onVisible() {
  if (document.visibilityState === "visible" && Date.now() - lastLookAt > 60 * 1000) look(false);
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("task-done", afterDone);
  window.addEventListener("reminder-task-done", afterReminderDone);
  document.addEventListener("visibilitychange", onVisible);
}

export default function RepeatOfferPopup({ user, theme, specialMode }) {
  const look_ = winLook(theme, specialMode);
  const [task, setTask] = useState(null);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.email) return undefined;
    email = user.email;
    const put = (t) => { setTask(t); setTime(t.repeat_offer.time); };
    show = put;
    listen();
    if (Date.now() - lastLookAt > 60 * 1000) look(false);
    return () => { if (show === put) show = null; };
  }, [user?.email]);

  const shown = usePopupTurn(!!task);
  // { id, at, saving } for the offer on screen now.
  const stamp = useRef(null);

  useEffect(() => {
    upNow = !!task;
    return () => { upNow = false; };
  }, [task]);

  // On screen: that counts as asked.
  useEffect(() => {
    if (!shown || !task || stamp.current?.id === task.id) return;
    const at = new Date().toISOString();
    rememberShown(task.id);
    const saving = base44.entities.Task.update(task.id, { repeat_offer: { ...task.repeat_offer, shown_at: at } })
      .catch((e) => console.warn("[RepeatOffer] shown not saved:", e?.message || e));
    stamp.current = { id: task.id, at, saving };
  }, [shown, task]);

  const answer = async (value, extra = {}) => {
    const t = task;
    if (!t) return;
    const s = stamp.current?.id === t.id ? stamp.current : null;
    // The answer goes in after the shown_at stamp, never under it.
    if (s) await s.saving;
    try {
      await base44.entities.Task.update(t.id, {
        repeat_offer: {
          ...t.repeat_offer,
          ...(s ? { shown_at: s.at } : {}),
          ...extra,
          answer: value,
          answered_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn("[RepeatOffer] answer not saved:", e?.message || e);
    }
  };

  const no = async () => {
    setTask(null);
    await answer("no");
  };

  const closed = async () => {
    if (busy) return;
    setTask(null);
    await answer("dismissed");
  };

  const yes = async () => {
    if (busy || !task) return;
    const hhmm = /^\d{2}:\d{2}$/.test(time) ? time : task.repeat_offer.time;
    setBusy(true);
    try {
      let timezone;
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { timezone = undefined; }
      const res = await base44.functions.invoke("captureText", {
        text: `${task.title} every day at ${clock12(hhmm)}, starting ${startingWhen(task, hhmm)}`,
        timezone,
        capture_id: `repeat-${task.id}`,
        said_at: Date.now(),
      });
      const r = res?.data || res;
      if (!r?.success) throw new Error(r?.error || "not saved");
      await answer("yes", { time: hhmm });
      setTask(null);
      try { window.dispatchEvent(new Event("tasks-changed")); } catch { /* list refreshes on its own */ }
      toast({ title: "Every day it is", description: `Around ${clock12(hhmm)}.`, duration: 3000 });
    } catch (e) {
      console.error("[RepeatOffer] could not set it up:", e);
      toast({ title: "Couldn't set that up", description: "Check your connection and try again.", duration: 4000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) closed(); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look_.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle>Every day?</DialogTitle>
          <DialogDescription className={look_.muted}>
            {task ? `Want "${task.title}" back every day?` : ""}
          </DialogDescription>
        </DialogHeader>
        <label className={`flex items-center gap-3 text-sm ${look_.muted}`}>
          Around
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`w-36 ${look_.field}`}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="button" disabled={busy} onClick={yes} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            Yes, every day
          </Button>
          <Button type="button" disabled={busy} onClick={no} variant="outline" className={`w-full ${look_.outline}`}>
            No thanks
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
