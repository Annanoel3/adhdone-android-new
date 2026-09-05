import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Cake, PartyPopper } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/**
 * "Happy birthday to YOU" popup. Fires on the day of the user's own birthday
 * (the nameless yearly event Google puts on every calendar), once per year.
 * This is the counterpart to the other-people birthday flow — no text to write,
 * nothing to do, just a moment of being celebrated.
 */
export default function OwnBirthdayPopup({ user, theme }) {
  const [isOpen, setIsOpen] = useState(false);

  const check = useCallback(async () => {
    if (!user?.email) return;
    try {
      const tasks = await base44.entities.Task.filter({ is_own_birthday: true }, "-next_reminder", 20);
      const todays = (tasks || []).find((t) => t.next_reminder && isToday(t.next_reminder));
      if (!todays) return;
      if (localStorage.getItem(`own_birthday_shown_${todayKey()}`) === "1") return;
      localStorage.setItem(`own_birthday_shown_${todayKey()}`, "1");
      setIsOpen(true);
    } catch (e) {
      console.error("[OwnBirthdayPopup] check failed", e);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const timer = setTimeout(check, 4000);
    return () => clearTimeout(timer);
  }, [user?.email, check]);

  const firstName = (user?.full_name || "").trim().split(/\s+/)[0] || "friend";

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`max-w-md text-center ${theme === "dark" ? "bg-gray-900 text-white border-gray-700" : ""}`}>
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-2">
            <Cake className="w-8 h-8 text-pink-600" />
          </div>
          <DialogTitle className="text-2xl">🎉 Happy birthday, {firstName}! 🎂</DialogTitle>
          <DialogDescription>
            Today's yours. No tasks, no shoulds — just take the day in however you want it.
          </DialogDescription>
        </DialogHeader>
        <Button
          onClick={() => setIsOpen(false)}
          className="h-14 text-lg bg-pink-600 hover:bg-pink-700 text-white mt-2"
        >
          <PartyPopper className="w-5 h-5 mr-2" />
          Thank you!
        </Button>
      </DialogContent>
    </Dialog>
  );
}