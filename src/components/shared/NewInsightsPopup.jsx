import React, { useEffect, useState } from "react";
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
const FLAG = "new_insights_seen_v1";
const RELEASED = Date.parse("2026-10-31T12:00:00Z");

function seenHere() {
  try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return false; }
}

export default function NewInsightsPopup({ user, theme, specialMode, currentPageName }) {
  const navigate = useNavigate();
  const look = winLook(theme, specialMode);
  const [dismissed, setDismissed] = useState(false);

  const joined = Date.parse(user?.signed_up_at || user?.created_date || "");
  const flags = Array.isArray(user?.onboarding_flags) ? user.onboarding_flags : [];
  const wanted = !!user?.email
    && !dismissed
    && Number.isFinite(joined) && joined < RELEASED
    && !flags.includes(FLAG)
    && !seenHere()
    // Already on Insights: nothing to point at.
    && currentPageName !== "Progress";

  const shown = usePopupTurn(wanted);

  // Counted as seen once it is actually on screen, so it never comes back.
  useEffect(() => {
    if (!shown) return;
    try { localStorage.setItem(FLAG, "1"); } catch (e) { /* the account flag still saves */ }
    persistOnboardingFlag(FLAG);
  }, [shown]);

  const close = () => setDismissed(true);
  const go = () => {
    setDismissed(true);
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
