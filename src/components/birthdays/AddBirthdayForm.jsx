import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import { scheduleBirthdayReminders, computeNextBirthdayDate } from "../utils/birthdayScheduler";

const REMINDER_ROWS = [
  { key: "week_before", label: "1 week before", hint: "A reminder to prep a gift or message" },
  { key: "day_before", label: "1 day before", hint: "A heads-up the day before" },
  { key: "day_of", label: "Day of", hint: "So you don't miss it" },
];

export default function AddBirthdayForm({ user, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [toggles, setToggles] = useState({ week_before: true, day_before: true, day_of: true });
  const [saving, setSaving] = useState(false);

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
      window.dispatchEvent(new CustomEvent("birthday-created", { detail: { task } }));
      onDone?.();
    } catch (e) {
      console.error("Failed to add birthday", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="space-y-1.5">
        <Label htmlFor="bd-name">Whose birthday?</Label>
        <Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom, Alex, Grandma" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bd-date">Birthday date</Label>
        <Input id="bd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="text-xs text-gray-500">Year doesn't matter. You're reminded every year.</p>
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
        <Button onClick={handleAdd} disabled={!name.trim() || !date || saving} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white">
          {saving ? "Saving…" : "Save birthday"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}