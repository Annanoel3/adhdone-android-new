import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OPTIONS = [
  { priority: "high", label: "High", interval: "every 2 hours", badgeClass: "bg-red-500 text-white" },
  { priority: "medium", label: "Medium", interval: "every 4 hours", badgeClass: "bg-orange-500 text-white" },
  { priority: "low", label: "Low", interval: "daily", badgeClass: "bg-green-500 text-white" },
];

export default function PriorityPickerDialog({ isOpen, onClose, onSelect }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>How important is this task?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <p className="text-sm text-gray-600">Pick a priority and we'll set smart reminders:</p>
          <div className="grid grid-cols-1 gap-2">
            {OPTIONS.map((opt) => (
              <Button
                key={opt.priority}
                onClick={() => onSelect(opt.priority)}
                variant="outline"
                className="h-auto py-4 flex items-center justify-between px-4"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${opt.badgeClass}`}>
                    {opt.label}
                  </span>
                </div>
                <span className="text-xs text-gray-500">remind {opt.interval}</span>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}