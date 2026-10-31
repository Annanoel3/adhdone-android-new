import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { listWins, readSlumpShownAt, writeSlumpShownAt } from "./winsStore";
import { winLook } from "./winsTheme";

// "Rough week?" (Anna, Oct 31 2026): when someone hasn't finished a single
// task in a week but still has things on their list, point them at their
// wins. Only with at least 5 wins to look at ("showing someone their three
// wins sounds kind of depressing"), only on an account at least 8 days old
// (so there is a whole week to look back on), and at most once a week.
const DAY = 24 * 60 * 60 * 1000;
const MIN_WINS = 5;
const RECHECK_MS = 30 * 60 * 1000;

// The Layout remounts on every page change; the answer is kept here so the
// check runs once per half hour, not on every page.
let decided = null; // { email, at, n }
let deciding = null;

function lastShownMs(user) {
  return Math.max(Date.parse(user?.wins_slump_shown_at || "") || 0, Date.parse(readSlumpShownAt()) || 0);
}

// The number of wins to show them, or 0 when the popup shouldn't come up.
async function slumpWins(user) {
  if (Date.now() - lastShownMs(user) < 7 * DAY) return 0;
  const joined = Date.parse(user.signed_up_at || user.created_date || "");
  if (!joined || Date.now() - joined < 8 * DAY) return 0;

  // Anything finished in the last 7 days (any task, steps included) and it's
  // not a slump.
  const weekAgo = Date.now() - 7 * DAY;
  const done = await base44.entities.Task.filter(
    { created_by: user.email, status: "completed" }, "-completed_at", 5
  );
  if ((done || []).some((t) => (Date.parse(t.completed_at || "") || 0) >= weekAgo)) return 0;

  const wins = await listWins(500);
  if (wins.length < MIN_WINS) return 0;

  // Something still on their list (an empty list isn't a slump). Birthdays,
  // events and back-burnered tasks aren't things waiting to be done.
  const active = await base44.entities.Task.filter(
    { created_by: user.email, status: "active" }, "-updated_date", 100
  );
  const waiting = (active || []).some((t) =>
    !t.birthday_person &&
    t.classification !== "event" &&
    t.classification !== "birthday" &&
    !t.silenced
  );
  return waiting ? wins.length : 0;
}

function decide(user) {
  if (decided && decided.email === user.email && Date.now() - decided.at < RECHECK_MS) {
    return Promise.resolve(decided.n);
  }
  if (!deciding) {
    deciding = slumpWins(user)
      .then((n) => {
        decided = { email: user.email, at: Date.now(), n };
        return n;
      })
      .finally(() => { deciding = null; });
  }
  return deciding;
}

export default function WinsSlumpPopup({ user, theme, specialMode }) {
  const navigate = useNavigate();
  const look = winLook(theme, specialMode);
  const [count, setCount] = useState(0);
  const [wanted, setWanted] = useState(false);
  const email = user?.email;
  const shownAt = user?.wins_slump_shown_at;

  useEffect(() => {
    if (!user?.email) return undefined;
    let gone = false;
    decide(user)
      .then((n) => {
        if (!gone && n >= MIN_WINS) {
          setCount(n);
          setWanted(true);
        }
      })
      .catch((e) => console.warn("[Wins] slump check failed:", e?.message || e));
    return () => { gone = true; };
    // Re-checked when the account or its last showing changes, not on every
    // fresh copy of the same profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, shownAt]);

  const shown = usePopupTurn(wanted);

  // Counted as shown only once it's actually on screen.
  useEffect(() => {
    if (!shown) return;
    const iso = new Date().toISOString();
    writeSlumpShownAt(iso);
    if (decided) decided = { ...decided, n: 0 };
    base44.auth.updateMe({ wins_slump_shown_at: iso }).catch((e) => {
      console.warn("[Wins] could not save wins_slump_shown_at:", e?.message || e);
    });
  }, [shown]);

  const seeWins = () => {
    setWanted(false);
    navigate("/Progress?wins=1");
  };

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) setWanted(false); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle>Rough week?</DialogTitle>
          <DialogDescription className={look.muted}>
            {`You've got ${count >= 500 ? "500+" : count} wins saved. Take a look at what you can do.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" onClick={seeWins} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            See my wins
          </Button>
          <Button type="button" variant="ghost" onClick={() => setWanted(false)} className={`w-full ${look.subtle}`}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
