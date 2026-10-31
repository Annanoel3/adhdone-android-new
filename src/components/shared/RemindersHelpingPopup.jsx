import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { winLook } from "@/components/wins/winsTheme";

// "Are your reminders helping?" (Anna, Oct 31 2026). Smart Reminders asks it
// once, as a push with Yes / No buttons (cronSmartTaskNudge, ARE THEY
// HELPING?), when someone keeps putting its reminders off without finishing.
// The buttons answer it without this popup (OneSignalInit). A tap on the push
// itself, or a phone that doesn't pass the button on (an older build, the
// iPhone), opens the app at /Home?remindersHelping=1, and this asks the same
// question. No = one Smart Reminder a day; Yes changes nothing.
// On full-screen alarms (build 44 on) the question rings, and its Yes / No
// open the app at /Home?remindersHelping=yes|no: saved here, no popup.
export const HELPING_PARAM = "remindersHelping";

// One save per tap, even if the page is rebuilt around it while it saves.
let lastDirect = "";

// What happens now, said once the answer is saved.
function sayWhatHappens(r, answer) {
  if (r?.changed === false && r?.answer && r.answer !== answer) {
    toast({
      title: "You already answered this one",
      description: r.one_a_day ? "You're on one reminder a day." : "Your reminders stay as they are.",
      duration: 4000,
    });
    return;
  }
  if (r?.one_a_day) {
    toast({ title: "Got it: one reminder a day", description: "Times you set yourself still go off.", duration: 4000 });
  } else {
    toast({ title: "Got it", description: "Your reminders stay as they are.", duration: 3000 });
  }
}

// Saves their answer (remindersHelping). True when it's saved, or was already.
export async function answerRemindersHelping(answer) {
  try {
    const res = await base44.functions.invoke("remindersHelping", { mode: "answer", answer });
    const r = res?.data || res;
    if (!r?.success) throw new Error(r?.error || "not saved");
    sayWhatHappens(r, answer);
    return true;
  } catch (e) {
    console.error("[RemindersHelping] answer not saved:", e);
    toast({ title: "Couldn't save that", description: "Check your connection and try again.", duration: 4000 });
    return false;
  }
}

export default function RemindersHelpingPopup({ theme, specialMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const look = winLook(theme, specialMode);
  const param = new URLSearchParams(location.search).get(HELPING_PARAM);
  const asked = param === "1";
  const direct = param === "yes" || param === "no" ? param : "";
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const checkedKey = useRef(null);

  // The param comes off the address when the popup closes, not while it's up
  // (WinAskFromLink: a navigation while it's open could remount the page
  // around it and close it in the same instant).
  const dropParam = () => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(HELPING_PARAM)) return;
    params.delete(HELPING_PARAM);
    const rest = params.toString();
    navigate(`${window.location.pathname}${rest ? `?${rest}` : ""}`, { replace: true, state: location.state });
  };

  // Decided once per tap, then held: the server says whether the question is
  // still waiting for an answer (answered on another phone or with a button
  // already: nothing to show). Only answering or closing takes it down.
  useEffect(() => {
    if (!asked || checkedKey.current === location.key) return;
    checkedKey.current = location.key;
    base44.functions.invoke("remindersHelping", { mode: "status" })
      .then((res) => {
        const r = res?.data || res;
        if (r?.pending) setEligible(true);
        else dropParam();
      })
      .catch(() => dropParam());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, location.key]);

  // Yes / No tapped on the alarm screen: saved straight away. Not saved: the
  // popup asks again.
  useEffect(() => {
    if (!direct) return;
    const key = `${direct}|${location.key}`;
    if (lastDirect === key) return;
    lastDirect = key;
    answerRemindersHelping(direct).then((ok) => {
      if (ok) { dropParam(); return; }
      const params = new URLSearchParams(window.location.search);
      params.set(HELPING_PARAM, "1");
      navigate(`${window.location.pathname}?${params.toString()}`, { replace: true, state: location.state });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, location.key]);

  // It's the answer to a push they just tapped: up as soon as the screen is free.
  const shown = usePopupTurn(eligible, { reactive: true });

  const close = () => {
    setEligible(false);
    dropParam();
  };
  const pick = async (answer) => {
    if (busy) return;
    setBusy(true);
    const ok = await answerRemindersHelping(answer);
    setBusy(false);
    // Not saved: it stays up so they can try again.
    if (ok) close();
  };

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle>Are your reminders helping?</DialogTitle>
          <DialogDescription className={look.muted}>
            Tap No and you'll only get one a day.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="button" disabled={busy} onClick={() => pick("yes")} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            Yes
          </Button>
          <Button type="button" disabled={busy} onClick={() => pick("no")} variant="outline" className={`w-full ${look.outline}`}>
            No
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
