import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Cake, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  scheduleBirthdayReminders,
  computeNextBirthdayDate,
  ensureBirthdayReminders,
} from "../utils/birthdayScheduler";
import { cancelScheduledReminder } from "../utils/reminderScheduler";

function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

function formatWhen(iso) {
  const d = daysUntil(iso);
  if (d <= 0) return "Today 🎉";
  if (d === 1) return "Tomorrow";
  return `In ${d} day${d === 1 ? "" : "s"}`;
}

const REMINDER_ROWS = [
  { key: "week_before", label: "1 week before", hint: "A nudge to prep a gift or message" },
  { key: "day_before", label: "1 day before", hint: "A heads-up the day prior" },
  { key: "day_of", label: "Day of", hint: "So you don't miss it" },
];

export default function BirthdaysDialog({ isOpen, onClose, tasks, user, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [toggles, setToggles] = useState({ week_before: true, day_before: true, day_of: true });
  const [saving, setSaving] = useState(false);

  const birthdays = useMemo(
    () =>
      (tasks || [])
        .filter((t) => t.birthday_person && t.status === "active" && t.next_reminder)
        .sort((a, b) => new Date(a.next_reminder) - new Date(b.next_reminder)),
    [tasks]
  );

  useEffect(() => {
    if (isOpen) {
      setShowAdd(false);
      ensureBirthdayReminders(birthdays);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setName("");
    setDate("");
    setToggles({ week_before: true, day_before: true, day_of: true });
  };

  const handleAdd = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      const [, m, d] = date.split("-").map(Number);
      const nextDate = computeNextBirthdayDate(m, d);
      const task = await base44.entities.Task.create({
        title: `🎂 ${name.trim()}'s Birthday`,
        description: `Birthday reminder for ${name.trim()}.`,
        urgency: "medium",
        energy_required: "low",
        status: "active",
        reminder_interval: "once",
        recurrence_pattern: "yearly",
        birthday_person: name.trim(),
        birthday_remind_week_before: toggles.week_before,
        birthday_remind_day_before: toggles.day_before,
        birthday_remind_day_of: toggles.day_of,
        next_reminder: nextDate.toISOString(),
        notification_recipient_email: user?.email,
        onesignal_notification_ids: [],
      });
      await scheduleBirthdayReminders(task);
      resetForm();
      setShowAdd(false);
      onRefresh?.();
    } catch (e) {
      console.error("Failed to add birthday", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task) => {
    if (task.onesignal_notification_ids?.length) {
      await cancelScheduledReminder(task.onesignal_notification_ids).catch(() => {});
    }
    await base44.entities.Task.delete(task.id).catch(() => {});
    onRefresh?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cake className="w-5 h-5 text-pink-600" /> Birthdays
          </DialogTitle>
          <DialogDescription>
            Never miss the people who matter. Birthdays repeat yearly and remind you with a 🎂.
          </DialogDescription>
        </DialogHeader>

        {showAdd ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bd-name">Whose birthday?</Label>
              <Input
                id="bd-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mom, Alex, Grandma"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bd-date">Birthday date</Label>
              <Input
                id="bd-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-gray-500">Year doesn't matter — we'll remind you every year.</p>
            </div>

            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700">Reminders</p>
              {REMINDER_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">🎂 {row.label}</p>
                    <p className="text-xs text-gray-500">{row.hint}</p>
                  </div>
                  <Switch
                    checked={toggles[row.key]}
                    onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [row.key]: v }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleAdd}
                disabled={!name.trim() || !date || saving}
                className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
              >
                {saving ? "Saving…" : "Save birthday"}
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              onClick={() => setShowAdd(true)}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white rounded-xl"
            >
              <Plus className="w-4 h-4" /> Add Birthday
            </Button>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {birthdays.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">
                  No birthdays yet. Add one — or sync Google Calendar to pull them in.
                </p>
              )}
              {birthdays.map((b) => (
                <Card key={b.id} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0">
                    <Cake className="w-5 h-5 text-pink-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{b.birthday_person}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(b.next_reminder).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      · {formatWhen(b.next_reminder)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(b)} title="Delete">
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}