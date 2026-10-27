import React, { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { enqueueCapture } from "@/lib/pendingCaptures";
import {
  Mic, Pause, Play, Square, ChevronLeft, ChevronRight, Trash2, Plus, Check, Loader2, Info, RotateCcw, X, Pencil,
} from "lucide-react";
import { FileDown } from "lucide-react";
import { downloadNotesPdf } from "@/components/notes/notesPdf";
import { billingAvailable, boughtLeftSeconds, loadPacks, buyPack, syncPacks } from "@/lib/minutePacks";

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
//
// The page is a list of cards, one per meeting. A meeting coming up in the next
// week (one the reminder planner judged worth notes, see NOTES_LABELS) already
// has its card, drawn dashed because nothing's recorded yet. Its page is where
// questions go beforehand (saved on the task as prep_questions) and where
// recording starts. A recording's card opens its notes and full transcript;
// the notes can be edited by hand in case something came out wrong. Questions
// show on screen while it's recorded, and the notes say which got answered. The
// reminder page links here with ?task=ID&prep=1 (the meeting's page) or
// ?task=ID&record=1 (start recording it right away).

// Same number as NOTES_FREE_MINUTES in base44/functions/transcribeAudioNew,
// which is the one that's enforced.
const FREE_MINUTES = 60;
import RemoveFromNotesButton from "@/components/notes/RemoveFromNotesButton";
import PrepPointsList from "@/components/notes/PrepPointsList";

const recorder = () => (typeof window !== "undefined" && window.Capacitor?.Plugins?.RecorderBridge) || null;

// Shared by every visit to this page, so leaving and coming back mid-way can
// never send the same recording off twice.
let processingLock = false;
const finishing = new Set();
// Which event a recording on the phone belongs to, until its row is saved.
const sessionLinks = new Map();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// An event's start time, if it has one.
function startOf(task) {
  const ms = new Date(task?.event_time || task?.next_reminder || "").getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Same labels as NOTES_LABELS in base44/functions/generateReminderSchedule: an
// event whose reminders carry one was judged worth recording.
const NOTES_LABELS = ["night before · questions", "at the time · record notes"];
function isMeeting(task) {
  return (task?.reminder_schedule || []).some((r) => NOTES_LABELS.includes(r?.label))
    || (task?.prep_questions || []).length > 0;
}

function cleanQuestions(list) {
  return (Array.isArray(list) ? list : []).map((q) => String(q || "").trim()).filter(Boolean).slice(0, 20);
}

// Questions checked off by hand during a recording: only a reminder on screen
// while it's going (the notes work out the answers from the recording either
// way), so they're kept on this phone, per recording, until it stops.
const checkedKey = (sessionId) => `notes_checked_${sessionId}`;
function readChecked(sessionId) {
  try {
    const v = JSON.parse(localStorage.getItem(checkedKey(sessionId)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function forgetChecked(sessionId) {
  try { localStorage.removeItem(checkedKey(sessionId)); } catch (e) { /* nothing kept */ }
}

function monthKey(timeZone) {
  try {
    if (timeZone) {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
    }
  } catch (e) { /* unknown zone */ }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Same rules as usageOf in transcribeAudioNew. left_seconds is the month's
// free minutes plus bought ones (refreshUser puts the bought seconds on the
// user as __bought), so every "is there time left" check counts both.
function usageFrom(user, bought = user?.__bought || 0) {
  const month = monthKey(user?.timezone);
  const used = user?.notes_minutes_month === month ? Math.max(0, Number(user?.notes_seconds_used) || 0) : 0;
  const limit = FREE_MINUTES * 60;
  const boughtLeft = Math.max(0, Number(bought) || 0);
  if (String(user?.email || "").toLowerCase() === "s2kap2chick@gmail.com") return { month, used_seconds: used, limit_seconds: 0, left_seconds: 8 * 3600, free_left_seconds: 8 * 3600, bought_left_seconds: boughtLeft, unlimited: true };
  const freeLeft = Math.max(0, limit - used);
  return { month, used_seconds: used, limit_seconds: limit, free_left_seconds: freeLeft, bought_left_seconds: boughtLeft, left_seconds: freeLeft + boughtLeft };
}

// "42 of 60 free minutes left this month", plus any bought minutes.
function usageLine(usage) {
  if (usage.unlimited) return `${minutesText(usage.used_seconds)} used this month, no limit.`;
  const free = usage.free_left_seconds ?? usage.left_seconds;
  const bought = usage.bought_left_seconds || 0;
  return `${minutesText(free)} of ${FREE_MINUTES} free minutes left this month${bought > 0 ? `, plus ${minutesText(bought)} you bought` : ""}.`;
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

// Highlights: the notes model wraps the few words that matter most on a line
// in ==double equals== (the thing to do, the name, the number). Shown as a
// highlighter mark, so an eye skimming the page lands on them first. Plain
// text in, an array of text and <mark>s out.
function hi(text) {
  const s = String(text || "");
  if (!s.includes("==")) return s;
  const out = [];
  const re = /==([^=]{1,80}?)==/g;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<mark key={m.index} className="rounded px-0.5 bg-yellow-200/80 text-inherit dark:bg-yellow-500/40">{m[1]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// The same line with the highlight marks taken out — for anything that leaves
// the page as plain text (a to-do added to the task list).
function unhi(text) {
  return String(text || "").replace(/==([^=]{1,80}?)==/g, "$1");
}

function clockToMs(at) {
  const bits = String(at || "").split(":").map((x) => parseInt(x, 10));
  if (bits.some((b) => Number.isNaN(b)) || !bits.length) return null;
  return bits.reduce((acc, b) => acc * 60 + b, 0) * 1000;
}

// The recording-consent heads-up, with the full list one tap away. "12
// states, including California and Florida" sent people to Google; nobody
// does that, so the states are right here. Everyone in the conversation has to
// agree in: California, Delaware, Florida, Illinois, Maryland, Massachusetts,
// Montana, Nevada, New Hampshire, Oregon, Pennsylvania and Washington
// (in-person recordings; Oregon is all-party in person, and Nevada is treated
// that way after a state supreme court ruling).
const CONSENT_STATES = "California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Oregon, Pennsylvania and Washington";

function ConsentNote({ soft, center = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`text-xs ${soft} ${center ? "text-center" : ""}`}>
      <p className={`flex gap-1.5 ${center ? "justify-center" : ""}`}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          In 12 states, everyone has to agree before you record them.{" "}
          <button type="button" className="underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide the list" : "Which states?"}
          </button>
        </span>
      </p>
      {open && <p className="mt-1 pl-5">{CONSENT_STATES}.</p>}
    </div>
  );
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
  merged: "",
};

// "Record more" (Anna, Oct 13 2026): a recording made from a finished
// recording's page is a follow-up to it (parent_record_id). The server adds
// its notes to the first recording's notes as "Added 12:40 PM" sections and
// leaves what was there alone; here its transcript shows under the first
// one's, and it never gets a card of its own.
const followUpsOf = (rows, id) => (rows || [])
  .filter((r) => r && r.parent_record_id === id)
  .sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0));
const withFollowUpText = (r, rows) => {
  const more = followUpsOf(rows, r?.id);
  if (!more.length) return r;
  const parts = [...(r.transcript_parts || [])];
  let offset = 100000;
  for (const f of more) {
    for (const p of (f.transcript_parts || [])) parts.push({ ...p, index: offset + (p.index || 0) });
    offset += 100000;
  }
  return { ...r, transcript_parts: parts };
};

// ── Search (Anna, Oct 8 2026: "search all notes for keywords") ──
// Every word typed has to turn up somewhere in the recording: its title, the
// notes (gist, to-dos, details, topics, decisions, open questions) or the full
// transcript. The first place the first word turns up becomes the snippet
// under the card, so you can see WHY it matched without opening it.
function searchLines(r) {
  const n = r?.notes || {};
  const out = [];
  const add = (where, text) => { const s = String(text || "").trim(); if (s) out.push({ where, text: s }); };
  add("title", r?.title || n.title);
  (n.gist || []).forEach((g) => add("gist", g));
  (n.todos || []).forEach((t) => add("to-do", t?.text));
  (n.details || []).forEach((d) => add("details", typeof d === "string" ? d : [d?.label, d?.text].filter(Boolean).join(": ")));
  (n.sections || []).forEach((s) => { add("topic", s?.heading); (s?.points || []).forEach((p) => add(s?.heading || "topic", p)); });
  (n.decisions || []).forEach((d) => add("decided", d?.text));
  (n.questions || []).forEach((q) => add("open question", q?.text));
  (r?.transcript_parts || []).slice().sort((a, b) => (a?.index || 0) - (b?.index || 0)).forEach((p) => add("transcript", p?.text));
  return out;
}

function searchMatch(r, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return { ok: true, snippet: null };
  const lines = searchLines(r);
  const all = lines.map((l) => l.text.toLowerCase()).join("\n");
  if (!words.every((w) => all.includes(w))) return { ok: false, snippet: null };
  const first = lines.find((l) => l.text.toLowerCase().includes(words[0]));
  if (!first) return { ok: true, snippet: null };
  const t = first.text;
  const i = t.toLowerCase().indexOf(words[0]);
  const from = Math.max(0, i - 50);
  const to = Math.min(t.length, i + words[0].length + 70);
  return { ok: true, snippet: { where: first.where, text: `${from > 0 ? "…" : ""}${t.slice(from, to)}${to < t.length ? "…" : ""}` } };
}

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
  // Buying more minutes (only on builds with BillingBridge). buyOpen is the
  // "Get more recording time" popup opened by hand; capOpen opens the same
  // choices when the minutes have run out.
  const [canBuy, setCanBuy] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [packs, setPacks] = useState(null); // null = loading, [] = none to show
  const [buying, setBuying] = useState(null);
  const meRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  // Every event from the last two months on, any status: for "link this
  // recording to an event" and for naming a recording's event on its card.
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  // The event just tapped in the link popup ("unlink" for Unlink), so the tap
  // shows at once while it saves.
  const [linkingId, setLinkingId] = useState(null);
  const [prepTask, setPrepTask] = useState(null);
  const [draft, setDraft] = useState("");
  const [liveQuestions, setLiveQuestions] = useState([]);
  const [checked, setChecked] = useState([]);
  // One box for changes to a recording's notes ("add that the copay is $40"),
  // made by the notes writer in the right part of them (Anna, Oct 12 2026:
  // it replaced editing every line by hand).
  const [changeText, setChangeText] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeSaid, setChangeSaid] = useState("");
  // A question asked in the search box ("when did my boss say the report was
  // due?"), answered from their recordings: { question, loading, answer, sources }.
  const [asked, setAsked] = useState(null);
  // A question about the ONE recording that's open ("what did my doctor say
  // about the dose?"), answered from its whole transcript with the speaker's
  // exact words quoted (Anna, Oct 27 2026): { question, loading, answer, quotes }.
  const [askOneText, setAskOneText] = useState("");
  const [askOne, setAskOne] = useState(null);
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

  // Meetings from three hours ago onward, all of them, soonest first: the ones worth prepping for
  // or recording. Read newest first and stops once past the window.
  const loadUpcoming = useCallback(async () => {
    try {
      const now = Date.now();
      const rows = [];
      for (let skip = 0; skip < 1000; skip += 200) {
        // Any status, two months back: a recording can be linked to an event
        // that is already over (the link dialog below).
        const page = (await base44.entities.Task.filter({ classification: "event" }, "-event_time", 200, skip)) || [];
        rows.push(...page);
        const last = page.length ? startOf(page[page.length - 1]) : null;
        if (page.length < 200 || (last !== null && last < now - 60 * 24 * HOUR)) break;
      }
      setEvents(rows.filter((t) => !t.parent_task_id && !t.birthday_person && startOf(t) !== null));
      const soon = rows
        .filter((t) => t.status === "active" && !t.parent_task_id && !t.birthday_person && !t.day_only_task && isMeeting(t))
        .filter((t) => {
          const s = startOf(t);
          return s !== null && s > now - 3 * HOUR;
        })
        .sort((a, b) => startOf(a) - startOf(b));
      setUpcoming(soon);
    } catch (e) {
      console.error("[Notes] could not load upcoming events", e);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      me.__bought = await boughtLeftSeconds(me?.id);
      meRef.current = me;
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
      setOpenId(record.parent_record_id || record.id);
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
          ...(sessionLinks.get(session.id) || {}),
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
      // A build that can buy minutes: catch up on anything bought that wasn't
      // credited yet (the app closed mid-purchase, say).
      billingAvailable().then(async (ok) => {
        if (cancelled) return;
        setCanBuy(ok);
        if (ok) {
          const s = await syncPacks();
          if (!cancelled && s?.added) await refreshUser();
        }
      });
      const rows = await loadRecords();
      loadUpcoming();
      const R = recorder();
      if (!R || cancelled) return;
      let recordingNow = false;
      try {
        const st = await R.status();
        if (st?.recording && st.session) {
          recordingNow = true;
          const row = (rows || []).find((r) => r.device_session_id === st.session.id);
          setLiveQuestions(cleanQuestions(row?.questions));
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
            forgetChecked(s.id);
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
      // Opened from an event's reminder: write questions, or record it now.
      const params = new URLSearchParams(window.location.search);
      const taskId = params.get("task");
      if (taskId && !cancelled) {
        window.history.replaceState(null, "", window.location.pathname);
        const found = await base44.entities.Task.filter({ id: taskId }).catch(() => []);
        const task = found?.[0];
        if (task && !cancelled) {
          if (params.get("record") === "1" && !recordingNow) startRecording({ task });
          else if (!recordingNow) setPrepTask(task);
        }
      }
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

  // Checked-off questions come back if they leave this page and return mid-recording.
  const liveSessionId = live?.sessionId || null;
  useEffect(() => {
    setChecked(liveSessionId ? readChecked(liveSessionId) : []);
  }, [liveSessionId]);

  const toggleChecked = (i) => {
    if (!liveSessionId) return;
    setChecked((cur) => {
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      try { localStorage.setItem(checkedKey(liveSessionId), JSON.stringify(next)); } catch (e) { /* on screen only */ }
      return next;
    });
  };

  // ── Controls ───────────────────────────────────────────────────────────────

  // link: { task } when it's for an event, so the recording carries the event
  // and its questions; { moreOf } when it's "Record more" on a finished
  // recording, so it becomes that recording's follow-up (see followUpsOf).
  const startRecording = async (link = null) => {
    const R = recorder();
    if (!R || busy) return;
    const name = (link?.moreOf?.title || link?.moreOf?.notes?.title || link?.task?.title || title).trim();
    const now = usageFrom(await refreshUser());
    if (now.left_seconds < 60) {
      setCapOpen(true);
      return;
    }
    setBusy(true);
    try {
      const res = await R.start({ title: name, maxMinutes: Math.max(1, Math.floor(now.left_seconds / 60)) });
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
        const linkFields = link?.moreOf
          ? { task_id: link.moreOf.task_id || "", questions: [], parent_record_id: link.moreOf.id }
          : link?.task
            ? { task_id: link.task.id, questions: cleanQuestions(link.task.prep_questions) }
            : {};
        sessionLinks.set(res.sessionId, linkFields);
        setLiveQuestions(linkFields.questions || []);
        base44.entities.EnergyLog.create({
          kind: "note_recording",
          title: name,
          status: "recording",
          device_session_id: res.sessionId,
          started_at: new Date().toISOString(),
          ...linkFields,
        }).then(() => loadRecords()).catch(() => {});
      }
      setPrepTask(null);
      setTitle("");
      // The recording screen is drawn after a recording's own page: leave
      // that page so the controls show. It opens again when the notes land.
      if (link?.moreOf) { setOpenId(null); setChangeText(""); setChangeSaid(""); }
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
      forgetChecked(live.sessionId);
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

  // Gone from the screen the moment Delete is tapped; the server and the
  // phone's copy catch up behind it. Waiting on both first left the card
  // sitting there for seconds looking stuck. If the server says no, the card
  // comes back with a note.
  const deleteRecording = async (record) => {
    setConfirmDelete(null);
    setOpenId(null);
    setRecords((rows) => rows.filter((r) => r.id !== record.id));
    try {
      await base44.entities.EnergyLog.delete(record.id);
      if (record.device_session_id) recorder()?.deleteSession({ sessionId: record.device_session_id }).catch(() => {});
      // Its follow-ups ("Record more") have no card of their own: they go too.
      for (const f of followUpsOf(recordsRef.current, record.id)) {
        await base44.entities.EnergyLog.delete(f.id).catch(() => {});
        if (f.device_session_id) recorder()?.deleteSession({ sessionId: f.device_session_id }).catch(() => {});
      }
      setRecords((rows) => rows.filter((r) => r.parent_record_id !== record.id));
    } catch (e) {
      setRecords((rows) => (rows.some((r) => r.id === record.id) ? rows : [record, ...rows]));
      toast({ title: "Couldn't delete that recording", description: "It's still here. Try again in a moment." });
    }
  };

  const submitChange = async (record) => {
    const request = changeText.trim();
    if (!request || changing || !record) return;
    setChanging(true);
    setChangeSaid("");
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_change", record_id: record.id, request });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "change_failed");
      if (data.changed) {
        setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: data.notes, ...(data.title ? { title: data.title } : {}) } : r)));
        setChangeText("");
      }
      setChangeSaid(data.said || (data.changed ? "Updated." : "Nothing changed."));
    } catch (e) {
      toast({ title: "That change didn't go through", description: "Check your connection and try again." });
    } finally {
      setChanging(false);
    }
  };

  // The second read on demand, for notes made before it ran automatically:
  // adds what the notes missed and touches nothing already there.
  const [filling, setFilling] = useState(false);
  const fillNotes = async (record) => {
    if (!record || filling) return;
    setFilling(true);
    setChangeSaid("");
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_fill", record_id: record.id });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "fill_failed");
      if (data.added > 0) setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: data.notes } : r)));
      setChangeSaid(data.said || "");
    } catch (e) {
      toast({ title: "Couldn't check the notes just now", description: "Check your connection and try again." });
    } finally {
      setFilling(false);
    }
  };

  const askAboutThis = async (record) => {
    const question = askOneText.trim();
    if (question.length < 3 || askOne?.loading || !record) return;
    setAskOne({ question, loading: true, answer: "", quotes: [] });
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_ask_one", record_id: record.id, question });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "ask_failed");
      setAskOne({ question, loading: false, answer: data.answer || "", quotes: Array.isArray(data.quotes) ? data.quotes : [] });
    } catch (e) {
      setAskOne({ question, loading: false, answer: "Couldn't get an answer just now. Try again in a moment.", quotes: [] });
    }
  };

  const askNotes = async () => {
    const question = search.trim();
    if (question.length < 3 || asked?.loading) return;
    setAsked({ question, loading: true, answer: "", sources: [] });
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_ask", question });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "ask_failed");
      setAsked({ question, loading: false, answer: data.answer || "", sources: Array.isArray(data.sources) ? data.sources : [] });
    } catch (e) {
      setAsked({ question, loading: false, answer: "Couldn't get an answer just now. Try again in a moment.", sources: [] });
    }
  };

  // Questions for an event, saved on the task as they're typed in.
  const saveQuestions = (task, next) => {
    const questions = cleanQuestions(next);
    const updated = { ...task, prep_questions: questions };
    setPrepTask(updated);
    setUpcoming((rows) => rows.map((t) => (t.id === task.id ? updated : t)));
    base44.entities.Task.update(task.id, { prep_questions: questions }).catch(() => {
      toast({ title: "That question didn't save", description: "Check your connection and try again." });
    });
  };

  const addQuestion = () => {
    const q = draft.trim();
    if (!q || !prepTask) return;
    saveQuestions(prepTask, [...cleanQuestions(prepTask.prep_questions), q]);
    setDraft("");
  };

  const addTodo = async (record, index) => {
    const notes = record.notes || {};
    const todo = notes.todos?.[index];
    if (!todo || todo.added) return;
    // Same path as anything typed into ADHDone: the parser decides the day, time
    // and reminders.
    enqueueCapture({ text: unhi(todo.text) });
    const todos = notes.todos.map((t, i) => (i === index ? { ...t, added: true } : t));
    const next = { ...notes, todos };
    setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: next } : r)));
    base44.entities.EnergyLog.update(record.id, { notes: next }).catch(() => {});
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  const card = `rounded-2xl border p-4 ${dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`;
  // A seasonal theme paints a busy background, so the page heading sits in the
  // same frosted card Focus Timer uses for its title (Anna, Oct 3 2026).
  const specialMode = localStorage.getItem("special_mode") || "normal";
  const headCard = specialMode !== 'normal' ? `${specialMode}-card rounded-2xl border border-purple-400/30 bg-white/70 backdrop-blur-md shadow-lg p-5 mb-6` : '';
  const heading = dark ? "text-white" : "text-gray-900";
  const soft = dark ? "text-gray-400" : "text-gray-600";
  const open = records.find((r) => r.id === openId) || null;

  // Buying more minutes (Anna, Oct 25 2026): 1 hour or 5 hours, priced by
  // Google Play in the person's own currency. The minutes are credited by the
  // server (recordingMinutes) once RevenueCat has the purchase; a recording
  // that stopped at the limit is finished right after.
  // An empty list (Play or the network didn't answer) is asked for again next
  // time the popup opens, instead of staying "not available" all visit.
  const closeBuy = () => { setCapOpen(false); setBuyOpen(false); if (packs && packs.length === 0) setPacks(null); };
  useEffect(() => {
    if (!canBuy || !(capOpen || buyOpen) || packs !== null) return;
    let gone = false;
    loadPacks(meRef.current)
      .then((list) => { if (!gone) setPacks(list); })
      .catch(() => { if (!gone) setPacks([]); });
    return () => { gone = true; };
  }, [canBuy, capOpen, buyOpen, packs]);

  const packLabel = (p) => (p.minutes >= 60
    ? `${p.minutes / 60} hour${p.minutes > 60 ? "s" : ""} of recording`
    : `${p.minutes} minutes of recording`);

  const buy = async (pack) => {
    if (buying) return;
    setBuying(pack.id);
    try {
      const me = meRef.current || await refreshUser();
      const r = await buyPack(me, pack);
      if (r.cancelled) return;
      if (r.pending) {
        toast({ title: "Your payment is pending", description: "The time shows up here as soon as Google Play finishes it." });
        closeBuy();
        return;
      }
      await refreshUser();
      toast(r.added
        ? { title: `Added ${packLabel(pack).replace(" of recording", "")} of recording time` }
        : { title: "Payment received", description: "Your time will show up here in a moment." });
      closeBuy();
      // A recording that stopped at the limit can be finished now.
      resumeUnfinished();
    } catch (e) {
      toast({ title: "The purchase didn't go through", description: String(e?.message || ""), variant: "destructive" });
    } finally {
      setBuying(null);
    }
  };

  const capDialog = (
    <Dialog open={capOpen || buyOpen} onOpenChange={(o) => { if (!o) closeBuy(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] bg-card text-card-foreground border-border">
        <div className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-foreground">
            {capOpen ? "You've used this month's free recording time" : "Get more recording time"}
          </h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {capOpen
              ? `You get ${FREE_MINUTES} free minutes a month, and they come back on ${nextMonthStart()}.${canBuy ? " Need more before then? You can buy extra time." : " A paid version with more recording time is coming."}`
              : `You get ${FREE_MINUTES} free minutes a month. Extra time you buy is used after those, and it never expires.`}
          </p>
          {canBuy && (
            <div className="space-y-2">
              {packs === null ? (
                <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : packs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Buying more time isn't available right now. Please try again later.</p>
              ) : packs.map((p) => (
                <Button key={p.id} onClick={() => buy(p)} disabled={!!buying} variant="outline" className="w-full h-12 justify-between text-base">
                  <span>{packLabel(p)}</span>
                  <span className="font-semibold">{buying === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : p.price}</span>
                </Button>
              ))}
            </div>
          )}
          <Button onClick={closeBuy} variant={canBuy ? "ghost" : "default"} className="w-full">{canBuy ? "Not now" : "Got it"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // "Link to an event" (Anna, Oct 8 2026): a recording made without picking
  // its event, or with the wrong one, is attached to one here. The event's
  // questions come along so the notes can say which got answered, and the
  // event's dashed "Coming up" card becomes this recording's. Events from the
  // last two months on, the ones closest to the recording's time first.
  // A tap shows right away: the tapped event lights up and says "Linking…"
  // while it saves, then the popup closes and the recording's line reads
  // "For: <event>" without waiting for every recording to reload (Anna, Oct 19
  // 2026: "me clicking did choose it, but there was no visual confirmation
  // that anything happened").
  const linkTo = async (task) => {
    if (!open || linking) return;
    setLinking(true);
    setLinkingId(task ? task.id : "unlink");
    try {
      const fields = task
        ? { task_id: task.id, questions: cleanQuestions(task.prep_questions), ...(open.title ? {} : { title: task.title }) }
        : { task_id: "", questions: [] };
      await base44.entities.EnergyLog.update(open.id, fields);
      setRecords((rows) => rows.map((r) => (r.id === open.id ? { ...r, ...fields } : r)));
      setLinkOpen(false);
      toast({ title: task ? `Linked to "${task.title}"` : "Unlinked from its event" });
      loadRecords();
    } catch (e) {
      toast({ title: "Couldn't link it", description: "Check your connection and try again." });
    } finally {
      setLinking(false);
      setLinkingId(null);
    }
  };
  const linkDialog = (
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-border">
        {/* min-w-0: a long event name is cut off with "…" instead of pushing
            the cards past the popup's right edge. */}
        <div className="space-y-3 pt-2 min-w-0">
          <h2 className="text-xl font-bold text-foreground">Which event is this recording for?</h2>
          {(() => {
            const at = new Date(open?.started_at || 0).getTime() || Date.now();
            const list = events
              .slice()
              .sort((a, b) => Math.abs(startOf(a) - at) - Math.abs(startOf(b) - at))
              .slice(0, 40);
            if (list.length === 0) return <p className="text-sm text-muted-foreground">No events found from the last two months on.</p>;
            return list.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={linking}
                onClick={() => linkTo(t)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors active:bg-purple-500/10 ${linkingId === t.id ? "border-purple-500 bg-purple-500/10" : open?.task_id === t.id ? "border-purple-500" : "border-border"} ${linking && linkingId !== t.id ? "opacity-50" : ""}`}
              >
                <div className="font-semibold text-foreground truncate">{t.title}</div>
                {linkingId === t.id ? (
                  <div className={`text-sm flex items-center gap-1.5 ${dark ? "text-purple-300" : "text-purple-700"}`}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Linking…
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">{whenText(new Date(startOf(t)).toISOString())}{open?.task_id === t.id ? " · linked now" : ""}</div>
                )}
              </button>
            ));
          })()}
          {open?.task_id && (
            <Button variant="outline" className="w-full" disabled={linking} onClick={() => linkTo(null)}>
              {linkingId === "unlink" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Unlinking…</> : "Unlink from its event"}
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => setLinkOpen(false)}>Cancel</Button>
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
    const followUps = followUpsOf(records, open.id);
    // Ones whose notes went in; the rest (still transcribing, or stuck) get a
    // line of their own below, since they have no card in the list.
    const mergedFollowUps = followUps.filter((f) => f.status === "merged");
    const parts = withFollowUpText(open, records).transcript_parts.slice().sort((a, b) => a.index - b.index);
    // Where each follow-up's transcript starts, for a line between them.
    const followUpStarts = new Map(followUps.map((f, i) => [100000 * (i + 1), f]));
    const canRecordMore = !!recorder() && !live && !busy && !progress && open.status === "ready";
    const jump = (at) => {
      const ms = clockToMs(at);
      if (ms === null || !parts.length) return;
      let target = parts[0];
      for (const p of parts) if ((p.start_ms || 0) <= ms + 1000) target = p;
      setTab("transcript");
      setTimeout(() => document.getElementById(`notes-part-${target.index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    // No "at 0:00" links on the notes for now: the only time the transcript
    // knows is where each ten-minute stretch starts, so on most recordings
    // every link read the same and all led to the top of the transcript. A
    // real link needs word-level times from the transcription, which this one
    // doesn't return. (jump() stays for when it does.)
    void jump;
    const At = () => null;
    const mine = (notes?.todos || []).map((t, i) => ({ ...t, i })).filter((t) => (t.who || "you").toLowerCase() === "you");
    const theirs = (notes?.todos || []).filter((t) => (t.who || "you").toLowerCase() !== "you");
    const working = progress?.recordId === open.id;
    const inputCls = `w-full rounded-lg border px-2.5 py-2 text-[15px] outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900"}`;

    return (
      <div className="p-4 md:p-8 w-full" style={pagePad}>
        {capDialog}
        {deleteDialog}
        {linkDialog}
        <div className="max-w-2xl mx-auto space-y-4">
          <button type="button" onClick={() => { setOpenId(null); setChangeText(""); setChangeSaid(""); }} className={`flex items-center gap-1 text-sm ${soft}`}>
            <ChevronLeft className="w-4 h-4" /> All notes
          </button>
          <div className={headCard}>
            <h1 className={`text-2xl font-bold ${heading}`}>{open.title || notes?.title || "Recording"}</h1>
            <p className={`text-sm ${soft}`}>{whenText(open.started_at)}{open.duration_ms ? ` · ${clock(open.duration_ms)}` : ""}</p>
            {(() => {
              const ev = open.task_id ? events.find((t) => t.id === open.task_id) : null;
              return (
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <span className={`text-sm ${soft}`}>
                    {ev ? `For: ${ev.title} · ${whenText(new Date(startOf(ev)).toISOString())}` : open.task_id ? "Linked to an event" : "Not linked to an event"}
                  </span>
                  <button type="button" onClick={() => setLinkOpen(true)} className={`text-sm font-semibold ${dark ? "text-purple-300" : "text-purple-700"}`}>
                    {open.task_id ? "Change event" : "Link to an event"}
                  </button>
                </div>
              );
            })()}
            {mergedFollowUps.length > 0 && (
              <p className={`mt-1 text-sm ${soft}`}>{mergedFollowUps.length === 1 ? "1 recording added" : `${mergedFollowUps.length} recordings added`} after the first.</p>
            )}
            {followUps.filter((f) => f.status !== "merged").map((f) => (
              <div key={f.id} className={`mt-2 flex items-center justify-between gap-2 text-sm ${soft}`}>
                <span>Added {whenText(f.started_at)}: {progress?.recordId === f.id ? "Working on it…" : (STATUS_TEXT[f.status] || "Not finished")}</span>
                {!progress && !live && f.status !== "recording" && (
                  <Button onClick={() => retryNotes(f)} variant="outline" size="sm" className="shrink-0 rounded-lg">
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Finish
                  </Button>
                )}
              </div>
            ))}
            {canRecordMore && (
              <Button onClick={() => startRecording({ moreOf: open })} variant="outline" className="mt-3 h-11 rounded-xl">
                <Mic className="w-4 h-4 mr-2" /> Record more
              </Button>
            )}
          </div>

          <>
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

          {/* Ask this recording. The answer is drawn from the whole transcript
              and comes with the exact words it rests on; a quote the model
              didn't copy word for word is dropped before it gets here. */}
          {(notes || (open.transcript_parts || []).length > 0) && !working && (
            <div className={`${card} space-y-2`}>
              <div className="flex gap-2">
                <input
                  value={askOneText}
                  onChange={(e) => setAskOneText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") askAboutThis(open); }}
                  placeholder="Ask this recording"
                  disabled={!!askOne?.loading}
                  className={inputCls}
                />
                <Button onClick={() => askAboutThis(open)} disabled={!!askOne?.loading || askOneText.trim().length < 3} className="shrink-0">
                  {askOne?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
                </Button>
              </div>
              {/* The example lives under the box, not in it: a placeholder
                  gets cut to its first words on a phone (Anna, Oct 26 2026). */}
              {!askOne && <p className={`text-xs ${soft}`}>Like “what did my doctor say about the dose?” — the answer comes with their exact words.</p>}
              {askOne && !askOne.loading && (
                <div className="space-y-2 pt-1">
                  <p className={heading}>{askOne.answer}</p>
                  {askOne.quotes.length > 0 && (
                    <ul className="space-y-2">
                      {askOne.quotes.map((q, i) => (
                        <li key={i} className={`border-l-2 pl-3 ${dark ? "border-gray-600" : "border-gray-300"}`}>
                          <p className={`italic ${heading}`}>“{q.text}”</p>
                          {q.at && (
                            <button type="button" onClick={() => setTab("transcript")} className={`text-xs ${soft} underline underline-offset-2`}>
                              at {q.at} in the transcript
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

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
                This recording went past your recording time, so the notes only cover the first part. The rest
                is saved on your phone and can be finished once your minutes come back on {nextMonthStart()}
                {canBuy ? ", or as soon as you get more time." : "."}
              </p>
              {canBuy && (
                <Button onClick={() => setBuyOpen(true)} variant="outline" className="w-full mt-3">Get more time</Button>
              )}
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
              <div className={`${card} space-y-2`}>
                <div className="flex gap-2">
                  <input
                    value={changeText}
                    onChange={(e) => setChangeText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitChange(open); }}
                    placeholder="Change your notes"
                    disabled={changing}
                    className={inputCls}
                  />
                  <Button onClick={() => submitChange(open)} disabled={changing || !changeText.trim()} className="shrink-0">
                    {changing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
                  </Button>
                </div>
                {!changeSaid && <p className={`text-xs ${soft}`}>Like “add that the copay is $40” or “take out the line about parking”.</p>}
                {changeSaid && <p className={`text-sm ${soft}`}>{changeSaid}</p>}
                <button type="button" onClick={() => fillNotes(open)} disabled={filling || changing} className={`text-sm underline underline-offset-2 ${soft}`}>
                  {filling ? "Reading the transcript again…" : "Check the transcript for anything these notes missed"}
                </button>
              </div>
              <Button variant="outline" onClick={() => downloadNotesPdf(open, whenText(open.started_at)).catch(() => {})} className="w-full rounded-xl">
                <FileDown className="w-4 h-4 mr-2" /> Download PDF
              </Button>
              {notes.gist?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>The gist</h2>
                  <ul className="space-y-1.5">
                    {notes.gist.map((g, i) => <li key={i} className={heading}>• {hi(g)}</li>)}
                  </ul>
                </div>
              )}

              {notes.asked?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Things to bring up</h2>
                  <ul className="space-y-3">
                    {notes.asked.map((a, i) => (
                      <li key={i}>
                        <div className={`font-semibold ${heading}`}>{a.question}</div>
                        <div className={a.answered ? heading : soft}>
                          {a.answered ? hi(a.answer) : "No clear answer in the recording"}<At at={a.at} />
                        </div>
                      </li>
                    ))}
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
                          <span className={heading}>{hi(t.text)}</span>
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
                        <span className="font-semibold">{t.who}:</span> {hi(t.text)}<At at={t.at} />
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
                        {d.label ? <span className="font-semibold">{d.label}: </span> : null}{hi(d.value)}<At at={d.at} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(notes.sections || []).map((s, i) => (
                <div key={i} className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>{s.heading}<At at={s.at} /></h2>
                  <ul className="space-y-1.5">
                    {s.points.map((p, j) => <li key={j} className={heading}>• {hi(p)}</li>)}
                  </ul>
                </div>
              ))}

              {notes.decisions?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Decided</h2>
                  <ul className="space-y-1.5">
                    {notes.decisions.map((d, i) => <li key={i} className={heading}>• {hi(d.text)}<At at={d.at} /></li>)}
                  </ul>
                </div>
              )}

              {notes.questions?.length > 0 && (
                <div className={card}>
                  <h2 className={`text-lg font-bold mb-2 ${heading}`}>Still open</h2>
                  <ul className="space-y-1.5">
                    {notes.questions.map((d, i) => <li key={i} className={heading}>• {hi(d.text)}<At at={d.at} /></li>)}
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
                  {followUpStarts.has(p.index) && (
                    <p className={`text-xs font-bold mb-2 ${dark ? "text-purple-300" : "text-purple-700"}`}>Added {whenText(followUpStarts.get(p.index).started_at)}</p>
                  )}
                  {parts.length > 1 && (
                    <p className={`text-xs font-semibold mb-2 ${soft}`}>{clock(p.index % 100000 === 0 ? 0 : p.start_ms)}</p>
                  )}
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
          </>
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
            {usageLine(usage)}
          </p>
          <ConsentNote soft={soft} center />
          {liveQuestions.length > 0 && (
            <div className={`${card} text-left`}>
              <h2 className={`text-lg font-bold ${heading}`}>Things to bring up</h2>
              <p className={`text-xs mb-2 ${soft}`}>Tap one to check it off, if you like.</p>
              <ul className="space-y-1">
                {liveQuestions.map((q, i) => {
                  const done = checked.includes(i);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => toggleChecked(i)}
                        aria-pressed={done}
                        className="w-full flex items-start gap-2 py-1.5 text-left"
                      >
                        <span
                          className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            done ? "bg-green-600 border-green-600" : dark ? "border-gray-500" : "border-gray-400"
                          }`}
                        >
                          {done && <Check className="w-3.5 h-3.5 text-white" />}
                        </span>
                        <span className={done ? `line-through ${soft}` : heading}>{q}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Questions for an event ──
  if (prepTask) {
    const qs = cleanQuestions(prepTask.prep_questions);
    const s = startOf(prepTask);
    return (
      <div className="p-4 md:p-8 w-full" style={pagePad}>
        {capDialog}
        <div className="max-w-2xl mx-auto space-y-4">
          <button type="button" onClick={() => { setPrepTask(null); setDraft(""); }} className={`flex items-center gap-1 text-sm ${soft}`}>
            <ChevronLeft className="w-4 h-4" /> All notes
          </button>
          <div className={headCard}>
            <h1 className={`text-2xl font-bold ${heading}`}>{prepTask.title}</h1>
            {s !== null && <p className={`text-sm ${soft}`}>{whenText(s)} · Not recorded yet</p>}
          </div>
          <div className={`${card} space-y-3`}>
            <h2 className={`text-lg font-bold ${heading}`}>Agenda</h2>
            <p className={`text-sm ${soft}`}>
              Add anything you don't want to forget to mention. It will be on screen while you record, and your notes
              will say which ones got covered.
            </p>
            <PrepPointsList points={qs} onChange={(next) => saveQuestions(prepTask, next)} dark={dark} soft={soft} />
            <form onSubmit={(e) => { e.preventDefault(); addQuestion(); }} className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="A question to bring up"
                className={`flex-1 min-w-0 h-12 rounded-xl border px-3 text-[15px] outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900"}`}
              />
              <Button type="submit" disabled={!draft.trim()} className="h-12 px-4 rounded-xl shrink-0 bg-red-600 hover:bg-red-700 text-white">
                <Plus className="w-4 h-4 mr-1" />Add
              </Button>
            </form>
          </div>
          <Button onClick={() => startRecording({ task: prepTask })} disabled={busy || !!progress} className="w-full h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
            {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Mic className="w-5 h-5 mr-2" />}
            Start recording
          </Button>
          <p className={`text-xs ${soft}`}>
            {usageLine(usage)} Afterward, this page has
            your notes and the full transcript.
          </p>
          <ConsentNote soft={soft} />
        </div>
      </div>
    );
  }

  // ── Start screen: a card per meeting ──
  // A meeting that already has a recording shows as that recording's card.
  const recordedTaskIds = new Set(records.map((r) => r.task_id).filter(Boolean));
  const upcomingCards = upcoming.filter((t) => !recordedTaskIds.has(t.id));
  return (
    <div className="p-4 md:p-8 w-full" style={pagePad}>
      {capDialog}
      {deleteDialog}
      <div className="max-w-2xl mx-auto space-y-5">
        <div className={headCard}>
          <h1 className={`text-3xl font-bold ${heading}`}>Notes</h1>
          <p className={soft}>Record a meeting, appointment or class. ADHDone writes the notes for you, organized for an ADHD brain: to-dos first, the details you'll need to look up, the words that matter highlighted — short lines you can take in at a glance, nothing to wade through.</p>
        </div>

        <div className={`${card} space-y-3`}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it? (optional)"
            className={`w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900"}`}
          />
          <Button onClick={() => startRecording()} disabled={busy || !!progress} className="w-full h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
            {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Mic className="w-5 h-5 mr-2" />}
            Record
          </Button>
          <p className={`text-xs ${soft}`}>
            {usageLine(usage)}
            {canBuy && !usage.unlimited && (
              <> <button type="button" className="underline" onClick={() => setBuyOpen(true)}>Get more</button></>
            )}
          </p>
          <ConsentNote soft={soft} />
        </div>

        {upcomingCards.length > 0 && (
          <div className="space-y-2">
            <h2 className={`text-lg font-bold ${heading}`}>Coming up</h2>
            {upcomingCards.map((t) => {
              const n = cleanQuestions(t.prep_questions).length;
              return (
                <div key={t.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrepTask(t)}
                  className={`flex-1 min-w-0 text-left rounded-2xl border-2 border-dashed p-4 flex items-center gap-3 ${dark ? "border-gray-600 bg-gray-800/40" : "border-gray-300 bg-white/60"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold truncate ${heading}`}>{t.title}</div>
                    <div className={`text-sm ${soft}`}>
                      {whenText(startOf(t))} · Not recorded yet{n ? ` · ${n} thing${n === 1 ? "" : "s"} to bring up` : ""}
                    </div>
                  </div>
                  <span className={`text-sm flex items-center shrink-0 ${soft}`}>Details<ChevronRight className="w-4 h-4" /></span>
                </button>
                <RemoveFromNotesButton task={t} dark={dark} onRemoved={(id) => setUpcoming((u) => u.filter((x) => x.id !== id))} />
                </div>
              );
            })}
          </div>
        )}

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
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") askNotes(); }}
                placeholder="Search or ask your notes"
                className={`w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900"}`}
              />
              {search.trim().length >= 3 && (
                <Button onClick={askNotes} disabled={!!asked?.loading} className="shrink-0 h-auto rounded-xl">
                  {asked?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
                </Button>
              )}
            </div>
            {asked && asked.question === search.trim() && (
              <div className={`${card} space-y-2`}>
                {asked.loading ? (
                  <div className={`flex items-center gap-2 ${soft}`}><Loader2 className="w-4 h-4 animate-spin" />Looking through your recordings…</div>
                ) : (
                  <>
                    <p className={`${heading} whitespace-pre-wrap`}>{asked.answer}</p>
                    {asked.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {asked.sources.map((src) => (
                          <button
                            key={src.id}
                            type="button"
                            onClick={() => { setOpenId(src.id); setTab("notes"); setChangeText(""); setChangeSaid(""); setAskOne(null); setAskOneText(""); }}
                            className={`text-sm font-semibold ${dark ? "text-purple-300" : "text-purple-700"}`}
                          >
                            From: {src.title} · {whenText(src.started_at)} ›
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {(() => {
              const hits = records.filter((r) => !r.parent_record_id).map((r) => ({ r, m: searchMatch(withFollowUpText(r, records), search) })).filter((h) => h.m.ok);
              // A question asked: the answer above is the result, not "nothing has these words".
              if (search.trim().length >= 2 && hits.length === 0) {
                if (asked && asked.question === search.trim()) return null;
                return <p className={`text-sm ${soft}`}>Nothing in your notes or transcripts has "{search.trim()}". Tap Ask to ask it as a question.</p>;
              }
              return hits.map(({ r, m }) => {
                const ev = r.task_id ? events.find((t) => t.id === r.task_id) : null;
                const evLabel = ev && ev.title !== (r.title || r.notes?.title) ? ` · ${ev.title}` : "";
                return (
              <button
                key={r.id}
                type="button"
                onClick={() => { setOpenId(r.id); setTab("notes"); setChangeText(""); setChangeSaid(""); setAskOne(null); setAskOneText(""); }}
                className={`${card} w-full text-left flex items-center gap-3`}
              >
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold truncate ${heading}`}>{r.title || r.notes?.title || "Recording"}</div>
                  <div className={`text-sm ${soft}`}>
                    {whenText(r.started_at)}{r.duration_ms ? ` · ${clock(r.duration_ms)}` : ""}{evLabel}
                    {STATUS_TEXT[r.status] ? ` · ${progress?.recordId === r.id ? "Working on it…" : STATUS_TEXT[r.status]}` : ""}
                  </div>
                  {m.snippet && (
                    <div className={`text-xs mt-1 ${soft}`}><span className="font-semibold">{m.snippet.where}:</span> {m.snippet.text}</div>
                  )}
                </div>
                <span className={`text-sm flex items-center shrink-0 ${soft}`}>Details<ChevronRight className="w-4 h-4" /></span>
              </button>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}