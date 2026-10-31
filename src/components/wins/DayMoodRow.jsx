import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { MOODS, MOOD_REASONS, NOTE_MAX, moodInfo, saveDayMood } from "./moodStore";

// "How did you feel today?" with five faces (Anna, Oct 31 2026), on the
// evening card and at the top of the box the evening notification opens. It
// asks how they FELT, not how the day went: "how was today" gets answered
// with how much got done, and then mood next to what got done means nothing.
//
// A face saves right away. Then "Anything going on?" chips and a short note,
// both optional, update the same row. Already answered: the face shows small
// with Change. Nothing is lost on a failed save: the choice stays on screen
// with the error, and Try again (or another tap) sends the whole answer again.
//
// Modes: "ask" (nothing saved yet), "detail" (just picked or Change: chips,
// note, Done), "small" (saved). onEditingChange tells the evening card the
// person is in the middle of it, so the card doesn't vanish under them.

// Classes for the card on Home (inside the app shell, where the night
// seasons' glass turns pale surfaces dark by itself). Popups use winLook.
export function cardMoodLook(theme) {
  const dark = theme === "dark";
  return {
    title: dark ? "text-white" : "text-gray-900",
    muted: dark ? "text-gray-400" : "text-gray-600",
    chip: dark ? "bg-gray-900 border-gray-700 text-gray-200" : "bg-white/90 border-gray-200 text-gray-700",
    chipOn: "bg-purple-600 border-purple-600 text-white",
    faceOn: dark ? "bg-purple-900/40 ring-2 ring-purple-400" : "bg-purple-100 ring-2 ring-purple-500",
    field: dark
      ? "bg-gray-900 border-gray-700 text-gray-100 placeholder:text-gray-500"
      : "bg-white/90 border-gray-200 text-gray-900 placeholder:text-gray-400",
    error: dark ? "text-rose-300" : "text-rose-600",
    accent: dark ? "text-purple-300" : "text-purple-700",
  };
}

const SAVE_ERROR = "Couldn't save. Check your connection and try again.";

export default function DayMoodRow({ day, row = null, onSaved, onEditingChange, look = {}, showQuestion = true, icon = null }) {
  const [saved, setSaved] = useState(row);
  const [mode, setMode] = useState(row ? "small" : "ask");
  const [chosen, setChosen] = useState(row?.mood ?? null);
  const [reasons, setReasons] = useState(Array.isArray(row?.reasons) ? row.reasons : []);
  const [note, setNote] = useState(row?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(0);
  const lastNote = useRef(row?.note || "");
  // The answer as it stands, for saves started from callbacks.
  const current = useRef({ chosen, reasons, note });
  current.current = { chosen, reasons, note };

  // Someone else's answer arrived (the card's first look, another phone, the
  // other surface): show it, unless they're in the middle of changing it here.
  useEffect(() => {
    if (pending.current > 0) return;
    setSaved(row);
    if (mode === "detail") return;
    setChosen(row?.mood ?? null);
    setReasons(Array.isArray(row?.reasons) ? row.reasons : []);
    setNote(row?.note || "");
    lastNote.current = row?.note || "";
    setMode(row ? "small" : "ask");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  useEffect(() => {
    onEditingChange?.(mode === "detail");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const save = async (fields) => {
    pending.current += 1;
    setSaving(true);
    setError("");
    try {
      const next = await saveDayMood(day, fields);
      lastNote.current = next?.note ?? fields.note ?? lastNote.current;
      setSaved(next);
      onSaved?.(next);
      return next;
    } catch (e) {
      console.error("[Mood] Could not save:", e);
      setError(SAVE_ERROR);
      return null;
    } finally {
      pending.current -= 1;
      if (pending.current === 0) setSaving(false);
    }
  };

  const whole = (patch = {}) => {
    const now = { ...current.current, ...patch };
    return { mood: now.chosen, reasons: now.reasons, note: now.note };
  };

  const pickFace = (value) => {
    if (mode !== "detail") {
      setReasons(Array.isArray(saved?.reasons) ? saved.reasons : []);
      setNote(saved?.note || "");
      current.current = { chosen: value, reasons: Array.isArray(saved?.reasons) ? saved.reasons : [], note: saved?.note || "" };
      setMode("detail");
    }
    setChosen(value);
    save(whole({ chosen: value }));
  };

  const toggleReason = (key) => {
    const list = current.current.reasons;
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    setReasons(next);
    if (current.current.chosen != null) save(whole({ reasons: next }));
  };

  const noteChanged = note.trim() !== String(lastNote.current || "").trim();

  const saveNote = () => {
    if (current.current.chosen == null || !noteChanged) return null;
    return save(whole());
  };

  const retry = () => {
    if (current.current.chosen != null) save(whole());
  };

  const done = async () => {
    if (noteChanged) {
      const ok = await save(whole());
      if (!ok) return;
    }
    setMode("small");
  };

  const change = () => {
    setChosen(saved?.mood ?? null);
    setReasons(Array.isArray(saved?.reasons) ? saved.reasons : []);
    setNote(saved?.note || "");
    setError("");
    setMode("detail");
  };

  const errorLine = error ? (
    <p role="alert" className={`text-sm ${look.error || ""}`}>
      {error}{" "}
      <button type="button" onClick={retry} className="font-medium underline underline-offset-2">
        Try again
      </button>
    </p>
  ) : null;

  if (mode === "small" && saved && moodInfo(saved.mood)) {
    const info = moodInfo(saved.mood);
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className={look.muted || ""}>How you felt today:</span>
          <span className="text-lg leading-none" aria-hidden="true">{info.face}</span>
          <span className={`font-medium ${look.title || ""}`}>{info.label}</span>
          <button
            type="button"
            onClick={change}
            className={`ml-auto text-sm font-medium py-1 px-1 hover:underline ${look.accent || ""}`}
          >
            Change
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  const answered = !!saved && chosen != null;

  return (
    <div className="space-y-3">
      {showQuestion && (
        <div className="flex items-center gap-3">
          {icon}
          <p className={`font-semibold ${look.title || ""}`}>How did you feel today?</p>
        </div>
      )}

      <div role="group" aria-label="How did you feel today?" className="grid grid-cols-5 gap-1.5">
        {MOODS.map((m) => {
          const on = chosen === m.value;
          return (
            <button
              key={m.value}
              type="button"
              aria-pressed={on}
              onClick={() => pickFace(m.value)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 min-h-[60px] transition-all active:scale-95 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                on ? look.faceOn || "" : "hover:bg-black/5"
              } ${chosen != null && !on ? "opacity-60" : ""}`}
            >
              <span className="text-2xl leading-none" aria-hidden="true">{m.face}</span>
              <span className={`text-[11px] font-medium leading-none ${on ? look.title || "" : look.muted || ""}`}>{m.label}</span>
            </button>
          );
        })}
      </div>

      {mode === "detail" && !answered && saving && (
        <p className={`text-sm flex items-center gap-2 ${look.muted || ""}`}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving…
        </p>
      )}

      {mode === "detail" && answered && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-medium ${look.title || ""}`}>Anything going on?</p>
            <button
              type="button"
              onClick={done}
              className={`text-sm font-medium py-1 px-1 hover:underline ${look.accent || ""}`}
            >
              Done
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MOOD_REASONS.map((r) => {
              const on = reasons.includes(r.key);
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleReason(r.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? look.chipOn || "" : look.chip || ""}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); saveNote(); }}
          >
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              onBlur={() => { saveNote(); }}
              maxLength={NOTE_MAX}
              placeholder="Add a short note (optional)"
              aria-label="A short note about today"
              className={`h-9 flex-1 min-w-0 ${look.field || ""}`}
            />
            {noteChanged && (
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white"
              >
                Save
              </Button>
            )}
          </form>
        </div>
      )}

      {errorLine}
    </div>
  );
}
