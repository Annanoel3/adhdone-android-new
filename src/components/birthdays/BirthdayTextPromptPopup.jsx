import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Cake, PenLine, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import BirthdayTextDialog from "./BirthdayTextDialog";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

/**
 * In-app popup: "you haven't written Grandma's text yet."
 * Fires when a birthday is coming up within 7 days and has no drafted message.
 * Catches birthdays added by Google Calendar sync too (those never get the
 * "just added" prompt). Asks at most once per birthday per day. Lives in the
 * Layout so it appears on any page.
 */
export default function BirthdayTextPromptPopup({ user, theme }) {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [showWriter, setShowWriter] = useState(false);
  const dismissedRef = useRef(new Set());
  const isOpenRef = useRef(false);

  const check = useCallback(async () => {
    if (!user?.email) return;
    if (isOpenRef.current) return;
    try {
      const tasks = await base44.entities.Task.filter({ status: "active" }, "-next_reminder", 500);
      const candidate = (tasks || [])
        .filter((t) => {
          if (t.is_own_birthday) return false;
          if (!t.birthday_person || !t.next_reminder) return false;
          if (t.birthday_text_message) return false;
          if (t.silenced) return false;
          const days = daysUntil(t.next_reminder);
          if (days < 0 || days > 7) return false;
          if (dismissedRef.current.has(t.id)) return false;
          if (localStorage.getItem(`bd_text_prompt_${t.id}_${todayKey()}`) === "1") return false;
          return true;
        })
        .sort((a, b) => new Date(a.next_reminder) - new Date(b.next_reminder))[0];

      if (candidate) {
        setCurrent(candidate);
        isOpenRef.current = true;
        setIsOpen(true);
      }
    } catch (e) {
      console.error("[BirthdayTextPromptPopup] check failed", e);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const timer = setTimeout(check, 6000);
    const interval = setInterval(check, 10 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.email, check]);

  const dismiss = () => {
    if (current) {
      dismissedRef.current.add(current.id);
      localStorage.setItem(`bd_text_prompt_${current.id}_${todayKey()}`, "1");
    }
    isOpenRef.current = false;
    setIsOpen(false);
    setCurrent(null);
  };

  const handleWrite = () => {
    if (current) {
      dismissedRef.current.add(current.id);
      localStorage.setItem(`bd_text_prompt_${current.id}_${todayKey()}`, "1");
    }
    setIsOpen(false);
    setShowWriter(true);
  };

  const closeWriter = () => {
    setShowWriter(false);
    isOpenRef.current = false;
    setCurrent(null);
  };

  if (!current && !showWriter) return null;

  const name = current?.birthday_person || "them";
  const days = current?.next_reminder ? daysUntil(current.next_reminder) : 0;
  const whenText =
    days <= 0 ? "is today" : days === 1 ? "is tomorrow" : `is in ${days} days`;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) dismiss(); }}>
        <DialogContent className={`max-w-md ${theme === "dark" ? "bg-gray-900 text-white border-gray-700" : ""}`}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                <Cake className="w-6 h-6 text-pink-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {name}'s birthday {whenText}
                </DialogTitle>
                <DialogDescription>
                  You haven't written their text yet. Want to knock it out now so it's ready?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex gap-3 mt-2">
            <Button
              onClick={handleWrite}
              className="flex-1 h-14 text-lg bg-pink-600 hover:bg-pink-700 text-white"
            >
              <PenLine className="w-5 h-5 mr-2" />
              Write it now
            </Button>
            <Button onClick={dismiss} variant="outline" className="flex-1 h-14 text-lg">
              <Clock className="w-5 h-5 mr-2" />
              Not now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BirthdayTextDialog
        isOpen={showWriter}
        onClose={closeWriter}
        birthdayTask={current}
        onSaved={() => window.dispatchEvent(new CustomEvent("tasks-changed"))}
      />
    </>
  );
}