import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DatePickerDialog({ isOpen, onClose, onSelect, onAnyDay, taskTitle, initialDate }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const defaultTime = '09:00';
      let baseDate;

      if (initialDate) {
        baseDate = new Date(initialDate + 'T00:00:00');
      } else {
        baseDate = new Date(now);
        baseDate.setDate(baseDate.getDate() + 1); // tomorrow
      }

      // If 9:00 AM on the default date has already passed, roll forward to tomorrow
      const [dh, dm] = defaultTime.split(':').map(n => parseInt(n, 10));
      const testDateTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), dh, dm, 0, 0);
      if (testDateTime <= now) {
        baseDate = new Date(now);
        baseDate.setDate(baseDate.getDate() + 1);
      }

      const td = `${baseDate.getFullYear()}-${String(baseDate.getMonth()+1).padStart(2,'0')}-${String(baseDate.getDate()).padStart(2,'0')}`;
      setDate(td);
      setTime(defaultTime);
    }
  }, [isOpen, initialDate]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Is this for a specific date?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {taskTitle && (
            <p className="text-sm text-gray-600 font-medium">{taskTitle}</p>
          )}
          <div>
            <label className="text-sm font-medium block mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white text-gray-900"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-2">
              Time <span className="text-gray-400 font-normal">(editable)</span>
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white text-gray-900"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => onSelect(date, time)} disabled={!date || !time} className="flex-1">
              Set Reminder
            </Button>
            <Button onClick={onAnyDay} variant="outline" className="flex-1">
              Any day
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}