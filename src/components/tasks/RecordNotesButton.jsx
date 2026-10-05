import React from "react";
import { Link } from "react-router-dom";
import { Mic } from "lucide-react";
import { usePluginPresent } from "@/components/shared/WidgetTaskSync";

// Same rule as the Notes page: an event the reminder planner judged worth notes.
const NOTES_LABELS = ["night before · questions", "at the time · record notes"];
export function isRecordable(task) {
  if (!task || task.parent_task_id || task.birthday_person || task.status !== "active") return false;
  return (task.reminder_schedule || []).some((r) => NOTES_LABELS.includes(r?.label))
    || (task.prep_questions || []).length > 0;
}

// A clear "Record notes" pill on the card, straight to this event on the Notes page.
export default function RecordNotesButton({ task, theme, compact }) {
  const canRecord = usePluginPresent("RecorderBridge");
  if (!canRecord || !isRecordable(task)) return null;
  if (compact) {
    // Closed card: just a little notes sheet with a red "recording" dot.
    return (
      <Link
        to={`/Notes?task=${task.id}&prep=1`}
        onClick={(e) => e.stopPropagation()}
        aria-label="Record notes"
        className="relative flex-shrink-0 text-lg leading-none px-0.5"
      >
        📝
        <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-red-500" />
      </Link>
    );
  }
  return (
    <Link
      to={`/Notes?task=${task.id}&prep=1`}
      onClick={(e) => e.stopPropagation()}
      className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${
        theme === "dark" ? "bg-red-900/40 text-red-200 border-red-700" : "bg-red-50 text-red-700 border-red-300"
      }`}
    >
      <Mic className="w-3.5 h-3.5" /> Record notes
    </Link>
  );
}