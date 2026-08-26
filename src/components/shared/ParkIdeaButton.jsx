import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, Send } from "lucide-react";
import { usePomodoro } from "@/context/PomodoroContext";
import { useLaunch } from "@/context/LaunchContext";

// Always-available way to dump a distracting thought straight into the Parking
// Lot without losing your place. Hidden only on the pages where it'd be
// redundant (the Parking Lot itself and the Add Task flow).
export default function ParkIdeaButton({ user, theme, currentPageName }) {
  const pomo = usePomodoro();
  const launch = useLaunch();

  const [focusActive, setFocusActive] = useState(!!user?.focus_mode_task_id);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Sync focus-mode state from the user profile + cross-tab broadcast events.
  useEffect(() => {
    setFocusActive(!!user?.focus_mode_task_id);
  }, [user?.focus_mode_task_id]);

  useEffect(() => {
    const handler = (e) => setFocusActive(!!e?.detail?.taskId);
    window.addEventListener("focus-mode-changed", handler);
    return () => window.removeEventListener("focus-mode-changed", handler);
  }, []);

  const HIDDEN_PAGES = ["ParkingLot", "AddTask"];
  const visible = !HIDDEN_PAGES.includes(currentPageName);
  // A focus/sprint/pomodoro session is running — sit higher so the button
  // doesn't land under the session pill anchored near the bottom.
  const sessionActive = focusActive || launch?.hasActiveLaunch || pomo?.isActive;
  const bottomOffset = sessionActive
    ? "max(8.5rem, calc(8.5rem + env(safe-area-inset-bottom)))"
    : "max(1.25rem, calc(1.25rem + env(safe-area-inset-bottom)))";

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await base44.entities.ParkingLotIdea.create({ idea: trimmed });
    } catch (e) {
      console.error("Park idea save failed", e);
    } finally {
      setSaving(false);
      setText("");
      setOpen(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }
  };

  if (!visible) return null;

  const accent =
    theme === "dark"
      ? "bg-gray-900 text-white border-gray-700 hover:bg-gray-800"
      : theme === "spicybrains"
        ? "bg-gradient-to-r from-pink-500 to-yellow-500 text-gray-900 font-bold border-2 border-cyan-400 hover:from-pink-600 hover:to-yellow-600"
        : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50 shadow-lg";

  const pillAccent =
    theme === "dark"
      ? "bg-gray-900 text-white border border-gray-700"
      : theme === "spicybrains"
        ? "bg-gradient-to-r from-pink-500 to-yellow-500 text-gray-900 border-2 border-cyan-400"
        : "bg-green-600 text-white";

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-40 pointer-events-none"
        style={{ bottom: bottomOffset }}
      >
        <Button
          onClick={() => setOpen(true)}
          className={`pointer-events-auto rounded-full px-5 h-12 gap-2 ${accent}`}
        >
          <Lightbulb className="w-5 h-5" />
          <span className="font-semibold">Park an Idea</span>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Park an Idea
            </DialogTitle>
            <DialogDescription>
              Got a distracting thought? Dump it here and get back to it later.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type the thing that's pulling your attention…"
            className="min-h-[96px] resize-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
            }}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !text.trim()}>
              <Send className="w-4 h-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {justSaved && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-3 shadow-2xl text-sm font-semibold ${pillAccent}`}
          style={{ bottom: bottomOffset }}
        >
          💡 Saved. Get back to work.
        </div>
      )}
    </>
  );
}