import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { enqueueCapture } from "@/lib/pendingCaptures";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { winLook } from "@/components/wins/winsTheme";
import { repeatOfferUp } from "./RepeatOfferPopup";

// "What's next?" (Anna, Nov 1 2026). Two of the three people who checked
// something off in their first days and still left had nothing on their list
// afterward: nothing was coming tomorrow, so nothing brought them back. In a
// person's first week, when their last open to-do gets checked off, this asks
// for the next thing with a one-line add box that goes through the same
// capture pipeline as everything else. Birthdays, events and Back Burner
// tasks don't count as something coming. After an in-app check-off it waits
// for Undo and for the "Every day?" offer (a Yes there means the list isn't
// empty after all) and never shows while an ad is waiting; a list emptied
// from a reminder gets it on the next open. At most once a day.
const DAY = 24 * 60 * 60 * 1000;
const FIRST_WEEK = 7 * DAY;
const SHOWN_KEY = "whats_next_shown_at";
const AD_OWED_KEY = "admgr_ad_owed";
// After a check-off: past Undo (5 s) and the "Every day?" offer's first looks.
const AFTER_DONE_MS = 16000;
const ON_OPEN_MS = 4000;
const WAIT_STEP_MS = 1500;
const WAIT_MAX_MS = 90000;

const ms = (v) => {
  const s = String(v || "");
  if (!s) return NaN;
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};

function shownRecently() {
  try { return Date.now() - Number(localStorage.getItem(SHOWN_KEY) || 0) < DAY; } catch { return false; }
}

function adWaiting() {
  try { return localStorage.getItem(AD_OWED_KEY) === "1"; } catch { return false; }
}

// Something still coming: an open to-do that isn't a step, a birthday, an
// event or parked on the Back Burner.
const somethingComing = (t) =>
  !t.parent_task_id &&
  !t.birthday_person &&
  t.classification !== "event" &&
  t.classification !== "birthday" &&
  !t.silenced;

// The Layout remounts on every page change, so the watching lives out here.
let show = null;
let email = "";
let joinedAt = 0;
let lastLookAt = 0;
let looking = false;
let timer = null;
let listening = false;

function eligible() {
  return !!show && !!email && joinedAt > 0 && Date.now() - joinedAt < FIRST_WEEK && !shownRecently();
}

// Empty now, and emptied by a check-off in the last day (an account that never
// added anything is the welcome chat's and the come-back pushes' job).
async function listJustEmptied() {
  const active = await base44.entities.Task.filter({ created_by: email, status: "active" }, "-updated_date", 100);
  if ((active || []).some(somethingComing)) return false;
  const done = await base44.entities.Task.filter({ created_by: email, status: "completed" }, "-updated_date", 5);
  return (done || []).some((t) => Date.now() - ms(t.completed_at || t.updated_date) < DAY);
}

async function look(afterDone) {
  if (!eligible() || looking) return;
  if (afterDone && adWaiting()) return;
  looking = true;
  lastLookAt = Date.now();
  try {
    if (await listJustEmptied() && eligible()) show();
  } catch (e) {
    console.warn("[WhatsNext] check failed:", e?.message || e);
  } finally {
    looking = false;
  }
}

// Waits while an "Every day?" offer is up, then looks.
function lookWhenClear(afterDone, startedAt = Date.now()) {
  clearTimeout(timer);
  if (repeatOfferUp()) {
    if (Date.now() - startedAt < WAIT_MAX_MS) {
      timer = setTimeout(() => lookWhenClear(afterDone, startedAt), WAIT_STEP_MS);
    }
    return;
  }
  look(afterDone);
}

function afterDone() {
  clearTimeout(timer);
  timer = setTimeout(() => lookWhenClear(true), AFTER_DONE_MS);
}

function onVisible() {
  if (document.visibilityState === "visible" && Date.now() - lastLookAt > 60 * 1000) {
    clearTimeout(timer);
    timer = setTimeout(() => lookWhenClear(false), ON_OPEN_MS);
  }
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("task-done", afterDone);
  document.addEventListener("visibilitychange", onVisible);
}

export default function WhatsNextPopup({ user, theme, specialMode }) {
  const look_ = winLook(theme, specialMode);
  const [wanted, setWanted] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!user?.email) return undefined;
    email = user.email;
    joinedAt = ms(user.signed_up_at || user.created_date) || 0;
    const put = () => { setText(""); setWanted(true); };
    show = put;
    listen();
    if (Date.now() - lastLookAt > 60 * 1000) {
      clearTimeout(timer);
      timer = setTimeout(() => lookWhenClear(false), ON_OPEN_MS);
    }
    return () => { if (show === put) show = null; };
  }, [user?.email, user?.signed_up_at, user?.created_date]);

  const shown = usePopupTurn(wanted);

  // Counted once it's actually on screen: at most once a day.
  useEffect(() => {
    if (!shown) return;
    try { localStorage.setItem(SHOWN_KEY, String(Date.now())); } catch { /* shows again tomorrow */ }
  }, [shown]);

  const add = () => {
    const clean = text.trim();
    if (!clean) return;
    enqueueCapture({ text: clean });
    setWanted(false);
  };

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) setWanted(false); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look_.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle>What's next?</DialogTitle>
          <DialogDescription className={look_.muted}>
            Your list is clear. Anything else on your mind?
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); add(); }}
          className="flex flex-col gap-2 pt-1"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type it like you'd say it"
            className={look_.field}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" disabled={!text.trim()} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
              Add it
            </Button>
            <Button type="button" variant="outline" onClick={() => setWanted(false)} className={`w-full ${look_.outline}`}>
              Not now
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
