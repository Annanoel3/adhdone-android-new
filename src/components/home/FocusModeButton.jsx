import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Target } from "lucide-react";

export default function FocusModeButton({ user }) {
  const [focusTaskId, setFocusTaskId] = useState(user?.focus_mode_task_id || null);
  const [focusTitle, setFocusTitle] = useState("");

  useEffect(() => {
    const handler = (e) => setFocusTaskId(e.detail?.taskId || null);
    window.addEventListener("focus-mode-changed", handler);
    return () => window.removeEventListener("focus-mode-changed", handler);
  }, []);

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

  // Idle: same icon-over-label shape as the quick tool shortcuts next to it.
  return (
    <button
      onClick={openPrompt}
      aria-label="Focus Mode"
      className="flex flex-col items-center gap-1 w-[62px] select-none"
    >
      <span className="flex items-center justify-center w-10 h-10 rounded-full border border-green-500 text-green-600 hover:bg-green-50 transition-colors">
        <Target className="w-4 h-4" />
      </span>
      <span className="text-[10px] leading-tight text-center text-gray-600">Focus Mode</span>
    </button>
  );
}