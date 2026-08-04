import React, { useState, useMemo } from "react";
import { Cake, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BirthdaysDialog from "../birthdays/BirthdaysDialog";
import { base44 } from "@/api/base44Client";

function daysUntil(iso) {
  const diff = new Date(iso) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatWhen(iso) {
  const d = daysUntil(iso);
  if (d <= 0) return "Today 🎉";
  if (d === 1) return "Tomorrow";
  if (d < 14) return `In ${d} day${d === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function UpcomingBirthdayCard({ tasks, user, theme, specialMode, onRefresh }) {
  const [showDialog, setShowDialog] = useState(false);

  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

  const birthdays = useMemo(
    () =>
      (tasks || [])
        .filter((t) => (t.birthday_person || t.classification === "birthday") && t.status === "active" && t.next_reminder)
        .filter((t) => new Date(t.next_reminder) - new Date() <= SIX_MONTHS_MS)
        .sort((a, b) => new Date(a.next_reminder) - new Date(b.next_reminder)),
    [tasks]
  );

  const next = birthdays[0];

  // Don't render the card at all when no birthdays are within 6 months
  if (!next) return null;

  const isToday = daysUntil(next.next_reminder) <= 0;
  const hasBirthdayText = !!next.birthday_text_message;

  const handleSendText = async (e) => {
    e.stopPropagation();
    if (!next.birthday_text_message) return;
    const body = encodeURIComponent(next.birthday_text_message);
    try {
      await base44.entities.Task.update(next.id, { birthday_text_sent: true });
    } catch (e) {
      console.error('Failed to mark text as sent:', e);
    }
    const cleanPhone = (next.birthday_phone_number || "").replace(/[^0-9+]/g, "");
    window.location.href = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?&body=${body}`;
  };

  return (
    <>
      <button type="button" onClick={() => setShowDialog(true)} className="w-full text-left">
        <Card
          className={`p-5 rounded-2xl transition-shadow hover:shadow-md ${
            specialMode && specialMode !== "normal" ? `${specialMode}-card` : ""
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-pink-100 flex items-center justify-center flex-shrink-0">
              <Cake className="w-6 h-6 text-pink-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Next birthday</p>
              {next ? (
                <>
                  <p className="font-bold text-gray-900 text-lg truncate">{next.birthday_person || (next.title || "").replace(/^🎂\s*/, "") || "Birthday"}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(next.next_reminder).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    · {formatWhen(next.next_reminder)}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-gray-900 text-lg">No birthdays yet</p>
                  <p className="text-sm text-gray-600">Tap to add a birthday reminder 🎂</p>
                </>
              )}
            </div>
            {isToday && hasBirthdayText ? (
              <Button
                onClick={handleSendText}
                size="sm"
                className="bg-pink-600 hover:bg-pink-700 text-white flex-shrink-0"
              >
                <Send className="w-4 h-4 mr-1" />
                Send Text
              </Button>
            ) : (
              <span className="text-xs text-gray-400 hidden sm:block whitespace-nowrap">Manage →</span>
            )}
          </div>
        </Card>
      </button>

      <BirthdaysDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        tasks={tasks}
        user={user}
        onRefresh={onRefresh}
      />
    </>
  );
}