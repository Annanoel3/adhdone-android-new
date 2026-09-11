import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

export default function DiaryFirstRunDialog({ open, onChoose }) {
  const [autofill, setAutofill] = useState(true);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    await onChoose(autofill);
    setSaving(false);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Your diary is yours alone</DialogTitle>
          <DialogDescription>
            No AI reads it. No accountability partner can see it. Just you.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="diary-autofill" className="text-sm font-medium">
                Give me a head start
              </Label>
              <p className="text-xs text-gray-600">
                When you open a new entry, we'll list the tasks you finished that day
                and ask how your day went. Your answer becomes the first line.
              </p>
            </div>
            <Switch
              id="diary-autofill"
              checked={autofill}
              onCheckedChange={setAutofill}
            />
          </div>
          <p className="text-xs text-gray-500">
            Turn this off and every entry starts as a blank page. You can change it
            later in the diary.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Lock className="w-3.5 h-3.5" />
          Stored privately to your account only.
        </div>

        <Button onClick={confirm} disabled={saving} className="w-full">
          {saving ? "Setting up..." : "Start writing"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}