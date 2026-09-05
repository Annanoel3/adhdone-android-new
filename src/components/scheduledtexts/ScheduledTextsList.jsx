import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, Cake, Send, Trash2, Plus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ScheduledTextDialog from "./ScheduledTextDialog";
import BirthdayTextDialog from "../birthdays/BirthdayTextDialog";
import { cancelScheduledTextReminders } from "../utils/scheduledTextScheduler";
import { openSmsApp } from "../utils/openSmsApp";

function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}
function formatWhen(iso) {
  const d = daysUntil(iso);
  if (d < 0) return "Past due";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 14) return `In ${d} day${d === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/**
 * Unified list of upcoming scheduled texts (📞) and birthdays (🎂).
 * Birthdays without a drafted text show a "Write your text" prompt.
 * Birthdays come from the Task entity; general texts from ScheduledText.
 */
export default function ScheduledTextsList({ tasks, user, theme, specialMode, onRefresh }) {
  const [scheduledTexts, setScheduledTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingText, setEditingText] = useState(null);
  const [birthdayTextTask, setBirthdayTextTask] = useState(null);

  const loadScheduledTexts = useCallback(async () => {
    try {
      const list = await base44.entities.ScheduledText.list("-send_at", 200);
      setScheduledTexts(list || []);
    } catch (e) {
      console.error("[ScheduledTextsList] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScheduledTexts();
    const handler = () => loadScheduledTexts();
    window.addEventListener("scheduled-texts-changed", handler);
    return () => window.removeEventListener("scheduled-texts-changed", handler);
  }, [loadScheduledTexts]);

  const birthdays = useMemo(
    () =>
      (tasks || [])
        // The user's own birthday is a celebration, not someone to text.
        .filter((t) => !t.is_own_birthday && (t.birthday_person || t.classification === "birthday") && t.status === "active" && t.next_reminder)
        .sort((a, b) => new Date(a.next_reminder) - new Date(b.next_reminder)),
    [tasks]
  );

  // Merge into a unified shape, sorted by date.
  const items = useMemo(() => {
    const merged = [];

    for (const b of birthdays) {
      merged.push({
        kind: "birthday",
        id: b.id,
        name: b.birthday_person || (b.title || "").replace(/^🎂\s*/, "") || "Birthday",
        dateIso: b.next_reminder,
        message: b.birthday_text_message || "",
        phone: b.birthday_phone_number || "",
        sent: !!b.birthday_text_sent,
        raw: b,
      });
    }

    for (const t of scheduledTexts) {
      if (t.sent) continue; // sent texts drop off the list
      merged.push({
        kind: "text",
        id: t.id,
        name: t.recipient_name,
        dateIso: t.send_at,
        sendTime: t.send_time || "",
        message: t.message,
        phone: t.phone_number || "",
        sent: false,
        raw: t,
      });
    }

    return merged.sort((a, b) => new Date(a.dateIso) - new Date(b.dateIso));
  }, [birthdays, scheduledTexts]);

  const handleSend = async (item) => {
    if (item.kind === "birthday") {
      try {
        await base44.entities.Task.update(item.id, { birthday_text_sent: true });
      } catch (e) { /* ignore */ }
    } else {
      try {
        await cancelScheduledTextReminders(item.raw);
        await base44.entities.ScheduledText.update(item.id, { sent: true });
      } catch (e) { /* ignore */ }
    }
    openSmsApp(item.phone, item.message);
    onRefresh?.();
    loadScheduledTexts();
  };

  const handleDeleteText = async (item) => {
    if (item.kind === "text") {
      await cancelScheduledTextReminders(item.raw);
      await base44.entities.ScheduledText.delete(item.id).catch(() => {});
      loadScheduledTexts();
    }
  };

  const handleSaved = () => {
    setEditingText(null);
    setShowCreate(false);
    loadScheduledTexts();
    onRefresh?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Phone className="w-4 h-4 text-blue-600" /> Scheduled Texts
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreate(true)}
          className="rounded-lg"
        >
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      ) : items.length === 0 ? (
        <Card className={`p-5 text-center ${specialMode && specialMode !== "normal" ? `${specialMode}-card` : ""}`}>
          <Phone className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">
            No scheduled texts yet. Tap "New" to schedule one — we'll remind you to send it.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isBirthday = item.kind === "birthday";
            const hasMessage = !!item.message;
            const Icon = isBirthday ? Cake : Phone;
            const iconBg = isBirthday ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600";
            return (
              <Card
                key={`${item.kind}-${item.id}`}
                className={`p-3 flex items-center gap-3 ${specialMode && specialMode !== "normal" ? `${specialMode}-card` : ""}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => {
                    if (isBirthday) setBirthdayTextTask(item.raw);
                    else setEditingText(item.raw);
                  }}
                >
                  <p className="font-semibold text-gray-900 truncate">
                    {isBirthday ? "🎂 " : "📞 "}{item.name}
                  </p>
                  {hasMessage ? (
                    <p className="text-xs text-gray-500 truncate">{item.message}</p>
                  ) : (
                    <p className="text-xs text-pink-600 font-medium">Tap to write your text →</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.sendTime
                      ? new Date(item.dateIso).toLocaleString(undefined, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : new Date(item.dateIso).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                    {" · "}{formatWhen(item.dateIso)}
                    {item.sent && " · Sent ✓"}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {hasMessage && !item.sent && daysUntil(item.dateIso) <= 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleSend(item)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" /> Send
                    </Button>
                  )}
                  {!isBirthday && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDeleteText(item)}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ScheduledTextDialog
        isOpen={showCreate || !!editingText}
        onClose={() => { setShowCreate(false); setEditingText(null); }}
        onSaved={handleSaved}
        user={user}
        editScheduledText={editingText}
      />

      <BirthdayTextDialog
        isOpen={!!birthdayTextTask}
        onClose={() => setBirthdayTextTask(null)}
        birthdayTask={birthdayTextTask}
        onSaved={() => { setBirthdayTextTask(null); onRefresh?.(); }}
      />
    </div>
  );
}