import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Target } from "lucide-react";

export default function FocusModeButton({ user }) {
  const [focusTaskId, setFocusTaskId] = useState(user?.focus_mode_task_id || null);
  const [focusTitle, setFocusTitle] = useState("");
  const [introSeen, setIntroSeen] = useState(
    () => localStorage.getItem("focus_intro_seen") === "1" || !!user?.focus_intro_seen
  );

  useEffect(() => {
    const handler = (e) => setFocusTaskId(e.detail?.taskId || null);
    window.addEventListener("focus-mode-changed", handler);
    return () => window.removeEventListener("focus-mode-changed", handler);
  }, []);

  // Reveal the button once the one-time Focus Mode intro has fired.
  useEffect(() => {
    const handler = () => setIntroSeen(true);
    window.addEventListener("focus-intro-seen", handler);
    return () => window.removeEventListener("focus-intro-seen", handler);
  }, []);

  useEffect(() => {
    if (user?.focus_intro_seen) {
      setIntroSeen(true);
      localStorage.setItem("focus_intro_seen", "1");
    }
  }, [user?.focus_intro_seen]);

  useEffect(() => {
    if (!focusTaskId) {
      setFocusTitle("");
      return;
    }
    base44.entities.Task
      .get(focusTaskId)
      .then((t) => setFocusTitle(t?.title || ""))
      .catch(() => setFocusTitle(""));
  }, [focusTaskId]);

  const openPrompt = () => window.dispatchEvent(new CustomEvent("open-focus-prompt"));

  if (focusTaskId) {
    return (
      <button
        onClick={openPrompt}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-green-600 text-white text-sm font-medium shadow-sm hover:bg-green-700 transition max-w-full"
      >
        <Target className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">Focusing: {focusTitle || "your task"}</span>
      </button>
    );
  }

  // Hide the Focus Mode button until the one-time intro popup has happened.
  if (!introSeen) return null;

  return (
    <button
      onClick={openPrompt}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-green-500 text-green-700 text-sm font-medium hover:bg-green-50 transition"
    >
      <Target className="w-4 h-4" />
      Focus Mode
    </button>
  );
}