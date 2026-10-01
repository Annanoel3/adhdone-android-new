import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cake, Trash2, PenLine, Send } from "lucide-react";
import { cancelScheduledReminder } from "../utils/reminderScheduler";
import BirthdayEditDialog from "./BirthdayEditDialog";
import BirthdayTextDialog from "./BirthdayTextDialog";

function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

function formatWhen(iso) {
  const d = daysUntil(iso);
  if (d <= 0) return "Today 🎉";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export default function BirthdayList({ birthdays, theme, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [textFor, setTextFor] = useState(null);

  const handleDelete = async (task) => {
    if (task.onesignal_notification_ids?.length) {
      await cancelScheduledReminder(task.onesignal_notification_ids).catch(() => {});
    }
    await base44.entities.Task.delete(task.id).catch(() => {});
    onRefresh?.();
  };

  const handleSendText = async (b) => {
    const body = encodeURIComponent(b.birthday_text_message || "");
    try {
      await base44.entities.Task.update(b.id, { birthday_text_sent: true });
    } catch (e) {
      console.error("Failed to mark text as sent:", e);
    }
    const cleanPhone = (b.birthday_phone_number || "").replace(/[^0-9+]/g, "");
    window.location.href = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?&body=${body}`;
  };

  if (birthdays.length === 0) {
    return (
      <p className={`text-sm text-center py-10 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
        No birthdays yet. Add one — or bring in your phone's calendars to pull them in.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {birthdays.map((b) => (
        <Card key={b.id} className="p-3 flex items-center gap-3">
          <button onClick={() => setEditing(b)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
            <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0">
              <Cake className="w-5 h-5 text-pink-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                {b.birthday_person || (b.title || "").replace(/^🎂\s*/, "") || "Birthday"}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(b.next_reminder).toLocaleDateString(undefined, { month: "long", day: "numeric" })} ·{" "}
                {formatWhen(b.next_reminder)}
              </p>
            </div>
          </button>

          {b.birthday_text_message ? (
            <Button size="sm" onClick={() => handleSendText(b)} className="bg-pink-600 hover:bg-pink-700 text-white flex-shrink-0">
              <Send className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setTextFor(b)} className="border-pink-300 text-pink-700 flex-shrink-0">
              <PenLine className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Write text</span>
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={() => handleDelete(b)} title="Delete">
            <Trash2 className="w-4 h-4 text-gray-500" />
          </Button>
        </Card>
      ))}

      <BirthdayEditDialog
        birthday={editing}
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        onSaved={onRefresh}
      />
      <BirthdayTextDialog
        isOpen={!!textFor}
        onClose={() => setTextFor(null)}
        birthdayTask={textFor}
        onSaved={onRefresh}
      />
    </div>
  );
}