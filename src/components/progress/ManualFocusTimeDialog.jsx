import React, { useState } from "react";
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
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Lets the user manually log focus time for a task — for when they didn't use
// Focus Mode or the session data didn't save. Creates a FocusSessionLog record
// just like a real focus session would.
export default function ManualFocusTimeDialog({ open, onOpenChange, tasks, userEmail, theme, onSaved }) {
  const [taskTitle, setTaskTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTaskTitle("");
    setSelectedTaskId("");
    setMinutes("");
  };

  const handleClose = (o) => {
    if (!o) {
      reset();
      onOpenChange(false);
    }
  };

  const handleSave = async () => {
    const mins = parseInt(minutes, 10);
    if (!mins || mins < 1) return;

    const title =
      selectedTaskId === "__custom__"
        ? taskTitle.trim()
        : tasks.find((t) => t.id === selectedTaskId)?.title || taskTitle.trim();

    if (!title) return;

    setBusy(true);
    try {
      const now = new Date();
      const startedAt = new Date(now.getTime() - mins * 60 * 1000);
      await base44.entities.FocusSessionLog.create({
        task_id: selectedTaskId && selectedTaskId !== "__custom__" ? selectedTaskId : null,
        task_title: title,
        duration_seconds: mins * 60,
        started_at: startedAt.toISOString(),
        completed_at: now.toISOString(),
        user_email: userEmail,
      });
      reset();
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      console.error("Manual focus log failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    theme === "dark"
      ? "bg-gray-800 border-gray-700 text-white"
      : "bg-white border-gray-300 text-gray-900";

  const pickableTasks = (tasks || []).filter(
    (t) => !t.parent_task_id && !t.birthday_person
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-md ${theme === "dark" ? "bg-gray-900 text-white border-gray-700" : "bg-white text-gray-900 border-gray-200"}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-500" /> Add Focus Time
          </DialogTitle>
          <DialogDescription>
            Log time you spent on a task — even if you didn't use Focus Mode or the session didn't
            save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Task</Label>
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm ${inputClass}`}
            >
              <option value="">Pick a task…</option>
              {pickableTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
              <option value="__custom__">Other (type your own)</option>
            </select>
            {selectedTaskId === "__custom__" && (
              <Input
                placeholder="Task name"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className={inputClass}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Minutes spent</Label>
            <Input
              type="number"
              min="1"
              placeholder="e.g. 15"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => handleClose(false)} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={busy || !minutes || parseInt(minutes, 10) < 1 || (selectedTaskId === "__custom__" && !taskTitle.trim()) || (!selectedTaskId && !taskTitle.trim())}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            {busy ? "Saving…" : "Save time"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}