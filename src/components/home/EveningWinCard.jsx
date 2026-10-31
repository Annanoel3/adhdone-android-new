import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trophy, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  WINS_CHANGED,
  addWin,
  eveningWindow,
  hasWinToday,
  isEveningCardDismissed,
  dismissEveningCard,
  readWinDraft,
  saveWinDraft,
  clearWinDraft,
} from "../wins/winsStore";

// "What's one win from today?" on Home in the evening (Anna, Oct 31 2026):
// from 5 PM until their quiet hours start (or the 4 hours before quiet hours
// for people who sleep days — see eveningWindow), only while that day has no
// win yet and they haven't tapped "Not today". A card, not a popup.
export default function EveningWinCard({ user, theme, specialMode }) {
  const [now, setNow] = useState(() => new Date());
  const [need, setNeed] = useState({ day: null, show: false });
  const [recheck, setRecheck] = useState(0);
  const [text, setText] = useState(() => readWinDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef(text);
  textRef.current = text;

  // The clock moves on (the card appears at 5 and leaves at quiet hours),
  // and coming back to the app shouldn't wait a minute to catch up.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // A win saved anywhere (the notification's box, Insights) hides the card.
  useEffect(() => {
    const onChange = () => setRecheck((n) => n + 1);
    window.addEventListener(WINS_CHANGED, onChange);
    return () => window.removeEventListener(WINS_CHANGED, onChange);
  }, []);

  const { open: inWindow, dayKey } = eveningWindow(user, now);

  useEffect(() => {
    if (!user || !inWindow) return undefined;
    if (isEveningCardDismissed(dayKey)) {
      setNeed({ day: dayKey, show: false });
      return undefined;
    }
    let gone = false;
    hasWinToday(dayKey)
      .then((has) => { if (!gone) setNeed({ day: dayKey, show: !has }); })
      // Can't tell (no signal): stay out of the way rather than guess.
      .catch(() => { if (!gone) setNeed({ day: dayKey, show: false }); });
    return () => { gone = true; };
  }, [user, inWindow, dayKey, recheck]);

  if (!user || !inWindow || need.day !== dayKey || !need.show) return null;

  const change = (value) => {
    setText(value);
    saveWinDraft(value);
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    saveWinDraft(text);
    try {
      await addWin(value, "evening_card", dayKey);
      if (textRef.current.trim() === value) {
        clearWinDraft();
        setText("");
      }
      toast({ title: "Saved to your wins 🎉", duration: 2500 });
      // addWin announced the change; the recheck hides the card.
    } catch (e) {
      console.error("[Wins] Could not save the evening win:", e);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const notToday = () => {
    setNeed({ day: dayKey, show: false });
    dismissEveningCard(dayKey);
  };

  const seasonal = specialMode && specialMode !== "normal";
  const dark = theme === "dark";

  return (
    <Card className={`${seasonal ? `${specialMode}-card` : ""} border-none shadow-md ${
      !seasonal ? (
        theme === "minimalist"
          ? "bg-white/80 backdrop-blur-sm"
          : dark
            ? "bg-gray-800 border border-gray-700"
            : "bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-yellow-200"
      ) : ""
    }`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl flex-shrink-0 ${
            seasonal ? "" : theme === "minimalist" ? "bg-amber-100" : dark ? "bg-amber-900/30" : "bg-yellow-200"
          }`}>
            <Trophy className={`w-4 h-4 ${
              seasonal ? "" : theme === "minimalist" ? "text-amber-600" : dark ? "text-amber-400" : "text-yellow-700"
            }`} />
          </div>
          <div className="min-w-0">
            <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>What's one win from today?</p>
            <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-600"}`}>Big or small, it counts.</p>
          </div>
        </div>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Textarea
            value={text}
            onChange={(e) => change(e.target.value)}
            placeholder="Finally called the dentist"
            aria-label="Your win"
            className={`min-h-[64px] ${
              dark
                ? "bg-gray-900 border-gray-700 text-gray-100 placeholder:text-gray-500"
                : "bg-white/90 border-gray-200 text-gray-900 placeholder:text-gray-400"
            }`}
          />
          {error && (
            <p role="alert" className={`text-sm ${dark ? "text-rose-300" : "text-rose-600"}`}>{error}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={notToday}
              disabled={saving}
              className={`text-sm py-1.5 px-1 hover:underline disabled:opacity-50 ${dark ? "text-gray-400" : "text-gray-500"}`}
            >
              Not today
            </button>
            <Button
              type="submit"
              size="sm"
              disabled={!text.trim() || saving}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving…</>) : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
