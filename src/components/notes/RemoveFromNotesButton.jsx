import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// "This doesn't need notes": drops the notes marks from the event's reminder
// labels and clears its questions, so it leaves the Notes page AND loses the
// Record notes button on its task card (both read the same marks).
const STRIP = { "night before · questions": "night before", "at the time · record notes": "at the time" };

export default function RemoveFromNotesButton({ task, dark, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    const reminder_schedule = (task.reminder_schedule || []).map((r) => (STRIP[r?.label] ? { ...r, label: STRIP[r.label] } : r));
    await base44.entities.Task.update(task.id, { reminder_schedule, prep_questions: [] });
    onRemoved(task.id);
  };
  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className={`shrink-0 inline-flex items-center gap-1 text-sm px-3 py-2 rounded-xl border ${dark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Remove
    </button>
  );
}