import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { persistOnboardingFlag } from "@/components/onboarding/onboardingSync";
import { winLook } from "@/components/wins/winsTheme";

// "Check out the new Insights!" (Anna, Oct 30 2026): once, on the next app
// open, for people who already had the app when the areas-of-life bubbles and
// wins arrived. Someone new finds Insights on their own; this is not part of
// their setup. Waits its turn like every popup that opens on its own.
// v2: v1 marked itself seen the moment it appeared, which closed it again in
// the same instant (Anna, Oct 30 2026: "a popup flashed for like .00001
// seconds"), so everyone who got the flash gets it properly once.
const FLAG = "new_insights_seen_v2";
const RELEASED = Date.parse("2026-10-31T12:00:00Z");

function seenHere() {
  try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return false; }
}

export default function NewInsightsPopup({ user, theme, specialMode, currentPageName }) {
  const navigate = useNavigate();
  const look = winLook(theme, specialMode);
  // Decided once, when the account loads, and then held: marking it seen
  // (below) must not make it close itself, which is what the flash was.
  const [eligible, setEligible] = useState(false);
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !user?.email) return;
    decided.current = true;
    const joined = Date.parse(user?.signed_up_at || user?.created_date || "");
    const flags = Array.isArray(user?.onboarding_flags) ? user.onboarding_flags : [];
    if (Number.isFinite(joined) && joined < RELEASED && !flags.includes(FLAG) && !seenHere()) {
      setEligible(true);
    }
  }, [user]);

  // Already on Insights: nothing to point at (it waits for another page).
  const wanted = eligible && currentPageName !== "Progress";

  const shown = usePopupTurn(wanted);

  // Counted as seen once it is actually on screen, so it never comes back.
  useEffect(() => {
    if (!shown) return;
    try { localStorage.setItem(FLAG, "1"); } catch (e) { /* the account flag still saves */ }
    persistOnboardingFlag(FLAG);
  }, [shown]);

  const close = () => setEligible(false);
  const go = () => {
    setEligible(false);
    navigate("/Progress");
  };

  return (
    <Dialog open={shown} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle>Check out the new Insights!</DialogTitle>
          <DialogDescription className={look.muted}>
            See which areas of life your month went to, and keep your wins in one spot for the hard days.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" onClick={go} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            Show me
          </Button>
          <Button type="button" variant="ghost" onClick={close} className={`w-full ${look.subtle}`}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
