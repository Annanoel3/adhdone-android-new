import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { enqueueCapture } from "@/lib/pendingCaptures";
import { anyPopupOpen, usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { winLook } from "@/components/wins/winsTheme";
import { trackFire } from "@/lib/appTrack";

// Something typed into the app that gets sorted as an idea lands in the Parking
// Lot, not on Tasks. A 1.5-second toast was the only sign of that, so it could
// look like the task had vanished: on Nov 1 2026 Michael typed "Somatic Work",
// looked on Tasks, went back to Add Task, and left. This stays up until they
// close it, make it a task, leave the page, or leave the app, and "Make it a
// task" goes through the same parser and the same idea-to-task path as the
// Parking Lot page (Anna, Nov 2 2026). It asks nothing and blocks nothing, so
// adding a task still never asks a question.
//
// taskCreationPipeline sends "idea-saved" for one plain idea only. A list, or
// a reading logged onto a tracker, keeps the short toast: those aren't one
// thing that could become one task.
const PARKING_LOT_PATH = "/parkinglot";
const SHORT_TOAST = { title: "💡 Saved to your Parking Lot", duration: 1500 };
const POPUP_CHECK_MS = 500;

export default function IdeaSavedNotice({ theme, specialMode }) {
  const location = useLocation();
  const [idea, setIdea] = useState(null);
  // Takes its turn like any popup that answers something they just did: never
  // on top of another popup, and nothing else opens on its own while it's up.
  const shown = usePopupTurn(!!idea, { reactive: true });

  // Lowercase, because the same page shows up as both /Home and /home.
  const path = location.pathname.toLowerCase();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    const onSaved = (e) => {
      const saved = e.detail;
      if (!saved?.id || !saved?.text) return;
      if (document.visibilityState === "hidden") return;
      // Already looking at the Parking Lot: they can see it land.
      if (pathRef.current === PARKING_LOT_PATH) {
        toast(SHORT_TOAST);
        return;
      }
      setIdea(saved);
    };
    window.addEventListener("idea-saved", onSaved);
    return () => window.removeEventListener("idea-saved", onSaved);
  }, []);

  // Leaving the page closes it.
  useEffect(() => {
    setIdea(null);
  }, [path]);

  // So does leaving the app: it shouldn't be sitting there, holding back other
  // popups, when they come back later.
  useEffect(() => {
    if (!idea) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setIdea(null);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [idea]);

  // A popup they opened themselves (a task's card, the side menu) doesn't wait
  // its turn, so this steps aside for it.
  useEffect(() => {
    if (!shown) return undefined;
    trackFire("idea_notice", { props: { action: "shown" } });
    const timer = setInterval(() => {
      if (anyPopupOpen()) setIdea(null);
    }, POPUP_CHECK_MS);
    return () => clearInterval(timer);
  }, [shown]);

  const close = () => {
    trackFire("idea_notice", { props: { action: "closed" } });
    setIdea(null);
  };

  const makeTask = async () => {
    const saved = idea;
    if (!saved) return;
    // Closed first, so a second tap can't send it twice.
    setIdea(null);
    trackFire("idea_notice", { props: { action: "make_task" } });
    try {
      // The same two steps as the Parking Lot page's convert. If no task comes
      // of it, TaskCaptureProcessor puts the idea back.
      await base44.entities.ParkingLotIdea.update(saved.id, { converted_to_task: true });
      enqueueCapture({ text: saved.text, fromIdea: { id: saved.id, pictures: [], notes: "" } });
      window.dispatchEvent(new Event("parking-lot-changed"));
      toast({ title: "Moving it to Tasks", duration: 2000 });
    } catch (e) {
      console.error("[IDEA NOTICE] Could not make it a task:", e);
      toast({ title: "Couldn't move it", description: "It's still in your Parking Lot.", variant: "destructive" });
    }
  };

  if (!shown || !idea) return null;

  const look = winLook(theme, specialMode);
  return (
    <div
      role="status"
      className={`fixed left-4 right-4 z-[100] mx-auto max-w-md rounded-xl border p-3 shadow-lg ${look.surface}`}
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">💡 Saved to your Parking Lot</p>
          <p className={`truncate text-sm ${look.muted}`}>{idea.text}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className={`-mr-1 -mt-1 flex-shrink-0 rounded-md p-1 ${look.muted}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={makeTask}
        className="mt-2 w-full bg-purple-600 text-white hover:bg-purple-700"
      >
        Make it a task
      </Button>
    </div>
  );
}
