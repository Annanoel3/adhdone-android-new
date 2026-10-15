import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { enqueueCapture } from "@/lib/pendingCaptures";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Lightbulb, ArrowRight, Trash2, ChevronsDown, ChevronsUp, Search, Sparkles, Loader2, Filter, Mic, MoreVertical, CheckCircle2, Pencil, Image as ImageIcon, FileText, X, TrendingUp, Bell } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, Legend as ChartLegend } from "recharts";
import { toast } from "@/components/ui/use-toast";
import { usePopupTurn } from "@/components/onboarding/onboardingSurface";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ImageViewer from "../components/shared/ImageViewer";
import IdeaNotesDialog from "../components/parkinglot/IdeaNotesDialog";
import WeeklyEgg from "../components/shared/WeeklyEgg";
import RaccoonPeek from "../components/parkinglot/RaccoonPeek";

function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

// IdeaCard component is kept as per instruction to preserve existing code,
// though it is no longer directly used in the ParkingLot's main rendering loop
// after these changes.
function IdeaCard({ idea, onUpdate, theme, allIdeas, specialMode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSubIdea, setNewSubIdea] = useState("");
  const subIdeas = allIdeas.filter(i => i.parent_idea_id === idea.id);

  // Same as the page's own convert below: through the task parser.
  const handleConvertToTask = async (ideaToConvert) => {
    await base44.entities.ParkingLotIdea.update(ideaToConvert.id, { converted_to_task: true });
    enqueueCapture({
      text: ideaToConvert.idea,
      fromIdea: { id: ideaToConvert.id, pictures: ideaToConvert.pictures || [], notes: ideaToConvert.notes || '' },
    });
    onUpdate();
  };

  const handleDelete = async (id) => {
    const childIds = allIdeas.filter(i => i.parent_idea_id === id).map(i => i.id);
    for (const childId of childIds) {
        await base44.entities.ParkingLotIdea.delete(childId);
    }
    await base44.entities.ParkingLotIdea.delete(id);
    onUpdate();
  };
  
  const handleAddSubIdea = async (e) => {
      e.preventDefault();
      if(!newSubIdea.trim()) return;
      await base44.entities.ParkingLotIdea.create({
          idea: newSubIdea,
          parent_idea_id: idea.id,
          converted_to_task: false
      });
      setNewSubIdea("");
      onUpdate();
  };

  const categoryColors = {
    work: 'bg-blue-100 text-blue-700',
    personal: 'bg-purple-100 text-purple-700',
    creative: 'bg-pink-100 text-pink-700',
    learning: 'bg-green-100 text-green-700',
    health: 'bg-teal-100 text-teal-700',
    finance: 'bg-amber-100 text-amber-700',
    home: 'bg-orange-100 text-orange-700',
    misc: 'bg-gray-100 text-gray-700'
  };

  return (
    <Card
      className={`border-none shadow-md hover:shadow-lg transition-all ${
        specialMode !== 'normal'
          ? `${specialMode}-card`
          : theme === 'minimalist' 
            ? 'bg-white/90 backdrop-blur-sm' 
            : theme === 'dark'
              ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-r from-yellow-50/70 to-pink-50/70'
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-start gap-2 mb-2">
              <p className={`font-medium flex-1 ${
                specialMode !== 'normal' ? '' : (theme === 'dark' ? 'text-gray-100' : 'text-gray-900')
              }`}>
                {idea.idea}
              </p>
              {idea.category && (
                <Badge className={categoryColors[idea.category] || categoryColors.misc}>
                  {idea.category}
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {new Date(idea.created_date).toLocaleDateString()}
            </Badge>
          </div>
          <div className="flex gap-1">
            {subIdeas.length > 0 && (
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1"
                >
                    {isExpanded ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
                    <span className="hidden sm:inline">{subIdeas.length}</span>
                </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleConvertToTask(idea)}
              className="flex items-center gap-1"
            >
              <ArrowRight className="w-4 h-4" />
              <span className="hidden sm:inline">To Task</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(idea.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {isExpanded && (
            <div className="pl-6 pt-4 mt-4 border-t space-y-2">
                {subIdeas.map(subIdea => (
                    <div key={subIdea.id} className={`flex items-center justify-between text-sm p-2 rounded-md ${
                      specialMode !== 'normal'
                        ? 'bg-white/80 backdrop-blur-sm'
                        : theme === 'dark' ? 'bg-gray-900/50' : 'bg-white/50'
                    }`}>
                        <span className={specialMode !== 'normal' ? '' : (theme === 'dark' ? 'text-gray-300' : '')}>
                          {subIdea.idea}
                        </span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-100" onClick={() => handleDelete(subIdea.id)}>
                            <Trash2 className="w-3 h-3"/>
                        </Button>
                    </div>
                ))}
                <form onSubmit={handleAddSubIdea} className="flex gap-2 pt-2">
                    <Input 
                        value={newSubIdea}
                        onChange={(e) => setNewSubIdea(e.target.value)}
                        placeholder="Add a sub-idea..."
                    />
                    <Button type="submit" size="icon" className="flex-shrink-0">
                        <Plus className="w-4 h-4" />
                    </Button>
                </form>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Trackers (Anna, Oct 12 2026) ─────────────────────────────────────────────
// A Parking Lot entry can be something they log to over time, whatever they
// want it to be: their weight, money spent, how the day went. Nothing points
// people to it; it happens when what they type means it ("track my weight",
// "log how my day went"), which the AI judges, not a keyword list. "weight
// 181" when they already track their weight is logged to it. A tracker can
// remind them to log (every day, once a week, once a month), and that
// reminder opens straight to the log.
// Only entries made from here on are looked at, once each (tracker_checked).
const TRACKER_SINCE = Date.parse('2026-10-12T16:30:00Z');
// The app books a reminder itself when it's within a day; the hourly reminder
// job (cronRefillReminders) books each one after that.
const TRACKER_BOOK_AHEAD_MS = 26 * 60 * 60 * 1000;
const TRACKER_PUSH_BODY = 'Tap to add an entry.';
const trackerPushTitle = (name) => `📝 Time to log: ${String(name || '').slice(0, 80)}`;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A stored time ("2026-10-12T16:10:17.576000", UTC with no zone letter, or ISO).
const rowMs = (v) => {
  if (!v) return NaN;
  const s = String(v);
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};

// The next reminder after `afterMs`, on this phone's clock. Weekly: `day` is
// 0 (Sunday) to 6. Monthly: 1 to 31; a short month uses its last day.
function nextTrackerAt(remind, hhmm, day, afterMs = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m || !['daily', 'weekly', 'monthly'].includes(remind)) return null;
  const start = new Date(afterMs);
  for (let i = 0; i < 400; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (remind === 'weekly' && d.getDay() !== (Number(day) || 0)) continue;
    if (remind === 'monthly') {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (d.getDate() !== Math.min(Math.max(1, Number(day) || 1), last)) continue;
    }
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2])).getTime();
    if (at > afterMs) return at;
  }
  return null;
}

function clockLabel(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

const ordinal = (n) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
};

function remindLabel(t) {
  const at = clockLabel(t?.tracker_remind_time);
  if (t?.tracker_remind === 'daily') return `Every day at ${at}`;
  if (t?.tracker_remind === 'weekly') return `Every ${WEEKDAY_NAMES[Number(t.tracker_remind_day) || 0]} at ${at}`;
  if (t?.tracker_remind === 'monthly') return `Every month on the ${ordinal(Number(t.tracker_remind_day) || 1)} at ${at}`;
  return 'No reminder';
}

const formatLogTime = (at) => {
  const ms = rowMs(at);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// The numbers in an entry, for the chart ("120/80" is two). A pair written
// as "120/80" or "120 over 80" wins over whatever other numbers the entry
// mentions ("felt 2 points better, 120/80" charts 120 and 80, not 2); an
// entry with no such pair charts its numbers in the order written.
const trackerNumbers = (text) => {
  const t = String(text || '');
  const pair = /(-?\d+(?:\.\d+)?)\s*(?:\/|over)\s*(-?\d+(?:\.\d+)?)/i.exec(t);
  if (pair) return [Number(pair[1]), Number(pair[2])];
  return (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
};

// Round-number ticks for the chart's left edge (55 to 99 used to read as 55,
// 66, 77, 88, 99 — correct, but hard to check at a glance). The axis still
// zooms to the data rather than starting at zero, so a change shows.
function niceTicks(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi === lo) { lo -= 1; hi += 1; }
  const span = hi - lo;
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  const step = steps.find((st) => span / st <= 5) || steps[steps.length - 1];
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 1000; v += step) ticks.push(Number(v.toFixed(3)));
  return { domain: [start, end], ticks };
}

export default function ParkingLot() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCategorizingAll, setIsCategorizingAll] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false); // Renamed from setShowAddModal for consistency
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [microphoneAccessGranted, setMicrophoneAccessGranted] = useState(null); // null, true, false
  const [editingIdea, setEditingIdea] = useState(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("misc");
  const [showEditModal, setShowEditModal] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [isUploadingPicture, setIsUploadingPicture] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  const [notesDialogIdea, setNotesDialogIdea] = useState(null);
  
  const specialMode = localStorage.getItem('special_mode') || 'normal';
  
  const queryClient = useQueryClient();

  // An idea that couldn't become a task comes back into the list.
  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    window.addEventListener('parking-lot-changed', refresh);
    return () => window.removeEventListener('parking-lot-changed', refresh);
  }, [queryClient]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const { data: allNotes = [] } = useQuery({
    queryKey: ['parkingLotNotes'],
    queryFn: () => base44.entities.ParkingLotNote.list('-created_date', 200),
    initialData: [],
  });

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ['parkingLotIdeas'],
    queryFn: () => base44.entities.ParkingLotIdea.filter({ converted_to_task: false }, '-created_date'),
    initialData: [],
  });

  // ── Trackers (see the note above nextTrackerAt) ──
  const location = useLocation();
  const navigate = useNavigate();
  const [logFor, setLogFor] = useState(null);
  const [logText, setLogText] = useState("");
  const [historyFor, setHistoryFor] = useState(null);
  const [remindFor, setRemindFor] = useState(null);
  const [remindChoice, setRemindChoice] = useState("none");
  const [remindTime, setRemindTime] = useState("09:00");
  const [trackerBusy, setTrackerBusy] = useState(false);
  const judging = useRef(new Set());
  // The "remind you to log?" question opens on its own after a tracker is
  // made, so it waits until nothing else is on screen.
  const remindShown = usePopupTurn(!!remindFor, { reactive: true });

  const refreshIdeas = () => queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });

  // note: what they said around the reading (when it was taken, what they'd
  // just done or taken, how they felt) — kept with the entry, shown under it,
  // never charted (Anna, Oct 14 2026: "blood pressure is 98/70 and heart is
  // 89 bpm. this is an hour after taking mestinon for the first time and
  // eating a small snack" → two readings, each with that note).
  const addTrackerEntry = async (tracker, text, note = '') => {
    const fresh = await base44.entities.ParkingLotIdea.get(tracker.id).catch(() => null);
    const clean = String(note || '').trim().slice(0, 300);
    const entries = [...((fresh || tracker).tracker_entries || []), { at: new Date().toISOString(), text, ...(clean ? { note: clean } : {}) }];
    await base44.entities.ParkingLotIdea.update(tracker.id, { tracker_entries: entries });
  };

  // Readings that arrived in one sentence belong together (blood pressure
  // and heart rate said in the same breath): their trackers are linked, both
  // ways, and History shows them on one chart. Anna, Oct 14 2026: "I had
  // hoped to be able to see all bp and hr trends in one glance."
  const linkTrackers = async (ids) => {
    const list = Array.from(new Set(ids.filter(Boolean)));
    if (list.length < 2) return;
    for (const id of list) {
      const row = await base44.entities.ParkingLotIdea.get(id).catch(() => null);
      if (!row) continue;
      const have = Array.isArray(row.tracker_companions) ? row.tracker_companions : [];
      const want = Array.from(new Set([...have, ...list.filter((x) => x !== id)]));
      if (want.length !== have.length) await base44.entities.ParkingLotIdea.update(id, { tracker_companions: want }).catch(() => {});
    }
  };

  // Linked trackers show as ONE card (the oldest one's), with every tracker's
  // latest reading on it, one Log box for all of them and one History chart.
  // Anna, Oct 14 2026: "I had hoped to be able to see all bp and hr trends
  // in one glance" — a heart rate card of its own was not that.
  const groupOf = (t) => {
    if (!t?.tracker) return [t].filter(Boolean);
    const mates = (t.tracker_companions || []).map((id) => ideas.find((i) => i.id === id && i.tracker && !i.parent_idea_id)).filter(Boolean);
    return [t, ...mates];
  };
  const groupTitle = (t) => groupOf(t).map((x) => x.idea).join(' · ');
  // Shown inside an older companion's card rather than on its own.
  const isSecondaryTracker = (t) => t?.tracker && groupOf(t).slice(1).some((m) => rowMs(m.created_date) < rowMs(t.created_date));

  // One Log box for a linked group: the AI splits what was typed into a
  // reading per tracker (with the note); anything it can't place goes to the
  // card's own tracker, so nothing typed is ever lost.
  const splitLogForGroup = async (text, group) => {
    const list = group.map((t) => ({ id: t.id, name: t.idea }));
    const prompt = `Someone logged this to the things they keep track of: "${text.slice(0, 500)}"
Those things: ${JSON.stringify(list)}
Give one item per reading, in order: {"log_to": "<its id>", "entry": "<the reading, as they said it, without its name>", "note": "<anything else they said that goes with it — when it was taken, what they had just done, eaten or taken, how they felt — in their words, else null>"}. Context that applies to the whole sentence goes on every item. Match by meaning, short forms included ("bp" is blood pressure, "hr" or "heart" is heart rate). Answer with JSON only: {"actions": [ ... ]}.`;
    try {
      const res = await base44.functions.invoke('categorizeIdea', { prompt });
      const raw = String(res?.data?.message || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const out = JSON.parse(raw);
      const actions = (Array.isArray(out?.actions) ? out.actions : []).filter((a) => a && typeof a === 'object');
      const placed = [];
      for (const a of actions) {
        const target = group.find((t) => t.id === a.log_to);
        const entry = typeof a.entry === 'string' ? a.entry.trim() : '';
        if (target && entry) placed.push({ target, entry, note: typeof a.note === 'string' ? a.note.trim() : '' });
      }
      return placed;
    } catch (e) {
      return [];
    }
  };

  // The day a reminder repeats on: the one it already had, else today's.
  const remindDayFor = (tracker, choice) => {
    if (tracker?.tracker_remind === choice && tracker?.tracker_remind_day != null) return Number(tracker.tracker_remind_day);
    const now = new Date();
    return choice === 'weekly' ? now.getDay() : choice === 'monthly' ? now.getDate() : null;
  };

  const openRemind = (tracker, suggest = null) => {
    const now = new Date();
    const choice = suggest?.remind || tracker.tracker_remind || 'none';
    setRemindChoice(['daily', 'weekly', 'monthly'].includes(choice) ? choice : 'none');
    setRemindTime(suggest?.time || tracker.tracker_remind_time
      || `${String(now.getHours()).padStart(2, '0')}:${String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0')}`);
    setRemindFor(tracker);
  };

  const saveReminder = async (tracker, choice, time) => {
    if (!tracker) return;
    setTrackerBusy(true);
    try {
      if (tracker.tracker_notification_id) {
        base44.functions.invoke('cancelScheduled', { notificationId: tracker.tracker_notification_id }).catch(() => {});
      }
      const on = ['daily', 'weekly', 'monthly'].includes(choice) && /^\d{1,2}:\d{2}$/.test(time || '');
      const fields = {
        tracker_remind: on ? choice : 'none',
        tracker_remind_time: on ? time : null,
        tracker_remind_day: on ? remindDayFor(tracker, choice) : null,
        tracker_next_at: null,
        tracker_notification_id: null,
      };
      const next = on ? nextTrackerAt(choice, time, fields.tracker_remind_day) : null;
      if (next) {
        fields.tracker_next_at = new Date(next).toISOString();
        if (next - Date.now() <= TRACKER_BOOK_AHEAD_MS) {
          try {
            const me = await base44.auth.me();
            const res = await base44.functions.invoke('schedulePush', {
              toUserExternalId: me.email,
              title: trackerPushTitle(tracker.idea),
              body: TRACKER_PUSH_BODY,
              sendAtISO: fields.tracker_next_at,
              data: { type: 'tracker_reminder', idea_id: tracker.id, screen: '/ParkingLot' },
            });
            fields.tracker_notification_id = res?.data?.notificationId || null;
          } catch (e) {
            console.warn('Tracker reminder not booked here; the hourly job books it:', e?.message || e);
          }
        }
      }
      await base44.entities.ParkingLotIdea.update(tracker.id, fields);
      setRemindFor(null);
      refreshIdeas();
      toast({ title: on ? `Reminder: ${remindLabel(fields)}` : 'No reminder' });
    } catch (e) {
      toast({ title: "Couldn't save the reminder", description: 'Try again in a moment.' });
    } finally {
      setTrackerBusy(false);
    }
  };

  const saveLog = async () => {
    const text = logText.trim();
    if (!logFor || !text) return;
    setTrackerBusy(true);
    try {
      const group = groupOf(logFor);
      const placed = group.length > 1 ? await splitLogForGroup(text, group) : [];
      if (placed.length) {
        for (const { target, entry, note } of placed) await addTrackerEntry(target, entry, note);
        toast({ title: `Logged to ${placed.map((x) => x.target.idea).join(' · ')}` });
      } else {
        await addTrackerEntry(logFor, text);
        toast({ title: `Logged to ${logFor.idea}` });
      }
      setLogFor(null);
      setLogText("");
      refreshIdeas();
    } catch (e) {
      toast({ title: "Couldn't save that", description: 'Try again in a moment.' });
    } finally {
      setTrackerBusy(false);
    }
  };

  const removeTrackerEntry = async (tracker, entry) => {
    try {
      const fresh = await base44.entities.ParkingLotIdea.get(tracker.id).catch(() => null);
      const list = [...((fresh || tracker).tracker_entries || [])];
      const at = list.findIndex((e) => e.at === entry.at && e.text === entry.text);
      if (at < 0) return;
      list.splice(at, 1);
      await base44.entities.ParkingLotIdea.update(tracker.id, { tracker_entries: list });
      // A companion's entry (one History for the linked group): the dialog
      // stays on the card's own tracker and re-reads the companion from the list.
      if (tracker.id === historyFor?.id) setHistoryFor({ ...(fresh || tracker), tracker_entries: list });
      refreshIdeas();
    } catch (e) {
      toast({ title: "Couldn't remove that", description: 'Try again in a moment.' });
    }
  };

  // One look at each new entry: is it something to keep track of, or an
  // entry for a tracker they already have? One sentence can be several
  // things at once — "blood pressure 91 over 57 and heart rate 89" is a
  // reading for one tracker and, if there's no heart rate tracker yet, a new
  // one (Anna, Oct 13 2026: "would it save my heart rate somewhere?") — so
  // the answer is a list, each part logged or started on its own.
  const judgeIdea = async (idea, all) => {
    if (judging.current.has(idea.id)) return;
    judging.current.add(idea.id);
    const trackers = all.filter((i) => i.tracker && !i.parent_idea_id && i.id !== idea.id).map((i) => ({ id: i.id, name: i.idea }));
    const prompt = `Someone typed this into the Parking Lot of an app for people with ADHD (a place to dump thoughts so they don't lose them):
"${String(idea.idea || '').slice(0, 500)}"

Things they already keep track of here (they log entries to these over time): ${trackers.length ? JSON.stringify(trackers) : 'none yet'}

What is it? It can be more than one thing at once ("blood pressure 91 over 57 and heart rate 89" is a reading for blood pressure AND a reading for heart rate) — give one item per part, in order:
1. An entry for one of those they already keep track of (a reading, a number, a note for it), like "weight 181" when they track their weight: {"log_to": "<that one's id>", "entry": "<just this part, as they said it, without its name>", "note": "<see below, else null>"}. Match by meaning, not spelling: "heartrate", "heart rate", "hr", "pulse" and "bpm" are all the same thing, "bp" is blood pressure. Something they already keep track of is ALWAYS 1 — never start a second one for it under a different spelling.
2. They want to keep track of something over time, logging it again and again. It can be anything they choose: a measurement, money spent, a mood, how their day went. A reading for something they don't track yet counts, with that reading as its first entry. {"track": "<a short name for it, in their words>", "entry": "<an entry if they already gave one, else null>", "note": "<see below, else null>", "remind": "<daily, weekly or monthly if they said how often, else null>", "time": "<HH:MM, 24-hour, if they said a time, else null>"}
3. Anything else: an idea, a to-do, a list, a note, a one-time thing. {"none": true}

note: anything else they said that goes with a reading — when it was taken, what they had just done, eaten or taken, how they felt — in their words, without the reading itself. Context that applies to the whole sentence goes on every part. "blood pressure is 98/70 and heart is 89 bpm. this is an hour after taking mestinon for the first time and eating a small snack." → entry "98/70" and entry "89 bpm", each with the note "an hour after taking mestinon for the first time and eating a small snack".

Judge by what they mean. Only 1 or 2 when they clearly mean logging something over time; a to-do that mentions a number is 3. Answer with JSON only, in this shape: {"actions": [ ... ]} — one object per part, or a single {"none": true}.`;
    let out = null;
    let answered = false;
    try {
      const res = await base44.functions.invoke('categorizeIdea', { prompt });
      const raw = String(res?.data?.message || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      answered = raw.length > 0;
      out = JSON.parse(raw);
    } catch (e) {
      out = null;
    }
    if (!out || typeof out !== 'object') {
      // An answer that isn't what was asked for counts as "not a tracker", so
      // it isn't asked again on every visit; no answer at all (offline) is
      // asked again the next time this page opens.
      if (answered) {
        await base44.entities.ParkingLotIdea.update(idea.id, { tracker_checked: true }).catch(() => {});
      }
      return;
    }
    try {
      // The old single-object answer still works: it's a list of one.
      const actions = (Array.isArray(out.actions) ? out.actions : [out]).filter((a) => a && typeof a === 'object');
      const logs = [];
      const news = [];
      // "heartrate", "heart rate", "Heart-Rate", "hr" and "pulse" are one
      // thing (Oct 14 2026: a third tracker named "heartrate" appeared next to
      // "heart rate"). Letters only, then the common short forms.
      const canon = (name) => {
        const k = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return ({ hr: 'heartrate', pulse: 'heartrate', heartbeat: 'heartrate', bpm: 'heartrate', bp: 'bloodpressure', pressure: 'bloodpressure', temp: 'temperature', wt: 'weight' })[k] || k;
      };
      const sameName = (x, y) => canon(x) !== '' && canon(x) === canon(y);
      for (const a of actions) {
        const entry = typeof a.entry === 'string' ? a.entry.trim() : '';
        const note = typeof a.note === 'string' ? a.note.trim().slice(0, 300) : '';
        const trackName = typeof a.track === 'string' ? a.track.trim().slice(0, 120) : '';
        // A "new" one with the name of one they already have is an entry for
        // that one (the AI once started a second "heart rate" for "hr 77").
        const target = (a.log_to ? all.find((i) => i.id === a.log_to && i.tracker) : null)
          || (trackName ? all.find((i) => i.tracker && !i.parent_idea_id && i.id !== idea.id && sameName(i.idea, trackName)) : null);
        if (target && entry) logs.push({ target, entry, note });
        else if (trackName && !target) news.push({ name: trackName, entry, note, remind: a.remind, time: a.time });
      }
      const together = logs.map((l) => l.target.id); // every tracker this one sentence touched
      for (const { target, entry, note } of logs) {
        await addTrackerEntry(target, entry, note);
        toast({ title: `Logged to ${target.idea}`, description: note ? `${entry} — ${note}` : entry });
      }
      if (news.length === 0) {
        if (logs.length > 0) await base44.entities.ParkingLotIdea.delete(idea.id);
        else await base44.entities.ParkingLotIdea.update(idea.id, { tracker_checked: true });
        await linkTrackers(together);
      } else {
        // The first new tracker takes over this row; any other becomes its own.
        const [first, ...rest] = news;
        const entriesOf = (n) => (n.entry ? [{ at: new Date().toISOString(), text: n.entry, ...(n.note ? { note: n.note } : {}) }] : []);
        await base44.entities.ParkingLotIdea.update(idea.id, {
          tracker: true,
          tracker_checked: true,
          idea: first.name,
          tracker_entries: entriesOf(first),
        });
        together.push(idea.id);
        for (const n of rest) {
          const made = await base44.entities.ParkingLotIdea.create({
            idea: n.name,
            tracker: true,
            tracker_checked: true,
            tracker_entries: entriesOf(n),
            converted_to_task: false,
            parent_idea_id: null,
          });
          if (made?.id) together.push(made.id);
          toast({ title: `Now keeping track of ${n.name}`, description: n.entry ? `First entry: ${n.entry}. Tap its bell to set a reminder.` : 'Tap its bell to set a reminder.' });
        }
        await linkTrackers(together);
        // The "remind you to log?" question, for the first one only — one
        // popup at a time; the others' bells are a tap away.
        const said = /^(\d{1,2}):(\d{2})$/.exec(String(first.time || ''));
        const time = said && Number(said[1]) < 24 ? `${said[1].padStart(2, '0')}:${said[2]}` : null;
        openRemind({ ...idea, idea: first.name, tracker: true }, { remind: first.remind, time });
      }
    } catch (e) {
      console.warn('Tracker check failed:', e?.message || e);
    } finally {
      refreshIdeas();
    }
  };

  useEffect(() => {
    for (const i of ideas) {
      if (i.parent_idea_id || i.tracker || i.tracker_checked || i.converted_to_task) continue;
      if (!(rowMs(i.created_date) >= TRACKER_SINCE)) continue;
      judgeIdea(i, ideas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas]);

  // A reminder's tap opens straight to its log (/ParkingLot?log=<id>).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('log');
    if (!id) return;
    const t = ideas.find((i) => i.id === id);
    if (!t) return;
    setLogText("");
    setLogFor(t);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, ideas]);

  // An idea turned into a task goes through the same parser as anything typed
  // into Add Task, so it gets its real date, time, priority and place, and
  // smart nudges pick it up. (It used to be saved raw with a hard-coded
  // "every 30 minutes" setting and nobody to send to, so it never got a single
  // reminder.) The idea leaves the list now; if no task comes of it, the
  // capture processor puts it back.
  const convertToTaskMutation = useMutation({
    mutationFn: async (ideaToConvert) => {
      await base44.entities.ParkingLotIdea.update(ideaToConvert.id, { converted_to_task: true });
      enqueueCapture({
        text: ideaToConvert.idea,
        fromIdea: { id: ideaToConvert.id, pictures: ideaToConvert.pictures || [], notes: ideaToConvert.notes || '' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    },
  });

  const handleConvertToTask = (ideaToConvert) => {
    convertToTaskMutation.mutate(ideaToConvert);
  };

  const handlePictureUpload = async (ideaId, file) => {
    setIsUploadingPicture(ideaId);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const idea = ideas.find(i => i.id === ideaId);
      if (!idea) return;
      
      const updatedPictures = [...(idea.pictures || []), file_url];
      
      // Update database in background
      await base44.entities.ParkingLotIdea.update(ideaId, { pictures: updatedPictures });
      
      // Refetch to get fresh data
      await queryClient.refetchQueries({ queryKey: ['parkingLotIdeas'] });
    } catch (error) {
      console.error("Error uploading picture:", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploadingPicture(null);
    }
  };

  const handleRemovePicture = async (ideaId, pictureUrl) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    
    const updatedPictures = idea.pictures.filter(p => p !== pictureUrl);
    
    try {
      await base44.entities.ParkingLotIdea.update(ideaId, { pictures: updatedPictures });
      await queryClient.refetchQueries({ queryKey: ['parkingLotIdeas'] });
    } catch (error) {
      console.error("Error removing picture:", error);
    }
  };

  const handleNotesUpdate = async (ideaId, notes) => {
    try {
      await base44.entities.ParkingLotIdea.update(ideaId, { notes });
      await queryClient.refetchQueries({ queryKey: ['parkingLotIdeas'] });
    } catch (error) {
      console.error("Error updating notes:", error);
    }
  };

  const deleteIdeaMutation = useMutation({
    mutationFn: async (idToDelete) => {
      const childIds = ideas.filter(i => i.parent_idea_id === idToDelete).map(i => i.id);
      for (const childId of childIds) {
        await base44.entities.ParkingLotIdea.delete(childId);
      }
      await base44.entities.ParkingLotIdea.delete(idToDelete);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    },
  });

  const handleDelete = (id) => {
    // A tracker's booked reminder goes with it.
    const doomed = ideas.find((i) => i.id === id);
    if (doomed?.tracker_notification_id) {
      base44.functions.invoke('cancelScheduled', { notificationId: doomed.tracker_notification_id }).catch(() => {});
    }
    deleteIdeaMutation.mutate(id);
  };

  const editIdeaMutation = useMutation({
    mutationFn: ({ id, newText, newCategory }) => 
      base44.entities.ParkingLotIdea.update(id, { idea: newText, category: newCategory }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
      setShowEditModal(false);
      setEditingIdea(null);
      setEditText("");
      setEditCategory("misc");
    },
  });

  const handleEditIdea = () => {
    if (editingIdea && editText.trim()) {
      editIdeaMutation.mutate({ id: editingIdea.id, newText: editText, newCategory: editCategory });
    }
  };

  const handleCategorizeAll = async () => {
    setIsCategorizingAll(true);
    
    const uncategorized = ideas.filter(i => !i.category && !i.parent_idea_id);
    
    for (const idea of uncategorized) {
      const prompt = `Categorize this brain dump idea into ONE category: "${idea.idea}"

Categories:
- work (job, career, professional tasks)
- personal (relationships, self-improvement, hobbies)
- creative (art, writing, projects)
- learning (education, skills, courses)
- health (fitness, medical, wellness)
- finance (money, budget, investments)
- home (chores, maintenance, organization)
- misc (everything else)

Return ONLY the category name, nothing else.`;

      try {
        const result = await base44.functions.invoke('categorizeIdea', { prompt });
        const response = result?.data?.message;
        const category = response.trim().toLowerCase();
        
        if (['work', 'personal', 'creative', 'learning', 'health', 'finance', 'home', 'misc'].includes(category)) {
          await base44.entities.ParkingLotIdea.update(idea.id, { category });
        }
      } catch (error) {
        console.error('Error categorizing idea:', error);
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
    setIsCategorizingAll(false);
  };
  
  const topLevelIdeas = ideas.filter(i => !i.parent_idea_id);
  
  const filteredIdeas = topLevelIdeas.filter(idea => {
    if (isSecondaryTracker(idea)) return false; // shown on its older companion's card
    const matchesSearch = searchQuery === "" || 
      (idea.tracker ? groupTitle(idea) : idea.idea).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || 
      idea.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Group filtered top-level ideas with their sub-ideas
  const groupedIdeas = filteredIdeas.map(parentIdea => ({
    parent: parentIdea,
    subIdeas: ideas.filter(i => i.parent_idea_id === parentIdea.id)
  }));

  const hasUncategorized = topLevelIdeas.some(i => !i.category);

  const handleVoiceRecord = async () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      try {
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/ogg;codecs=opus';
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          }
        });
        setMicrophoneAccessGranted(true);
        setIsRecording(true);
        
        const mediaRecorder = new MediaRecorder(stream, { 
          mimeType: mimeType,
          audioBitsPerSecond: 128000
        });
        const chunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          const audioBlob = new Blob(chunks, { type: mimeType });
          
          if (audioBlob.size === 0) {
            alert("No audio was recorded. Please try again.");
            setIsRecording(false);
            return;
          }
          
          try {
            let extension = 'webm';
            if (mimeType.includes('mp4')) extension = 'mp4';
            if (mimeType.includes('ogg')) extension = 'ogg';
            
            const reader = new FileReader();
            reader.onload = async () => {
              const base64Audio = reader.result.split(',')[1];
              
              try {
                const result = await base44.functions.invoke('transcribeAudioNew', {
                  audio_base64: base64Audio,
                  filename: `recording.${extension}`
                });

                const transcribedText = result?.data?.text || '';
                if (transcribedText) {
                  setTextInput(prev => prev + (prev ? ' ' : '') + transcribedText);
                } else {
                  alert("Failed to transcribe audio. Please try again.");
                }
              } catch (error) {
                console.error('Error transcribing audio:', error);
                alert('Failed to transcribe audio. Please try again.');
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (error) {
            console.error('Error transcribing audio:', error);
            alert('Failed to transcribe audio. Please try again.');
          }
          setIsRecording(false);
        };
        
        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, 10000);
      } catch (error) {
        setMicrophoneAccessGranted(false);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            alert("Microphone access denied. Please enable it in your browser settings.");
        } else {
            alert("Could not access microphone: " + error.message);
        }
      }
    }
  };

  const categoryColors = {
    work: 'bg-blue-100 text-blue-700',
    personal: 'bg-purple-100 text-purple-700',
    creative: 'bg-pink-100 text-pink-700',
    learning: 'bg-green-100 text-green-700',
    health: 'bg-teal-100 text-teal-700',
    finance: 'bg-amber-100 text-amber-700',
    home: 'bg-orange-100 text-orange-700',
    misc: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 max-w-6xl mx-auto pb-0 ${
      theme === 'spicybrains' && specialMode === 'normal'
        ? 'bg-gradient-to-br from-yellow-300 via-purple-300 to-yellow-400'
        : ''
    }`}>
      {/* On a seasonal theme the heading sits in the same frosted card Focus
          Timer uses for its title — bare text over the pattern was unreadable. */}
      <div className={`mb-6 flex items-center justify-between ${specialMode !== 'normal' ? `${specialMode}-card rounded-2xl border border-purple-400/30 bg-white/70 backdrop-blur-md shadow-lg p-5` : ''}`}>
        <div>
          <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Parking Lot 🅿️
            <WeeklyEgg slot={2} type="ideas" />
          </h1>
          <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            Brain dump your ideas here - they're safe until you're ready!
            <WeeklyEgg slot={1} type="ideas" />
          </p>
        </div>
        <WeeklyEgg slot={0} type="ideas" />
      </div>

      {/* Once the lot is properly full, something comes to rummage through it. */}
      <RaccoonPeek count={topLevelIdeas.length} />

      {/* Adding an idea once the lot has some (Anna, Oct 12 2026: "There used
          to be an add idea spot on this page"). Only the empty lot had a
          button, and the floating "Park an idea" one is hidden on this page. */}
      {topLevelIdeas.length > 0 && (
        <Button
          onClick={() => setShowQuickAdd(true)}
          className={`w-full mb-6 h-12 rounded-2xl text-base text-white ${
            theme === 'minimalist' || theme === 'dark'
              ? 'bg-purple-600 hover:bg-purple-700'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
          }`}
        >
          <Plus className="w-5 h-5 mr-2" />
          Add an idea
        </Button>
      )}

      {/* Quick Add Modal */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Add Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className={`text-center text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Type or speak your idea
            </p>

            <div className="flex gap-3">
              <Button
                onClick={handleVoiceRecord}
                variant="outline"
                className={`flex-1 ${isRecording ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' : ''}`}
                disabled={microphoneAccessGranted === false}
              >
                <Mic className="w-4 h-4 mr-2" />
                {isRecording ? "Stop Recording" : (microphoneAccessGranted === false ? "Mic Access Denied" : "Record Voice")}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className={`px-2 ${theme === 'dark' ? 'bg-gray-900 text-gray-400' : 'bg-white text-gray-500'}`}>
                  Or
                </span>
              </div>
            </div>

            <Textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="What's on your mind? (Try: 'Add milk to my shopping list')"
              className={`min-h-[120px] ${theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}`}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!textInput.trim()) return;
                  
                  // Check if user is trying to add to an existing list
                  const addToListMatch = textInput.toLowerCase().match(/add (.+?) to (?:the |my )?(.+?)(?:\s+list)?$/i);
                  
                  if (addToListMatch) {
                    const [_, itemToAdd, listName] = addToListMatch;
                    
                    // Find matching parent idea
                    // Not a tracker: "add 181 to my weight" is an entry for
                    // it, which the tracker check below logs.
                    const matchingIdea = topLevelIdeas.find(idea => 
                      !idea.tracker && idea.idea.toLowerCase().includes(listName.toLowerCase().trim())
                    );
                    
                    if (matchingIdea) {
                      // Add as sub-idea to the matched list
                      await base44.entities.ParkingLotIdea.create({
                        idea: itemToAdd.trim(),
                        parent_idea_id: matchingIdea.id,
                        converted_to_task: false
                      });
                      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                      setTextInput("");
                      setShowQuickAdd(false);
                      return;
                    }
                  }
                  
                  // Otherwise create as new idea
                  await base44.entities.ParkingLotIdea.create({
                    idea: textInput,
                    converted_to_task: false,
                    parent_idea_id: null
                  });
                  queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                  setTextInput("");
                  setShowQuickAdd(false);
                  setIsRecording(false);
                  setMicrophoneAccessGranted(null);
                }}
                disabled={!textInput.trim()}
                className={`flex-1 ${theme === 'minimalist'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-gradient-to-r from-yellow-600 to-pink-600'
                }`}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Idea
              </Button>
              <Button
                onClick={() => {
                  setTextInput("");
                  setShowQuickAdd(false);
                  setIsRecording(false);
                  setMicrophoneAccessGranted(null);
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showCategoryFilter && topLevelIdeas.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ideas..."
              className="pl-10"
            />
          </div>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="md:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="work">Work</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
              <SelectItem value="home">Home</SelectItem>
              <SelectItem value="misc">Miscellaneous</SelectItem>
            </SelectContent>
          </Select>

          {hasUncategorized && (
            <Button
              onClick={handleCategorizeAll}
              disabled={isCategorizingAll}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isCategorizingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Categorizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI Categorize
                </>
              )}
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : groupedIdeas.length === 0 ? (
          <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
            specialMode === 'normal' ? (
              theme === 'minimalist'
                ? 'bg-white/90 backdrop-blur-sm'
                : theme === 'dark'
                  ? 'bg-gray-800/90 backdrop-blur-sm'
                  : 'bg-gradient-to-br from-purple-50 to-pink-50' // Empty state specific gradient
            ) : ''
          }`}>
            <CardContent className="p-12 text-center">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                specialMode !== 'normal' ? '' :
                theme === 'minimalist' ? 'bg-purple-100' :
                theme === 'dark' ? 'bg-purple-900/30' :
                'bg-gradient-to-br from-purple-100 to-pink-100'
              }`}>
                <Lightbulb className={`w-8 h-8 ${
                  specialMode !== 'normal' ? '' :
                  theme === 'minimalist' ? 'text-purple-600' :
                  theme === 'dark' ? 'text-purple-400' :
                  'text-purple-600'
                }`} />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${
                specialMode !== 'normal' ? `${specialMode}-title` :
                theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
              }`}>
                No ideas parked yet
              </h3>
              <p className={`mb-6 ${
                specialMode !== 'normal' ? `${specialMode}-text` :
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Got a random thought? Park it here to clear your mind
              </p>
              <Button
                onClick={() => setShowQuickAdd(true)} // Changed from setShowAddModal
                className={
                  specialMode !== 'normal' ? '' :
                  theme === 'minimalist'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Park Your First Idea
              </Button>
            </CardContent>
          </Card>
        ) : (
          groupedIdeas.map((group) => (
            <Card key={group.parent.id} className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
              specialMode === 'normal' ? (
                theme === 'minimalist'
                  ? 'bg-white/90 backdrop-blur-sm'
                  : theme === 'dark'
                    ? 'bg-gray-800/90 backdrop-blur-sm'
                    : 'bg-gradient-to-br from-purple-50 to-pink-50' // Ideas list specific gradient
              ) : ''
            }`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      {group.parent.tracker ? (
                        <TrendingUp className={`w-5 h-5 flex-shrink-0 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
                      ) : (
                      <Lightbulb className={`w-5 h-5 ${
                        specialMode !== 'normal' ? '' :
                        theme === 'minimalist' ? 'text-purple-600' :
                        theme === 'dark' ? 'text-purple-400' :
                        'text-purple-600'
                      }`} />
                      )}
                      <h3 className={`font-semibold text-lg whitespace-pre-wrap break-words min-w-0 flex-1 ${
                        specialMode !== 'normal' ? `${specialMode}-title` :
                        theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        {group.parent.tracker ? groupTitle(group.parent) : group.parent.idea}
                      </h3>
                    </div>
                    {group.parent.category && (
                      <Badge className={categoryColors[group.parent.category] || categoryColors.misc}>
                        {group.parent.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2">
                        <div className="space-y-1">
                          {group.parent.tracker ? (
                          <button
                            onClick={() => openRemind(group.parent)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                          >
                            <Bell className="w-4 h-4" />
                            Reminder
                          </button>
                          ) : (
                          <button
                            onClick={() => handleConvertToTask(group.parent)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Convert to Task
                          </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingIdea(group.parent);
                              setEditText(group.parent.idea);
                              setEditCategory(group.parent.category || "misc");
                              setShowEditModal(true);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          {!group.parent.tracker && (<>
                          <div className="border-t my-1" />
                          <div className="px-3 py-1 text-xs font-semibold text-gray-500">Format</div>
                          <button
                            onClick={async () => {
                              await base44.entities.ParkingLotIdea.update(group.parent.id, { list_format: 'plain' });
                              queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            Plain Text
                          </button>
                          <button
                            onClick={async () => {
                              await base44.entities.ParkingLotIdea.update(group.parent.id, { list_format: 'checkbox' });
                              queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            ☑️ Checklist
                          </button>
                          <button
                            onClick={async () => {
                              await base44.entities.ParkingLotIdea.update(group.parent.id, { list_format: 'numbered' });
                              queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            🔢 Numbered List
                          </button>
                          </>)}
                          <div className="border-t my-1" />
                          <button
                            onClick={() => handleDelete(group.parent.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 rounded flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* A tracker: its last entry, and Log / History / Reminder. */}
                {group.parent.tracker && (() => {
                  const t = group.parent;
                  const entries = t.tracker_entries || [];
                  const last = entries[entries.length - 1];
                  // Linked trackers: the latest reading of each. Taken together
                  // (same minute, same note) they read as one line.
                  const mates = groupOf(t);
                  const lasts = mates.map((m) => ({ name: m.idea, last: (m.tracker_entries || []).slice(-1)[0] })).filter((x) => x.last);
                  const together = lasts.length > 1 && lasts.every((x) => Math.abs(rowMs(x.last.at) - rowMs(lasts[0].last.at)) < 2 * 60 * 1000 && (x.last.note || '') === (lasts[0].last.note || ''));
                  const line = (text, at, note) => (
                    <p className={`text-sm break-words ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span className="font-semibold">{text}</span>
                      <span className="text-gray-500"> · {formatLogTime(at)}</span>
                      {note ? <span className="block text-xs text-gray-500 italic">{note}</span> : null}
                    </p>
                  );
                  return (
                    <div className={`mt-2 p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-900/50' : 'bg-white/70'}`}>
                      {mates.length > 1 && lasts.length ? (
                        together
                          ? line(lasts.map((x) => x.last.text).join(' · '), lasts[0].last.at, lasts[0].last.note)
                          : <div className="space-y-1">{lasts.map((x) => <React.Fragment key={x.name}>{line(`${x.name} ${x.last.text}`, x.last.at, x.last.note)}</React.Fragment>)}</div>
                      ) : last ? (
                        line(last.text, last.at, last.note)
                      ) : (
                        <p className="text-sm text-gray-500">Nothing logged yet.</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {t.tracker_remind && t.tracker_remind !== 'none' ? `🔔 ${remindLabel(t)}` : 'No reminder'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button size="sm" onClick={() => { setLogText(""); setLogFor(t); }} className="bg-purple-600 hover:bg-purple-700 text-white">
                          <Plus className="w-4 h-4 mr-1" />
                          Log
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setHistoryFor(t)}>
                          History
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openRemind(t)}>
                          <Bell className="w-4 h-4 mr-1" />
                          Reminder
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {group.subIdeas.length > 0 && (
                  <div className="ml-6 space-y-2 mt-4">
                    {group.subIdeas.map((subIdea, index) => {
                      const format = group.parent.list_format || 'plain';
                      const checkedItems = group.parent.checked_items || [];
                      const isChecked = checkedItems.includes(index);
                      
                      return (
                        <div key={subIdea.id} className={`flex items-start justify-between p-3 rounded-lg ${
                          theme === 'dark' ? 'bg-gray-900/50' : 'bg-gray-50'
                        }`}>
                          <div className="flex items-start gap-2 flex-1">
                            {format === 'checkbox' ? (
                              <>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={async () => {
                                    const newCheckedItems = isChecked
                                      ? checkedItems.filter(i => i !== index)
                                      : [...checkedItems, index];
                                    await base44.entities.ParkingLotIdea.update(group.parent.id, {
                                      checked_items: newCheckedItems
                                    });
                                    queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                                  }}
                                  className="mt-0.5 rounded cursor-pointer"
                                />
                                <p className={`flex-1 text-sm ${
                                  isChecked ? 'line-through text-gray-400' : ''
                                } ${
                                  specialMode !== 'normal' ? `${specialMode}-text` :
                                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  {subIdea.idea}
                                </p>
                              </>
                            ) : format === 'numbered' ? (
                              <p className={`flex-1 text-sm ${
                                specialMode !== 'normal' ? `${specialMode}-text` :
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                {index + 1}. {subIdea.idea}
                              </p>
                            ) : (
                              <p className={`flex-1 text-sm ${
                                specialMode !== 'normal' ? `${specialMode}-text` :
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                • {subIdea.idea}
                              </p>
                            )}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-6 w-6">
                                <MoreVertical className="w-3 h-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-2">
                              <div className="space-y-1">
                                <button
                                  onClick={() => handleConvertToTask(subIdea)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Convert to Task
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingIdea(subIdea);
                                    setEditText(subIdea.idea);
                                    setEditCategory(subIdea.category || "misc");
                                    setShowEditModal(true);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                                >
                                  <Pencil className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(subIdea.id)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 rounded flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    })}
                    
                    {/* Manual add to list */}
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const input = e.target.elements.subidea.value;
                      if (!input.trim()) return;
                      await base44.entities.ParkingLotIdea.create({
                        idea: input.trim(),
                        parent_idea_id: group.parent.id,
                        converted_to_task: false
                      });
                      queryClient.invalidateQueries({ queryKey: ['parkingLotIdeas'] });
                      e.target.reset();
                    }} className="flex gap-2">
                      <Input
                        name="subidea"
                        placeholder="Add item to this list..."
                        className="flex-1 h-9 text-sm"
                      />
                      <Button type="submit" size="icon" className="h-9 w-9 flex-shrink-0">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                )}

                {/* Pictures */}
                {group.parent.pictures && group.parent.pictures.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {group.parent.pictures.map((pic, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={pic}
                          alt="Idea attachment"
                          className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setViewingImage(pic)}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePicture(group.parent.id, pic);
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes Preview — tap to open full notes dialog */}
                {(() => {
                  const ideaNotes = allNotes.filter(n => n.idea_id === group.parent.id);
                  const latestNote = ideaNotes[0];
                  const previewText = latestNote
                    ? stripHtml(latestNote.content)
                    : (group.parent.notes || '');
                  const hasContent = previewText.length > 0;

                  return (
                    <button
                      onClick={() => setNotesDialogIdea(group.parent)}
                      className={`mt-4 w-full text-left p-3 rounded-lg text-sm transition-colors ${
                        hasContent
                          ? (theme === 'dark'
                              ? 'bg-gray-900/50 text-gray-300 hover:bg-gray-900/70'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100')
                          : (theme === 'dark'
                              ? 'bg-gray-900/30 text-gray-500 hover:bg-gray-900/50 border border-dashed border-gray-700'
                              : 'bg-transparent text-gray-400 hover:bg-gray-50 border border-dashed border-gray-300')
                      }`}
                    >
                      {hasContent ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            {ideaNotes.length > 0 && (
                              <span className="text-xs text-gray-400">
                                {ideaNotes.length} note{ideaNotes.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-2">{previewText}</p>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Add notes...</span>
                        </div>
                      )}
                    </button>
                  );
                })()}

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNotesDialogIdea(group.parent)}
                    className="flex items-center gap-1"
                  >
                    <FileText className="w-4 h-4" />
                    Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(group.parent.id)}
                    className="flex items-center gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                  <label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePictureUpload(group.parent.id, file);
                      }}
                      className="hidden"
                      disabled={isUploadingPicture === group.parent.id}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isUploadingPicture === group.parent.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.currentTarget.previousElementSibling?.click();
                      }}
                    >
                      {isUploadingPicture === group.parent.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </Button>
                  </label>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Idea Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Edit Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Edit your idea"
              className={`min-h-[120px] ${theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}`}
              autoFocus
            />
            <Select value={editCategory} onValueChange={setEditCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work">Work</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="creative">Creative</SelectItem>
                <SelectItem value="learning">Learning</SelectItem>
                <SelectItem value="health">Health</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="home">Home</SelectItem>
                <SelectItem value="misc">Miscellaneous</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowEditModal(false);
                setEditingIdea(null);
                setEditText("");
                setEditCategory("misc");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleEditIdea} disabled={!editText.trim() || editIdeaMutation.isLoading}>
              {editIdeaMutation.isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trackers: "remind you to log?", the log, and the history. */}
      <Dialog open={remindShown} onOpenChange={(o) => { if (!o) setRemindFor(null); }}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Want a reminder to log {remindFor?.idea}?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {[['none', 'No'], ['daily', 'Every day'], ['weekly', 'Once a week'], ['monthly', 'Once a month']].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={remindChoice === value ? 'default' : 'outline'}
                disabled={trackerBusy}
                onClick={() => (value === 'none' ? saveReminder(remindFor, 'none', null) : setRemindChoice(value))}
                className={remindChoice === value && value !== 'none' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
              >
                {label}
              </Button>
            ))}
          </div>
          {remindChoice !== 'none' && (
            <div className="space-y-2">
              <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>What time?</label>
              <Input type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} />
              <p className="text-xs text-gray-500">
                {remindLabel({ tracker_remind: remindChoice, tracker_remind_time: remindTime, tracker_remind_day: remindDayFor(remindFor, remindChoice) })}
              </p>
              <Button
                onClick={() => saveReminder(remindFor, remindChoice, remindTime)}
                disabled={trackerBusy || !remindTime}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {trackerBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => { if (!o) { setLogFor(null); setLogText(""); } }}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Log: {logFor ? groupTitle(logFor) : ''}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            placeholder={logFor && groupOf(logFor).length > 1 ? `e.g. ${groupOf(logFor).map((t) => t.idea).join(' and ')}, plus anything about the moment` : "What do you want to log?"}
            className={`min-h-[90px] ${theme === 'dark' ? 'bg-gray-800 text-gray-100 border-gray-700' : ''}`}
            autoFocus
          />
          {(() => {
            const last = (logFor?.tracker_entries || []).slice(-1)[0];
            return last ? <p className="text-xs text-gray-500">Last time: {last.text}{last.note ? ` — ${last.note}` : ''} · {formatLogTime(last.at)}</p> : null;
          })()}
          <Button onClick={saveLog} disabled={trackerBusy || !logText.trim()} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            {trackerBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => { if (!o) setHistoryFor(null); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{[historyFor?.idea, ...((historyFor?.tracker_companions || []).map((id) => ideas.find((i) => i.id === id && i.tracker)?.idea).filter(Boolean))].join(' · ')}</DialogTitle>
          </DialogHeader>
          {(() => {
            // One chart for this tracker and the ones its readings arrive with
            // (tracker_companions): every entry is a row in time order, each
            // line drawn through its own rows (connectNulls bridges the rest).
            const companions = (historyFor?.tracker_companions || []).map((id) => ideas.find((i) => i.id === id && i.tracker)).filter(Boolean);
            const series = [historyFor, ...companions].filter(Boolean).map((t, i) => ({ key: `s${i}`, name: t.idea, entries: t.tracker_entries || [] }));
            const colors = ['#9333ea', '#ec4899', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#14b8a6'];
            const rows = [];
            const lines = [];
            let color = 0;
            for (const sr of series) {
              let hasB = false;
              for (const e of sr.entries) {
                const n = trackerNumbers(e.text);
                const ms = rowMs(e.at);
                if (n[0] == null || !Number.isFinite(ms)) continue;
                const row = { ms, label: new Date(ms).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), [`${sr.key}a`]: n[0] };
                if (n[1] != null) { row[`${sr.key}b`] = n[1]; hasB = true; }
                rows.push(row);
              }
              // A pair's two lines get their own names: blood pressure is
              // systolic and diastolic, not "blood pressure" twice.
              const isBp = /blood\s*pressure|\bbp\b/i.test(sr.name);
              const [nameA, nameB] = hasB ? (isBp ? ['systolic', 'diastolic'] : [`${sr.name} · 1st number`, `${sr.name} · 2nd number`]) : [sr.name, ''];
              lines.push({ key: `${sr.key}a`, name: nameA, color: colors[color++ % colors.length] });
              if (hasB) lines.push({ key: `${sr.key}b`, name: nameB, color: colors[color++ % colors.length] });
            }
            rows.sort((x, y) => x.ms - y.ms);
            // Readings taken together (one sentence: blood pressure, then
            // heart rate a second later) share one spot on the time line,
            // so their dots sit in the same vertical line. Two readings of
            // the SAME thing never merge, however close.
            const points = [];
            for (const r of rows) {
              const last = points[points.length - 1];
              const keys = Object.keys(r).filter((k) => k !== 'ms' && k !== 'label');
              if (last && r.ms - last.ms < 2 * 60 * 1000 && keys.every((k) => !(k in last))) {
                for (const k of keys) last[k] = r[k];
              } else {
                points.push({ ...r });
              }
            }
            // Several readings on one day: the first carries the date and the
            // rest the time of day ("10/14", "2:03 PM", "4:07 PM"), so a day of
            // readings isn't four ticks all saying "10/14" (Anna, Oct 14 2026).
            const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
            const perDay = {};
            for (const p of points) perDay[dayKey(p.ms)] = (perDay[dayKey(p.ms)] || 0) + 1;
            const seenDay = {};
            for (const p of points) {
              const k = dayKey(p.ms);
              seenDay[k] = (seenDay[k] || 0) + 1;
              if (perDay[k] > 1 && seenDay[k] > 1) p.label = new Date(p.ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            }
            // The tooltip names the moment in full either way.
            const whenOf = (label, payload) => { const ms = payload?.[0]?.payload?.ms; return Number.isFinite(ms) ? formatLogTime(new Date(ms).toISOString()) : label; };
            const axis = niceTicks(points.flatMap((r) => lines.map((l) => r[l.key])));
            return (
              <>
                {points.length >= 2 && (
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={axis ? axis.domain : ['auto', 'auto']} ticks={axis ? axis.ticks : undefined} />
                        <ChartTooltip labelFormatter={whenOf} />
                        {lines.length > 1 && <ChartLegend wrapperStyle={{ fontSize: 11 }} />}
                        {lines.map((l) => (
                          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {(() => {
                  // Every tracker in the linked group, newest first. Readings
                  // taken together (one sentence, so within a couple of
                  // minutes, one per tracker) show as ONE record — "blood
                  // pressure 98/70 · heart rate 89 bpm" — the way Anna liked
                  // the old single entry that held both (Oct 14 2026).
                  const flat = [historyFor, ...companions].filter(Boolean)
                    .flatMap((t) => (t.tracker_entries || []).map((e) => ({ e, t })))
                    .sort((x, y) => rowMs(y.e.at) - rowMs(x.e.at));
                  const records = [];
                  for (const item of flat) {
                    const last = records[records.length - 1];
                    const close = last && Math.abs(rowMs(last.parts[0].e.at) - rowMs(item.e.at)) < 2 * 60 * 1000;
                    if (close && !last.parts.some((p) => p.t.id === item.t.id)) last.parts.push(item);
                    else records.push({ parts: [item] });
                  }
                  const removeRecord = async (rec) => { for (const { e, t } of rec.parts) await removeTrackerEntry(t, e); };
                  return records.length === 0 ? (
                    <p className="text-sm text-gray-500">Nothing logged yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {records.map((rec, i) => {
                        const first = rec.parts[0];
                        const note = rec.parts.map((p) => p.e.note).find(Boolean) || '';
                        return (
                          <div key={`${first.t.id}-${first.e.at}-${i}`} className={`flex items-start justify-between gap-2 p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                            <div className="min-w-0">
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {rec.parts.map((p, j) => (
                                  <React.Fragment key={p.t.id}>
                                    {j > 0 ? <span className="text-gray-400"> · </span> : null}
                                    {companions.length > 0 ? <span className="text-gray-500">{p.t.idea} </span> : null}{p.e.text}
                                  </React.Fragment>
                                ))}
                              </p>
                              {note ? <p className="text-xs text-gray-500 italic whitespace-pre-wrap break-words">{note}</p> : null}
                              <p className="text-xs text-gray-500">{formatLogTime(first.e.at)}</p>
                            </div>
                            <button onClick={() => removeRecord(rec)} className="text-gray-400 hover:text-red-600 p-1 flex-shrink-0" aria-label="Remove this entry">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            );
          })()}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => { const t = historyFor; setHistoryFor(null); openRemind(t); }}>
              <Bell className="w-4 h-4 mr-1" />
              {historyFor?.tracker_remind && historyFor.tracker_remind !== 'none' ? remindLabel(historyFor) : 'Reminder'}
            </Button>
            <Button onClick={() => { const t = historyFor; setHistoryFor(null); setLogText(""); setLogFor(t); }} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Log
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <IdeaNotesDialog
        idea={notesDialogIdea}
        isOpen={!!notesDialogIdea}
        onClose={() => setNotesDialogIdea(null)}
        theme={theme}
      />

      <ImageViewer
        imageUrl={viewingImage}
        isOpen={!!viewingImage}
        onClose={() => setViewingImage(null)}
      />

      <div className="flex justify-center pt-4">
        <WeeklyEgg slot={3} type="ideas" />
      </div>

      <div style={{ paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }} aria-hidden="true"></div>
    </div>
  );
}