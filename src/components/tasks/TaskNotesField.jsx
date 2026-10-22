import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Pencil } from "lucide-react";

// Saved notes show as plain text under the label; tapping them (or the pencil)
// opens the box again. Tapping out saves and folds it back to text.
export default function TaskNotesField({ value, onChange, onSave, theme, startEditing }) {
  const [editing, setEditing] = useState(!!startEditing);
  const dark = theme === "dark";

  const finish = () => {
    onSave();
    if ((value || "").trim()) setEditing(false);
  };

  return (
    <div className="space-y-2">
      <div className={`text-sm font-medium flex items-center gap-2 ${dark ? "text-gray-300" : "text-gray-700"}`}>
        <FileText className="w-4 h-4" />
        <span className="flex-1">Notes</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="p-1" aria-label="Edit notes">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      {editing ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={finish}
          autoFocus={!!(value || "").trim()}
          placeholder="Add any additional notes..."
          className="min-h-[80px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`w-full text-left whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${dark ? "bg-gray-800 text-gray-100" : "bg-gray-50 text-gray-800"}`}
        >
          {value}
        </button>
      )}
    </div>
  );
}