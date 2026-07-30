import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Target } from "lucide-react";

export default function FocusModeButton({ user }) {
  const focusTaskId = user?.focus_mode_task_id || null;
  const [focusTitle, setFocusTitle] = useState("");

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