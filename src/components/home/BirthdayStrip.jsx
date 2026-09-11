import React from "react";
import { Cake, Send, PenLine, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  getNextBirthdayThisMonth,
  daysUntilBirthday,
} from "../utils/birthdayHelpers";

function whenLabel(days) {
  if (days === 0) return "🎉 Today!";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

// One compact row — never taller than a single line of content. Birthdays stay
// visible on Home without eating the space Today's Focus needs.
export default function BirthdayStrip({ tasks, theme, specialMode, onWriteText, onRefresh }) {
  const navigate = useNavigate();
  const next = getNextBirthdayThisMonth(tasks);
  const seeAll = () => navigate("/Birthdays");

  const dark = theme === "dark";
  const shell = `rounded-xl border px-3 py-2 flex items-center gap-2.5 ${
    specialMode && specialMode !== "normal"
      ? `${specialMode}-card`
      : dark
        ? "bg-gray-800 border-gray-700"
        : "bg-gradient-to-r from-pink-50 to-amber-50 border-pink-200"
  }`;

  if (!next) {
    return (
      <div className={shell}>
        <Cake className="w-4 h-4 text-pink-500 flex-shrink-0" />
        <span className={`flex-1 min-w-0 text-sm truncate ${dark ? "text-gray-300" : "text-gray-600"}`}>
          No birthdays left this month
        </span>
        <button
          onClick={seeAll}
          className="flex-shrink-0 flex items-center gap-0.5 text-sm font-medium text-pink-700 hover:underline py-1.5 px-1"
        >
          See all
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const days = daysUntilBirthday(next.next_reminder);
  const name =
    next.birthday_person || (next.title || "").replace(/^🎂\s*/, "") || "Birthday";
  const hasText = !!next.birthday_text_message;

  const handleSendText = async () => {
    const body = encodeURIComponent(next.birthday_text_message);
    try {
      await base44.entities.Task.update(next.id, { birthday_text_sent: true });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error("Failed to mark birthday text as sent:", e);
    }
    const phone = (next.birthday_phone_number || "").replace(/[^0-9+]/g, "");
    window.location.href = phone ? `sms:${phone}?body=${body}` : `sms:?&body=${body}`;
  };

  return (
    <div className={shell}>
      <Cake className="w-4 h-4 text-pink-500 flex-shrink-0" />
      <button onClick={seeAll} className="flex-1 min-w-0 text-left py-1.5">
        <span className={`text-sm font-semibold truncate block ${dark ? "text-gray-100" : "text-gray-900"}`}>
          {name}
          <span className={`ml-2 font-normal ${dark ? "text-gray-400" : "text-gray-600"}`}>
            {whenLabel(days)}
          </span>
        </span>
      </button>

      {days === 0 && hasText ? (
        <Button
          size="sm"
          onClick={handleSendText}
          className="h-8 px-2.5 flex-shrink-0 bg-pink-600 hover:bg-pink-700 text-white"
        >
          <Send className="w-3.5 h-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      ) : !hasText ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onWriteText && onWriteText(next)}
          className="h-8 px-2.5 flex-shrink-0 border-pink-300 text-pink-700 bg-white/70"
        >
          <PenLine className="w-3.5 h-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Write</span>
        </Button>
      ) : null}

      <button
        onClick={seeAll}
        className="flex-shrink-0 text-sm font-medium text-pink-700 hover:underline py-1.5 px-1"
        aria-label="See all birthdays"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}