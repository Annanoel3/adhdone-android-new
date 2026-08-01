import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Cake, Trash2, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  scheduleBirthdayReminders,
  computeNextBirthdayDate,
} from "../utils/birthdayScheduler";
import { cancelScheduledReminder } from "../utils/reminderScheduler";

const REMINDER_ROWS = [
  { key: "week_before", label: "1 week before", hint: "A nudge to prep a gift or message" },
  { key: "day_before", label: "1 day before", hint: "A heads-up the day prior" },
  { key: "day_of", label: "Day of", hint: "So you don't miss it" },
];

export default function BirthdayEditDialog({ birthday, isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pictures, setPictures] = useState([]);
  const [toggles, setToggles] = useState({ week_before: true, day_before: true, day_of: true });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (birthday) {
      setName(birthday.birthday_person || "");
      const d = new Date(birthday.next_reminder);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
      setNotes(birthday.notes || "");
      setPictures(birthday.pictures || []);
      setToggles({
        week_before: birthday.birthday_remind_week_before !== false,
        day_before: birthday.birthday_remind_day_before !== false,
        day_of: birthday.birthday_remind_day_of !== false,
      });
    }
  }, [birthday]);

  if (!birthday) return null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPictures((prev) => [...prev, file_url]);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      const [, m, d] = date.split("-").map(Number);
      const nextDate = computeNextBirthdayDate(m, d);

      const oldD = new Date(birthday.next_reminder);
      const dateChanged = oldD.getMonth() + 1 !== m || oldD.getDate() !== d;
      const nameChanged = name.trim() !== birthday.birthday_person;
      const togglesChanged =
        (birthday.birthday_remind_week_before !== false) !== toggles.week_before ||
        (birthday.birthday_remind_day_before !== false) !== toggles.day_before ||
        (birthday.birthday_remind_day_of !== false) !== toggles.day_of;
      const reschedule = dateChanged || nameChanged || togglesChanged;

      const updates = {
        birthday_person: name.trim(),
        title: `🎂 ${name.trim()}'s Birthday`,
        next_reminder: nextDate.toISOString(),
        notes,
        pictures,
        birthday_remind_week_before: toggles.week_before,
        birthday_remind_day_before: toggles.day_before,
        birthday_remind_day_of: toggles.day_of,
      };

      if (reschedule && birthday.onesignal_notification_ids?.length) {
        await cancelScheduledReminder(birthday.onesignal_notification_ids).catch(() => {});
        updates.onesignal_notification_ids = [];
      }

      await base44.entities.Task.update(birthday.id, updates);

      if (reschedule) {
        await scheduleBirthdayReminders({ ...birthday, ...updates });
      }

      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error("Failed to save birthday", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${birthday.birthday_person}'s birthday?`)) return;
    setSaving(true);
    try {
      if (birthday.onesignal_notification_ids?.length) {
        await cancelScheduledReminder(birthday.onesignal_notification_ids).catch(() => {});
      }
      await base44.entities.Task.delete(birthday.id);
      onSaved?.();
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cake className="w-5 h-5 text-pink-600" /> Edit Birthday
          </DialogTitle>
          <DialogDescription>
            Update the details and we'll keep the yearly reminders going.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jasmine" />
          </div>

          <div className="space-y-1.5">
            <Label>Birthday date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Gift ideas, things they love…"
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Pictures</Label>
            {pictures.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {pictures.map((pic, i) => (
                  <div key={i} className="relative rounded-lg overflow-hidden border">
                    <img src={pic} alt="" className="w-full h-24 object-cover" />
                    <button
                      onClick={() => setPictures((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer"
            >
              <Upload className="w-4 h-4 mr-1" /> {uploading ? "Uploading…" : "Add picture"}
            </Button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={!name.trim() || !date || saving}
              className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}