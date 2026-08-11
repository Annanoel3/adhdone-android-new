import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, Cake, Send, Clock, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { scheduleReminder, cancelScheduledReminder } from "@/components/utils/reminderScheduler";
import { cancelScheduledTextReminders } from "@/components/utils/scheduledTextScheduler";

/**
 * Morning-of "time to send your text" popup. Appears when a scheduled text
 * (📞) or a birthday text (🎂) is due and not yet sent. Send opens the
 * messaging app with the contact + message pre-filled. Snooze reschedules
 * the reminder. Lives in the Layout so it shows on any page.
 */
export default function ScheduledTextSendPopup({ user, theme }) {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [processing, setProcessing] = useState(null);
  const queueRef = useRef([]);
  const dismissedRef = useRef(new Set());
  const isOpenRef = useRef(false);

  const showNext = useCallback(() => {
    const next = queueRef.current.find((i) => !dismissedRef.current.has(i.key));
    if (next) {
      setCurrent(next);
      isOpenRef.current = true;
      setIsOpen(true);
    } else {
      setCurrent(null);
      isOpenRef.current = false;
      setIsOpen(false);
    }
  }, []);

  const check = useCallback(async () => {
    if (!user?.email) return;
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Due scheduled texts: morning-of reminder has fired, not sent, within last 7 days.
      const texts = await base44.entities.ScheduledText.filter({ sent: false }, "send_at", 200);
      const dueTexts = (texts || [])
        .filter((t) => {
          const sendAt = new Date(t.send_at);
          if (sendAt > now) return false;
          if (sendAt < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) return false;
          if (t.snoozed_until && new Date(t.snoozed_until) > now) return false;
          return true;
        })
        .map((t) => ({
          key: `text-${t.id}`,
          kind: "text",
          id: t.id,
          name: t.recipient_name,
          message: t.message,
          phone: t.phone_number || "",
          dateIso: t.send_at,
          raw: t,
        }));

      // Due birthday texts: birthday is today (or just passed) and text not sent.
      const tasks = await base44.entities.Task.filter({ status: "active" }, "-next_reminder", 500);
      const dueBirthdays = (tasks || [])
        .filter((t) => {
          if (!t.birthday_person || !t.birthday_text_message || t.birthday_text_sent) return false;
          if (!t.next_reminder) return false;
          const bd = new Date(t.next_reminder);
          // same local day as today, or already passed today
          return bd <= now && bd >= startOfToday;
        })
        .map((t) => ({
          key: `birthday-${t.id}`,
          kind: "birthday",
          id: t.id,
          name: t.birthday_person,
          message: t.birthday_text_message,
          phone: t.birthday_phone_number || "",
          dateIso: t.next_reminder,
          raw: t,
        }));

      const due = [...dueTexts, ...dueBirthdays];
      const existingKeys = new Set(queueRef.current.map((i) => i.key));
      const newItems = due.filter((i) => !existingKeys.has(i.key) && !dismissedRef.current.has(i.key));
      if (newItems.length > 0) {
        queueRef.current = [...queueRef.current, ...newItems];
        if (!isOpenRef.current) showNext();
      }
    } catch (e) {
      console.error("[ScheduledTextSendPopup] check failed", e);
    }
  }, [user?.email, showNext]);

  useEffect(() => {
    if (!user?.email) return;
    const timer = setTimeout(check, 2000);
    const interval = setInterval(check, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.email, check]);

  const openSms = (item) => {
    const body = encodeURIComponent(item.message);
    const cleanPhone = (item.phone || "").replace(/[^0-9+]/g, "");
    window.location.href = cleanPhone ? `sms:${cleanPhone}?body=${body}` : `sms:?&body=${body}`;
  };

  const handleSend = async () => {
    if (!current) return;
    setProcessing("send");
    try {
      if (current.kind === "text") {
        await cancelScheduledTextReminders(current.raw);
        await base44.entities.ScheduledText.update(current.id, { sent: true });
      } else {
        await base44.entities.Task.update(current.id, { birthday_text_sent: true });
      }
      openSms(current);
      dismissedRef.current.add(current.key);
      queueRef.current = queueRef.current.filter((i) => i.key !== current.key);
      setProcessing(null);
      showNext();
    } catch (e) {
      console.error("[ScheduledTextSendPopup] send failed", e);
      setProcessing(null);
    }
  };

  const handleSnooze = async () => {
    if (!current || !user?.email) return;
    setProcessing("snooze");
    try {
      const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000); // +1 hour
      if (current.kind === "text" && current.raw?.onesignal_notification_ids?.length) {
        await cancelScheduledReminder(current.raw.onesignal_notification_ids).catch(() => {});
      }
      const id = await scheduleReminder({
        email: user.email,
        title: `📞 Time to text ${current.name}`,
        body: current.message,
        sendAtISO: snoozeUntil.toISOString(),
        data: current.kind === "text"
          ? { screen: "/Home", type: "scheduled_text", scheduledTextId: current.id }
          : { screen: "/Home", type: "birthday_reminder", taskId: current.id },
        buttons: [
          { id: "snooze_60", text: "Snooze 1 hour" },
          { id: "send", text: "✉️ Send" },
        ],
      }).catch(() => null);

      if (current.kind === "text") {
        await base44.entities.ScheduledText.update(current.id, {
          snoozed_until: snoozeUntil.toISOString(),
          onesignal_notification_ids: id ? [id] : [],
        });
      }
      dismissedRef.current.add(current.key);
      queueRef.current = queueRef.current.filter((i) => i.key !== current.key);
      setProcessing(null);
      showNext();
    } catch (e) {
      console.error("[ScheduledTextSendPopup] snooze failed", e);
      setProcessing(null);
    }
  };

  const handleDismiss = () => {
    if (!current) return;
    dismissedRef.current.add(current.key);
    queueRef.current = queueRef.current.filter((i) => i.key !== current.key);
    showNext();
  };

  if (!current) return null;

  const isBirthday = current.kind === "birthday";
  const Icon = isBirthday ? Cake : Phone;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !processing) handleDismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isBirthday ? "bg-pink-100" : "bg-blue-100"}`}>
              <Icon className={`w-6 h-6 ${isBirthday ? "text-pink-600" : "text-blue-600"}`} />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {isBirthday ? "🎂 Birthday text time!" : "📞 Text time!"}
              </DialogTitle>
              <DialogDescription>
                Send your message to {current.name}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={`p-4 rounded-xl ${theme === "dark" ? "bg-gray-800" : "bg-blue-50/60"}`}>
          <p className={`text-sm ${theme === "dark" ? "text-gray-200" : "text-gray-700"} whitespace-pre-wrap`}>
            {current.message}
          </p>
        </div>

        <div className="flex gap-3 mt-2">
          <Button
            onClick={handleSend}
            disabled={!!processing}
            className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            {processing === "send" ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
            Send
          </Button>
          <Button
            onClick={handleSnooze}
            disabled={!!processing}
            variant="outline"
            className="flex-1 h-14 text-lg"
          >
            {processing === "snooze" ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Clock className="w-5 h-5 mr-2" />}
            Snooze 1h
          </Button>
        </div>
        <button
          onClick={handleDismiss}
          disabled={!!processing}
          className={`w-full text-sm flex items-center justify-center gap-1 ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
        >
          <X className="w-3 h-3" /> Remind me later
        </button>
      </DialogContent>
    </Dialog>
  );
}