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
      if (initialDate) {
        setDate(initialDate);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const td = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
        setDate(td);
      }
      setTime('09:00');
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