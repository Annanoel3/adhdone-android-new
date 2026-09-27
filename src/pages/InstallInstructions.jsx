import React, { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { enqueueCapture } from "@/lib/pendingCaptures";
import {
  Mic, Pause, Play, Square, ChevronLeft, Trash2, Plus, Check, Loader2, Info, RotateCcw,
} from "lucide-react";

// ── Notes: record a meeting, appointment or class; get ADHD-friendly notes ────
//
// This file used to be the old "install the web app" page, which nothing linked
// to any more. New files can't be added from the code editor, so the Notes page
// lives here; it opens at /Notes (App.jsx) and from Tools → Record Notes.
//
// How it works:
//   1. Record: the phone records (RecorderBridge / RecorderService, app build 36+)
//      with the screen off or the app closed, in ~10 minute parts, until Stop.
//   2. Each part is read off the phone and sent to transcribeAudioNew
//      ("notes_part"), which turns it into text and counts the free minutes.
//   3. transcribeAudioNew ("notes_make") turns the whole transcript into notes
//      laid out the way ADHD research points to: the gist first, to-dos that can
//      go straight into the task list, exact details, short topic headings, no
//      paragraphs. The full transcript stays one tap away.
//   4. The audio is deleted from the phone once it has been transcribed.
//
// Recordings are stored in the EnergyLog table with kind "note_recording" (see
// EnergyLog.jsonc for why). If the app is closed while a recording is being
// processed, it picks up where it left off the next time this page opens.
//
// Ads never show while a recording is going (window.__notesRecording, and a
// check with the phone itself in lib/admob.js).

// Same number as NOTES_FREE_MINUTES in base44/functions/transcribeAudioNew,
// which is the one that's enforced.
const FREE_MINUTES = 60;

const recorder = () => (typeof window !== "undefined" && window.Capacitor?.Plugins?.RecorderBridge) || null;

// Shared by every visit to this page, so leaving and coming back mid-way can
// never send the same recording off twice.
let processingLock = false;
const finishing = new Set();

function monthKey(timeZone) {
  try {
    if (timeZone) {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    }
  } catch (e) { /* unknown zone */ }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function usageFrom(user) {
  const month = monthKey(user?.timezone);
  const used = user?.notes_minutes_month === month ? Math.max(0, Number(user?.notes_seconds_used) || 0) : 0;
  const limit = FREE_MINUTES * 60;
  return { month, used_seconds: used, limit_seconds: limit, left_seconds: Math.max(0, limit - used) };
}

function nextMonthStart() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return n.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function clock(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}:` : ""}${h > 0 ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
}

function clockToMs(at) {
  const bits = String(at || "").split(":").map((x) => parseInt(x, 10));
  if (bits.some((b) => Number.isNaN(b)) || !bits.length) return null;
  return bits.reduce((acc, b) => acc * 60 + b, 0) * 1000;
}

function minutesText(seconds) {
  const m = Math.floor((Number(seconds) || 0) / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// A transcript part comes back as one long run of text; break it into short
// paragraphs so it can actually be read.
function paragraphs(text) {
  const sentences = String(text || "").match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
  const out = [];
  for (let i = 0; i < sentences.length; i += 4) out.push(sentences.slice(i, i + 4).join("").trim());
  return out.filter(Boolean);
}

const STATUS_TEXT = {
  recording: "Recording",
  transcribing: "Making your notes…",
  notes_failed: "Notes not made yet",
  over_limit: "Stopped at this month's free minutes",
  ready: "",
};

export default function NotesPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem("adhd_theme") || "minimalist");
  const dark = theme === "dark";
  const [, setUser] = useState(null);
  const [usage, setUsage] = useState(usageFrom(null));
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState("notes");
  const [title, setTitle] = useState("");
  const [live, setLive] = useState(null); // { sessionId, paused, baseMs, baseAt }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { recordId, step, done, total }
  const [capOpen, setCapOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [, setTick] = useState(0);
  const recordsRef = useRef([]);
  recordsRef.current = records;
  const supported = !!recorder();

  useEffect(() => {
    const t = setInterval(() => setTheme(localStorage.getItem("adhd_theme") || "minimalist"), 500);
    return () => clearInterval(t);
  }, []);

  // Ads check this before showing (AdManager, lib/admob.js).
  useEffect(() => {
    window.__notesRecording = !!live;
  }, [live]);

  const loadRecords = useCallback(async () => {
    try {
      const rows = await base44.entities.EnergyLog.filter({ kind: "note_recording" }, "-started_at", 100);
      recordsRef.current = rows || [];
      setRecords(rows || []);
      return rows || [];
    } catch (e) {
      console.error("[Notes] could not load recordings", e);
      return recordsRef.current;
    } finally {
      setLoaded(true);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      setUsage(usageFrom(me));
      return me;
    } catch (e) {
      return null;
    }
  }, []);

  // ── Turning a finished recording into notes ────────────────────────────────

  const processRecording = useCallback(async (record, session) => {
    const R = recorder();
    if (processingLock || !record) return;
    processingLock = true;
    let overLimit = false;
    try {
      const parts = (session?.parts || [])
        .filter((p) => p && p.ok && p.endMs !== null && p.endMs !== undefined)
        .sort((a, b) => a.index - b.index);
      const have = new Set((record.transcript_parts || []).map((p) => p.index));
      let done = parts.filter((p) => have.has(p.index)).length;
      setProgress({ recordId: record.id, step: "transcribing", done, total: parts.length });

      for (const p of parts) {
        if (have.has(p.index)) continue;
        if (!R) break;
        const { base64 } = await R.readPart({ sessionId: session.id, index: p.index });
        const res = await base44.functions.invoke("transcribeAudioNew", {
          mode: "notes_part",
          record_id: record.id,
          index: p.index,
          start_ms: p.startMs,
          end_ms: p.endMs,
          audio_base64: base64,
        });
        const data = res?.data || {};
        if (data.usage) setUsage(data.usage);
        if (data.over_limit) {
          overLimit = true;
          break;
        }
        if (!data.ok) throw new Error(data.error || "transcription failed");
        done += 1;
        setProgress({ recordId: record.id, step: "transcribing", done, total: parts.length });
      }

      setProgress({ recordId: record.id, step: "notes", done, total: parts.length });
      const made = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_make", record_id: record.id });
      if (!made?.data?.ok) throw new Error(made?.data?.error || "notes failed");

      if (overLimit) {
        // Kept on the phone: the rest can be finished once there are minutes again.
        await base44.entities.EnergyLog.update(record.id, { status: "over_limit" });
        setCapOpen(true);
      } else if (R && session?.id) {
        await R.deleteSession({ sessionId: session.id }).catch(() => {});
      }
      await loadRecords();
      setOpenId(record.id);
      setTab("notes");
    } catch (e) {
      console.error("[Notes] processing stopped", e);
      toast({
        title: "Your notes aren't finished yet",
        description: "Nothing's lost. They'll pick up where they left off the next time you open Notes.",
      });
      await loadRecords();
    } finally {
      processingLock = false;
      setProgress(null);
    }
  }, [loadRecords]);

  // A recording that has stopped (here, from the notification, or cut off) and
  // isn't done yet: make sure it has a row, then finish it.
  const finishSession = useCallback(async (session) => {
    if (!session?.id || finishing.has(session.id)) return;
    finishing.add(session.id);
    try {
      await finishOne(session);
    } finally {
      finishing.delete(session.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finishOne = async (session) => {
    const rows = recordsRef.current;
    let record = rows.find((r) => r.device_session_id === session.id);
    const usable = (session.parts || []).some((p) => p.ok && p.endMs !== null && p.endMs !== undefined);
    if (!usable) {
      // Nothing was captured (the mic never started, or stopped at once).
      if (record) await base44.entities.EnergyLog.delete(record.id).catch(() => {});
      await recorder()?.deleteSession({ sessionId: session.id }).catch(() => {});
      await loadRecords();
      return;
    }
    const fields = {
      status: record?.status === "ready" ? "ready" : "transcribing",
      duration_ms: Number(session.elapsedMs) || 0,
      parts_total: (session.parts || []).length,
    };
    try {
      if (record) {
        await base44.entities.EnergyLog.update(record.id, fields);
        record = { ...record, ...fields };
      } else {
        record = await base44.entities.EnergyLog.create({
          kind: "note_recording",
          title: session.title || "",
          device_session_id: session.id,
          started_at: new Date(session.startedAt || Date.now()).toISOString(),
          ...fields,
        });
      }
    } catch (e) {
      console.error("[Notes] could not save the recording's details", e);
      return;
    }
    if (record.status === "ready") {
      await recorder()?.deleteSession({ sessionId: session.id }).catch(() => {});
      return;
    }
    await processRecording(record, session);
  };

  // Anything on the phone that still needs finishing, oldest first.
  const resumeUnfinished = useCallback(async () => {
    const R = recorder();
    if (!R) return;
    try {
      const { sessions = [] } = await R.listSessions();
      const waiting = sessions
        .filter((s) => s.state === "stopped" || s.state === "interrupted")
        .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      for (const s of waiting) {
        const rec = recordsRef.current.find((r) => r.device_session_id === s.id);
        if (rec?.status === "over_limit" && usageFrom(await refreshUser()).left_seconds <= 0) continue;
        await finishSession(s);
      }
    } catch (e) {
      console.error("[Notes] could not check for unfinished recordings", e);
    }
  }, [finishSession, refreshUser]);

  // ── Start-up ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let handle = null;
    let cancelled = false;
    (async () => {
      await refreshUser();
      await loadRecords();
      const R = recorder();
      if (!R || cancelled) return;
      try {
        const st = await R.status();
        if (st?.recording && st.session) {
          setLive({
            sessionId: st.session.id,
            paused: st.session.state === "paused",
            baseMs: Number(st.session.elapsedMs) || 0,
            baseAt: Date.now(),
          });
        }
      } catch (e) { /* older build */ }
      try {
        handle = await R.addListener("recorder", (e) => {
          const s = e?.session;
          if (e?.type === "paused" || e?.type === "resumed") {
            R.status().then((st) => {
              if (!st?.session) return;
              setLive((cur) => cur && {
                ...cur,
                paused: st.session.state === "paused",
                baseMs: Number(st.session.elapsedMs) || 0,
                baseAt: Date.now(),
              });
            }).catch(() => {});
          } else if (e?.type === "stopped" && s) {
            setLive(null);
            if (e.error === "time_limit") {
              // Stopped at the free minutes (not the 8 hour safety stop).
              refreshUser().then((me) => {
                if (usageFrom(me).left_seconds - Math.round((Number(s.elapsedMs) || 0) / 1000) < 60) setCapOpen(true);
              });
            }
            finishSession(s);
          }
        });
      } catch (e) { /* no events on this build */ }
      await resumeUnfinished();
    })();
    return () => {
      cancelled = true;
      handle?.remove?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The clock on screen, and a check-in with the phone every 15 seconds.
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const sync = setInterval(async () => {
      try {
        const st = await recorder()?.status();
        if (st?.recording && st.session) {
          setLive((cur) => cur && {
            ...cur,
            paused: st.session.state === "paused",
            baseMs: st.session.state === "paused" ? Number(st.session.elapsedMs) || 0 : cur.baseMs,
            baseAt: st.session.state === "paused" ? Date.now() : cur.baseAt,
          });
        }
      } catch (e) { /* keep the local clock */ }
    }, 15000);
    return () => {
      clearInterval(t);
      clearInterval(sync);
    };
  }, [!!live]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = live ? live.baseMs + (live.paused ? 0 : Date.now() - live.baseAt) : 0;

  // ── Controls ───────────────────────────────────────────────────────────────

  const startRecording = async () => {
    const R = recorder();
    if (!R || busy) return;
    const now = usageFrom(await refreshUser());
    if (now.left_seconds < 60) {
      setCapOpen(true);
      return;
    }
    setBusy(true);
    try {
      const res = await R.start({ title: title.trim(), maxMinutes: Math.max(1, Math.floor(now.left_seconds / 60)) });
      if (!res?.ok) {
        toast({
          title: res?.error === "mic_permission_denied" ? "ADHDone needs the microphone to record" : "Recording didn't start",
          description: res?.error === "mic_permission_denied"
            ? "You can allow it in your phone's settings under Apps → ADHDone → Permissions."
            : "Another app may be using the microphone. Try again in a moment.",
        });
        return;
      }
      setLive({ sessionId: res.sessionId, paused: false, baseMs: 0, baseAt: Date.now() });
      if (!res.alreadyRecording) {
        base44.entities.EnergyLog.create({
          kind: "note_recording",
          title: title.trim(),
          status: "recording",
          device_session_id: res.sessionId,
          started_at: new Date().toISOString(),
        }).then(() => loadRecords()).catch(() => {});
      }
      setTitle("");
    } finally {
      setBusy(false);
    }
  };

  const pauseOrResume = async () => {
    const R = recorder();
    if (!R || !live || busy) return;
    setBusy(true);
    try {
      const res = live.paused ? await R.resume() : await R.pause();
      const s = res?.session;
      if (s) setLive((cur) => cur && { ...cur, paused: s.state === "paused", baseMs: Number(s.elapsedMs) || cur.baseMs, baseAt: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async () => {
    const R = recorder();
    if (!R || !live || busy) return;
    setBusy(true);
    try {
      const res = await R.stop();
      setLive(null);
      if (res?.session) await finishSession(res.session);
    } finally {
      setBusy(false);
    }
  };

  const retryNotes = async (record) => {
    const R = recorder();
    try {
      const { sessions = [] } = R ? await R.listSessions() : { sessions: [] };
      const s = sessions.find((x) => x.id === record.device_session_id);
      if (s) {
        await processRecording(record, s);
        return;
      }
      // The audio isn't on this phone any more: notes from what was transcribed.
      setProgress({ recordId: record.id, step: "notes", done: 0, total: 0 });
      const made = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_make", record_id: record.id });
      if (!made?.data?.ok) throw new Error("notes failed");
      await loadRecords();
    } catch (e) {
      toast({ title: "Couldn't make the notes just now", description: "Try again in a minute." });
    } finally {
      setProgress(null);
    }
  };

  const deleteRecording = async (record) => {
    setConfirmDelete(null);
    try {
      await base44.entities.EnergyLog.delete(record.id);
      if (record.device_session_id) await recorder()?.deleteSession({ sessionId: record.device_session_id }).catch(() => {});
      setOpenId(null);
      await loadRecords();
    } catch (e) {
      toast({ title: "Couldn't delete that recording", description: "Try again in a moment." });
    }
  };

  const addTodo = async (record, index) => {
    const notes = record.notes || {};
    const todo = notes.todos?.[index];
    if (!todo || todo.added) return;
    // Same path as anything typed into ADHDone: the parser decides the day, time
    // and reminders.
    enqueueCapture({ text: todo.text });
    const todos = notes.todos.map((t, i) => (i === index ? { ...t, added: true } : t));
    const next = { ...notes, todos };
    setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: next } : r)));
    base44.entities.EnergyLog.update(record.id, { notes: next }).catch(() => {});
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  const card = `rounded-2xl border p-4 ${dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`;
  const heading = dark ? "text-white" : "text-gray-900";
  const soft = dark ? "text-gray-400" : "text-gray-600";
  const open = records.find((r) => r.id === openId) || null;

  const capDialog = (
    <Dialog open={capOpen} onOpenChange={setCapOpen}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] bg-card text-card-foreground border-border">
        <div className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-foreground">You've used this month's free recording time</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            You get {FREE_MINUTES} free minutes a month, and they come back on {nextMonthStart()}. A paid
            version with more recording time is coming.
          </p>
          <Button onClick={() => setCapOpen(false)} className="w-full">Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const deleteDialog = (
    <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] bg-card text-card-foreground border-border">
        <div className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-foreground">Delete this recording?</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Its notes and transcript will be gone for good. Tasks you already added stay in your list.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Keep it</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteRecording(confirmDelete)}>
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const pagePad = { paddingBottom: "max(8rem, calc(8rem + env(safe-area-inset-bottom)))" };

  if (!supported) {
    return (
      <div className="p-4 md:p-8 w-full" style={pagePad}>
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className={`text-3xl font-bold ${heading}`}>Notes</h1>
          <div className={card}>
            <p className={soft}>
              Recording notes works in the ADHDone app on your phone. If you have it, update it to the newest
              version from the Play Store.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── One recording's notes and transcript ──
  if (open) {
    const notes = open.notes || null;
    const parts = (open.transcript_parts || []).slice().sort((a, b) => a.index - b.index);
    const jump = (at) => {
      const ms = clockToMs(at);
      if (ms === null || !parts.length) return;
      let target = parts[0];
      for (const p of parts) if ((p.start_ms || 0) <= ms + 1000) target = p;
      setTab("transcript");
      setTimeout(() => document.getElementById(`notes-part-${target.index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    const At = ({ at }) => (at ? (
      <button type="button" onClick={() => jump(at)} className={`ml-2 text-xs underline ${soft}`}>at {at}</button>
    ) : null);
    const mine = (notes?.todos || []).map((t, i) => ({ ...t, i })).filter((t) => (t.who || "you").toLowerCase() === "you");
    const theirs = (notes?.todos || []).filter((t) => (t.who || "you").toLowerCase() !== "you");
    const working = progress?.recordId === open.id;

    return (
      <div className="p-4 md:p-8 w-full" style={pagePad}>
        {capDialog}
        {deleteDialog}
        <div className="max-w-2xl mx-auto space-y-4">
          <button type="button" onClick={() => setOpenId(null)} className={`flex items-center gap-1 text-sm ${soft}`}>
            <ChevronLeft className="w-4 h-4" /> All recordings
          </button>
          <div>
            <h1 className={`text-2xl font-bold ${heading}`}>{open.title || notes?.title || "Recording"}</h1>
            <p className={`text-sm ${soft}`}>{whenText(open.started_at)}{open.duration_ms ? ` · ${clock(open.duration_ms)}` : ""}</p>
          </div>

          <div className={`flex rounded-xl p-1 ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
            {["notes", "transcript"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === t ? (dark ? "bg-gray-700 text-white" : "bg-white text-gray-900 shadow-sm") : soft}`}
              >
                {t === "notes" ? "Notes" : "Full transcript"}
              </button>
            ))}
          </div>

          {working && (
            <div className={`${card} flex items-center gap-2`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={soft}>
                {progress.step === "notes" ? "Writing your notes…" : `Turning it into text: ${progress.done} of ${progress.total}`}
              </span>
            </div>
          )}

          {open.status === "over_limit" && (
            <div className={card}>
              <p className={soft}>
                This recording went past this month's free minutes, so the notes only cover the first part. The rest
                is saved on your phone and can be finished once your minutes come back on {nextMonthStart()}.
              </p>
            </div>
          )}

          {tab === "notes" && !notes && !working && (
            <div className={card}>
              <p className={`mb-3 ${soft}`}>These notes haven't been made yet.</p>
              <Button onClick={() => retryNotes(open)} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" /> Make my notes
              </Button>
            </div>
          )}

          {tab === "notes" && notes && (
            <div className="space-y-4">
              {notes.gist?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>The gist</h2>
                  <ul className="space-y-1.5">
                    {notes.gist.map((g, i) => <li key={i} className={heading}>• {g}</li>)}
                  </ul>
                </div>
              )}

              {mine.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Your to-dos</h2>
                  <ul className="space-y-2">
                    {mine.map((t) => (
                      <li key={t.i} className="flex items-start gap-2">
                        <div className="flex-1">
                          <span className={heading}>{t.text}</span>
                          <At at={t.at} />
                        </div>
                        <Button
                          size="sm"
                          variant={t.added ? "outline" : "default"}
                          disabled={t.added}
                          onClick={() => addTodo(open, t.i)}
                          className="shrink-0"
                        >
                          {t.added ? <><Check className="w-4 h-4 mr-1" />Added</> : <><Plus className="w-4 h-4 mr-1" />Add to my tasks</>}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {theirs.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>What others will do</h2>
                  <ul className="space-y-1.5">
                    {theirs.map((t, i) => (
                      <li key={i} className={heading}>
                        <span className="font-semibold">{t.who}:</span> {t.text}<At at={t.at} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {notes.details?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Details to keep</h2>
                  <ul className="space-y-1.5">
                    {notes.details.map((d, i) => (
                      <li key={i} className={heading}>
                        {d.label ? <span className="font-semibold">{d.label}: </span> : null}{d.value}<At at={d.at} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(notes.sections || []).map((s, i) => (
                <div key={i} className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>{s.heading}<At at={s.at} /></h2>
                  <ul className="space-y-1.5">
                    {s.points.map((p, j) => <li key={j} className={heading}>• {p}</li>)}
                  </ul>
                </div>
              ))}

              {notes.decisions?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Decided</h2>
                  <ul className="space-y-1.5">
                    {notes.decisions.map((d, i) => <li key={i} className={heading}>• {d.text}<At at={d.at} /></li>)}
                  </ul>
                </div>
              )}

              {notes.questions?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Still open</h2>
                  <ul className="space-y-1.5">
                    {notes.questions.map((d, i) => <li key={i} className={heading}>• {d.text}<At at={d.at} /></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "transcript" && (
            <div className="space-y-4">
              {parts.length === 0 && <div className={card}><p className={soft}>No transcript yet.</p></div>}
              {parts.map((p) => (
                <div key={p.index} id={`notes-part-${p.index}`} className={card}>
                  <p className={`text-xs font-semibold mb-2 ${soft}`}>{clock(p.start_ms)}</p>
                  {paragraphs(p.text).map((para, i) => (
                    <p key={i} className={`mb-3 leading-relaxed ${heading}`}>{para}</p>
                  ))}
                  {!String(p.text || "").trim() && <p className={soft}>No speech picked up in this stretch.</p>}
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={() => setConfirmDelete(open)} className="w-full text-red-600 border-red-300">
            <Trash2 className="w-4 h-4 mr-2" /> Delete recording
          </Button>
        </div>
      </div>
    );
  }

  // ── Recording in progress ──
  if (live) {
    return (
      <div className="p-4 md:p-8 w-full" style={pagePad}>
        {capDialog}
        <div className="max-w-2xl mx-auto space-y-6 text-center pt-6">
          <div className="flex items-center justify-center gap-2">
            <span className={`w-3 h-3 rounded-full ${live.paused ? "bg-gray-400" : "bg-red-500 animate-pulse"}`} />
            <span className={`font-semibold ${heading}`}>{live.paused ? "Paused" : "Recording"}</span>
          </div>
          <div className={`text-6xl font-bold tabular-nums ${heading}`}>{clock(elapsed)}</div>
          <p className={`text-sm ${soft}`}>
            You can lock your phone or use other apps. ADHDone keeps recording until you tap Stop.
          </p>
          <div className="flex gap-3">
            <Button onClick={pauseOrResume} disabled={busy} variant="outline" className="flex-1 h-14 rounded-2xl text-base">
              {live.paused ? <><Play className="w-5 h-5 mr-2" />Resume</> : <><Pause className="w-5 h-5 mr-2" />Pause</>}
            </Button>
            <Button onClick={stopRecording} disabled={busy} className="flex-1 h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
              <Square className="w-5 h-5 mr-2" />Stop
            </Button>
          </div>
          <p className={`text-xs ${soft}`}>
            {minutesText(usage.left_seconds)} of free recording left this month.
          </p>
        </div>
      </div>
    );
  }

  // ── Start screen and past recordings ──
  return (
    <div className="p-4 md:p-8 w-full" style={pagePad}>
      {capDialog}
      {deleteDialog}
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className={`text-3xl font-bold ${heading}`}>Notes</h1>
          <p className={soft}>Record a meeting, appointment or class. ADHDone turns it into short, clear notes.</p>
        </div>

        <div className={`${card} space-y-3`}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it? (optional, like “Dr. Patel, knee”)"
            className={`w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900"}`}
          />
          <Button onClick={startRecording} disabled={busy || !!progress} className="w-full h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
            {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Mic className="w-5 h-5 mr-2" />}
            Record
          </Button>
          <p className={`text-xs ${soft}`}>
            {minutesText(usage.left_seconds)} of {FREE_MINUTES} free minutes left this month.
          </p>
          <p className={`text-xs flex gap-1.5 ${soft}`}>
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            In 12 states, including California and Florida, everyone has to agree before you record them.
          </p>
        </div>

        {progress && !open && (
          <div className={`${card} flex items-center gap-2`}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className={soft}>
              {progress.step === "notes" ? "Writing your notes…" : `Turning your recording into text: ${progress.done} of ${progress.total}`}
            </span>
          </div>
        )}

        {loaded && records.length > 0 && (
          <div className="space-y-2">
            <h2 className={`text-lg font-bold ${heading}`}>Your recordings</h2>
            {records.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setOpenId(r.id); setTab("notes"); }}
                className={`${card} w-full text-left`}
              >
                <div className={`font-semibold ${heading}`}>{r.title || r.notes?.title || "Recording"}</div>
                <div className={`text-sm ${soft}`}>
                  {whenText(r.started_at)}{r.duration_ms ? ` · ${clock(r.duration_ms)}` : ""}
                  {STATUS_TEXT[r.status] ? ` · ${progress?.recordId === r.id ? "Working on it…" : STATUS_TEXT[r.status]}` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
