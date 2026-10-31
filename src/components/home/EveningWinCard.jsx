import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trophy, Smile, Loader2 } from "lucide-react";
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
import { MOOD_CHANGED, getDayMood } from "../wins/moodStore";
import DayMoodRow, { cardMoodLook } from "../wins/DayMoodRow";

// The evening check-in on Home (Anna, Oct 30-31 2026): "How did you feel
// today?" (five faces, then optional chips and a note) above "What's one win
// from today?". From 5 PM until their quiet hours start (or the 4 hours
// before quiet hours for people who sleep days — see eveningWindow). It stays
// up until BOTH are answered or they tap "Not today": a win without a mood
// still shows the faces, a mood without a win still shows the win box, and
// while they're picking chips or writing the note it waits for Done. A card,
// not a popup. Both are stamped with the window's dayKey, so an answer at
// 12:30 AM in a 9 PM-1 AM window belongs to the evening before.
export default function EveningWinCard({ user, theme, specialMode }) {
  const [now, setNow] = useState(() => new Date());
  // What's already answered for `day` (from any phone). loaded = both
  // checks came back.
  const [need, setNeed] = useState({ day: null, loaded: false, hasWin: false, mood: null });
  const [recheck, setRecheck] = useState(0);
  const [notTodayDay, setNotTodayDay] = useState(null);
  const [moodEditing, setMoodEditing] = useState(false);
  const [text, setText] = useState(() => readWinDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef(text);
  textRef.current = text;

  // The clock moves on (the card appears at 5 and leaves at quiet hours),
  // and coming back to the app shouldn't wait a minute to catch up. Coming
  // back also looks again, in case the other phone answered meanwhile.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      setRecheck((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // A win saved anywhere (the notification's box, Insights) looks again; a
  // mood saved anywhere comes with its row.
  useEffect(() => {
    const onWin = () => setRecheck((n) => n + 1);
    const onMood = (e) => {
      const d = e?.detail;
      if (!d?.day) return;
      setNeed((prev) => (prev.day === d.day ? { ...prev, mood: d.row || prev.mood } : prev));
    };
    window.addEventListener(WINS_CHANGED, onWin);
    window.addEventListener(MOOD_CHANGED, onMood);
    return () => {
      window.removeEventListener(WINS_CHANGED, onWin);
      window.removeEventListener(MOOD_CHANGED, onMood);
    };
  }, []);

  const { open: inWindow, dayKey } = eveningWindow(user, now);

  useEffect(() => {
    setMoodEditing(false);
  }, [dayKey]);

  useEffect(() => {
    if (!user || !inWindow) return undefined;
    if (isEveningCardDismissed(dayKey)) {
      setNeed({ day: dayKey, loaded: false, hasWin: false, mood: null });
      return undefined;
    }
    let gone = false;
    Promise.all([hasWinToday(dayKey), getDayMood(dayKey)])
      .then(([has, mood]) => {
        if (!gone) setNeed({ day: dayKey, loaded: true, hasWin: !!has, mood: mood || null });
      })
      // Can't tell (no signal): stay out of the way rather than guess. A card
      // already on screen for this day stays as it is.
      .catch(() => {
        if (!gone) {
          setNeed((prev) => (prev.day === dayKey && prev.loaded ? prev : { day: dayKey, loaded: false, hasWin: false, mood: null }));
        }
      });
    return () => { gone = true; };
  }, [user, inWindow, dayKey, recheck]);

  const allDone = need.hasWin && !!need.mood && !moodEditing;
  if (!user || !inWindow || need.day !== dayKey || !need.loaded || notTodayDay === dayKey || allDone) return null;

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
      // addWin announced the change; the recheck hides the win box.
    } catch (e) {
      console.error("[Wins] Could not save the evening win:", e);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const notToday = () => {
    setNotTodayDay(dayKey);
    dismissEveningCard(dayKey);
  };

  const seasonal = specialMode && specialMode !== "normal";
  const dark = theme === "dark";
  const badge = seasonal ? "" : theme === "minimalist" ? "bg-amber-100" : dark ? "bg-amber-900/30" : "bg-yellow-200";
  const badgeIcon = seasonal ? "" : theme === "minimalist" ? "text-amber-600" : dark ? "text-amber-400" : "text-yellow-700";
  const askWin = !need.hasWin;

  const notTodayButton = (
    <button
      type="button"
      onClick={notToday}
      disabled={saving}
      className={`text-sm py-1.5 px-1 hover:underline disabled:opacity-50 ${dark ? "text-gray-400" : "text-gray-500"}`}
    >
      Not today
    </button>
  );

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
        <DayMoodRow
          key={dayKey}
          day={dayKey}
          row={need.mood}
          onSaved={(row) => setNeed((prev) => (prev.day === dayKey ? { ...prev, mood: row } : prev))}
          onEditingChange={setMoodEditing}
          look={cardMoodLook(theme)}
          icon={(
            <div className={`p-2 rounded-xl flex-shrink-0 ${badge}`}>
              <Smile className={`w-4 h-4 ${badgeIcon}`} />
            </div>
          )}
        />

        {askWin ? (
          <>
            <div className={`border-t ${dark ? "border-gray-700" : "border-gray-200"}`} aria-hidden="true" />
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl flex-shrink-0 ${badge}`}>
                <Trophy className={`w-4 h-4 ${badgeIcon}`} />
              </div>
              <div className="min-w-0">
                <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{"What's one win from today?"}</p>
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
                {notTodayButton}
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
          </>
        ) : (
          // The win is saved; only the mood is left. Once a face is saved,
          // Done closes it instead.
          !need.mood && <div>{notTodayButton}</div>
        )}
      </CardContent>
    </Card>
  );
}
