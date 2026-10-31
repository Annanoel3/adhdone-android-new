import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import VoiceTaskInput from "@/components/tasks/VoiceTaskInput";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { addWin, readWinDraft, saveWinDraft, clearWinDraft, eveningWindow } from "./winsStore";
import { winLook } from "./winsTheme";
import { getDayMood } from "./moodStore";
import DayMoodRow from "./DayMoodRow";

// The "What's one win from today?" box. Whatever they type is kept on the
// phone (the draft) until it has actually saved: closing the box, a stray
// back press, or a save that fails never loses it, and the next time the box
// opens it's still there. A save keeps going if the box is closed mid-save,
// and still says when it landed (or didn't).
//
// withMood (the evening notification's box only): "How did you feel today?"
// with the same faces, chips and note as the evening card, above the win, for
// moodDay (the evening card's day key).
export default function WinBox({ open, onClose, source = "other", winDate, theme, specialMode, onSaved, withMood = false, moodDay }) {
  const look = winLook(theme, specialMode);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [moodRow, setMoodRow] = useState(null);
  const textRef = useRef(text);
  textRef.current = text;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open) return;
    setText(readWinDraft());
    setError("");
  }, [open]);

  // Already answered today (here or on another phone): the face shows small
  // with Change. Until this comes back (or if it can't), the faces show, and
  // a tap still updates the day's row rather than adding a second one.
  useEffect(() => {
    if (!open || !withMood || !moodDay) return undefined;
    let gone = false;
    setMoodRow(null);
    getDayMood(moodDay)
      .then((row) => { if (!gone) setMoodRow(row || null); })
      .catch((e) => console.error("[Mood] Could not load today's mood:", e));
    return () => { gone = true; };
  }, [open, withMood, moodDay]);

  const change = (value) => {
    setText(value);
    saveWinDraft(value);
  };

  // Spoken words land at the end of what's already written.
  const addSpoken = (spoken) => {
    const said = String(spoken || "").trim();
    if (!said) return;
    const before = textRef.current.replace(/\s*$/, "");
    change(before ? `${before} ${said}` : said);
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    saveWinDraft(text);
    try {
      const win = await addWin(value, source, winDate);
      // Typed more while it saved (closed and reopened mid-save)? Keep that.
      const untouched = textRef.current.trim() === value;
      if (untouched) {
        clearWinDraft();
        setText("");
      }
      setSaving(false);
      toast({ title: "Saved to your wins 🎉", duration: 2500 });
      onSaved?.(win);
      if (openRef.current && untouched) onClose?.("saved");
    } catch (e) {
      console.error("[Wins] Could not save a win:", e);
      setSaving(false);
      if (openRef.current) {
        setError("Couldn't save. Check your connection and try again.");
      } else {
        toast({ title: "Couldn't save your win", description: "It's still in the box for next time.", duration: 5000 });
      }
    }
  };

  const errorText = look.night || theme === "dark" ? "text-rose-300" : "text-rose-600";
  const askMood = withMood && !!moodDay;

  return (
    <Dialog open={!!open} onOpenChange={(o) => { if (!o) onClose?.("dismissed"); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${askMood ? "max-h-[90vh] overflow-y-auto" : ""} ${look.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle>{askMood ? "How did you feel today?" : "What's one win from today?"}</DialogTitle>
          <DialogDescription className={askMood ? "sr-only" : look.muted}>
            {askMood ? "Check in on today and save one win." : "Big or small, it counts."}
          </DialogDescription>
        </DialogHeader>
        {askMood && (
          <>
            <DayMoodRow
              key={moodDay}
              day={moodDay}
              row={moodRow}
              onSaved={setMoodRow}
              look={look}
              showQuestion={false}
            />
            <div className={`border-t ${look.night ? "border-white/15" : theme === "dark" ? "border-gray-700" : "border-gray-200"}`} aria-hidden="true" />
            <div>
              <p className="font-semibold">{"What's one win from today?"}</p>
              <p className={`text-sm ${look.muted}`}>Big or small, it counts.</p>
            </div>
          </>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <div className="flex items-start gap-2">
            <Textarea
              value={text}
              onChange={(e) => change(e.target.value)}
              placeholder="Finally called the dentist"
              aria-label="Your win"
              className={`min-h-[88px] flex-1 ${look.field}`}
            />
            <span className={look.mic}>
              <VoiceTaskInput onTranscription={addSpoken} theme={theme} />
            </span>
          </div>
          {error && <p role="alert" className={`text-sm ${errorText}`}>{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onClose?.("not_today")}
              className={`flex-1 ${look.subtle}`}
            >
              Not today
            </Button>
            <Button
              type="submit"
              disabled={!text.trim() || saving}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving…</>) : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The evening "one win from today" notification opens the app on
// /Home?win=1 (OneSignalInit, type 'win_ask'). Mounted once in the Layout:
// the box takes its turn like any popup answering a tap (reactive), and once
// it's up win=1 comes out of the address so a refresh doesn't reopen it.
export function WinAskFromLink({ theme, specialMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [wanted, setWanted] = useState(false);
  const [me, setMe] = useState(null);
  const asked = new URLSearchParams(location.search).get("win") === "1";

  useEffect(() => {
    if (asked) setWanted(true);
  }, [asked, location.key]);

  // Their quiet hours decide which evening it is (eveningWindow): read only
  // when the box is wanted. Not loaded (yet, or at all): the defaults.
  useEffect(() => {
    if (!wanted || me) return undefined;
    let gone = false;
    base44.auth.me().then((u) => { if (!gone && u) setMe(u); }).catch(() => {});
    return () => { gone = true; };
  }, [wanted, me]);

  const shown = usePopupTurn(wanted, { reactive: true });

  // The same day key the evening card uses, for the mood and the win alike,
  // so an answer at 12:30 AM in a 9 PM-1 AM evening is the evening before's.
  const day = useMemo(() => eveningWindow(me, new Date()).dayKey, [me, shown]);

  // win=1 comes off the address when the box closes, not while it's up: a
  // navigation while it's open could remount the page around it and close it
  // in the same instant it appeared.
  const close = () => {
    setWanted(false);
    const params = new URLSearchParams(location.search);
    if (params.get("win") !== "1") return;
    params.delete("win");
    const rest = params.toString();
    navigate(`${location.pathname}${rest ? `?${rest}` : ""}`, { replace: true, state: location.state });
  };

  return (
    <WinBox
      open={shown}
      onClose={close}
      source="evening_push"
      winDate={day}
      withMood
      moodDay={day}
      theme={theme}
      specialMode={specialMode}
    />
  );
}
