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
import {
  scheduleBirthdayReminders,
  computeNextBirthdayDate,
} from "../utils/birthdayScheduler";
import { cancelScheduledReminder } from "../utils/reminderScheduler";
import SmartReminderEditor from "../tasks/SmartReminderEditor";

export default function BirthdayEditDialog({ birthday, isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pictures, setPictures] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [notifIds, setNotifIds] = useState([]);
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
      setSchedule(birthday.reminder_schedule || []);
      setNotifIds(birthday.onesignal_notification_ids || []);
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
      const reschedule = dateChanged || nameChanged;

      const updates = {
        birthday_person: name.trim(),
        title: `🎂 ${name.trim()}'s Birthday`,
        next_reminder: nextDate.toISOString(),
        notes,
        pictures,
      };

      if (reschedule && notifIds.length) {
        await cancelScheduledReminder(notifIds).catch(() => {});
        updates.onesignal_notification_ids = [];
        updates.reminder_schedule = [];
        setNotifIds([]);
        setSchedule([]);
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

  const handleDeleteBirthday = async () => {
    if (!confirm(`Delete ${birthday.birthday_person}'s birthday?`)) return;
    setSaving(true);
    try {
      if (notifIds.length) {
        await cancelScheduledReminder(notifIds).catch(() => {});
      }
      await base44.entities.Task.delete(birthday.id);
      onSaved?.();
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const handleReminderUpdate = (updated) => {
    setSchedule(updated.reminder_schedule || []);
    setNotifIds(updated.onesignal_notification_ids || []);
    onSaved?.();
  };

  const editorTask = {
    ...birthday,
    reminder_schedule: schedule,
    onesignal_notification_ids: notifIds,
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

          <div className="space-y-2">
            <Label>Notifications</Label>
            {schedule.length === 0 && notifIds.length > 0 && (
              <p className="text-xs text-gray-500 mb-1">
                🔔 {notifIds.length} notification(s) scheduled. Save a new name or date to refresh the list.
              </p>
            )}
            <SmartReminderEditor task={editorTask} onUpdate={handleReminderUpdate} />
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
              onClick={handleDeleteBirthday}
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