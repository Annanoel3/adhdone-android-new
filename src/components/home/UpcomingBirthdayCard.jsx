import React, { useState, useMemo } from "react";
import { Cake } from "lucide-react";
import { Card } from "@/components/ui/card";
import BirthdaysDialog from "../birthdays/BirthdaysDialog";

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

  const birthdays = useMemo(
    () =>
      (tasks || [])
        .filter((t) => t.birthday_person && t.status === "active" && t.next_reminder)
        .sort((a, b) => new Date(a.next_reminder) - new Date(b.next_reminder)),
    [tasks]
  );

  const next = birthdays[0];

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
                  <p className="font-bold text-gray-900 text-lg truncate">{next.birthday_person}</p>
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
            <span className="text-xs text-gray-400 hidden sm:block whitespace-nowrap">Manage →</span>
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