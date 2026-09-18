import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Lock, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import DiaryFirstRunDialog from "@/components/diary/DiaryFirstRunDialog";
import DiaryEditor from "@/components/diary/DiaryEditor";
import DiaryEntryRow from "@/components/diary/DiaryEntryRow";

const todayKey = () => format(new Date(), "yyyy-MM-dd");

export default function Diary() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [completedToday, setCompletedToday] = useState([]);
  const [prefill, setPrefill] = useState("");
  // null = list view. Otherwise the entry being written (may be a brand-new one).
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);
    setEntries(await base44.entities.DiaryEntry.list("-entry_date", 200));
    if (!me.diary_setup_done) setShowFirstRun(true);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const loadCompletedToday = async () => {
    const key = todayKey();
    const completed = await base44.entities.Task.filter({ status: "completed" }, "-completed_at", 100);
    return completed
      .filter((t) => t.completed_at && format(new Date(t.completed_at), "yyyy-MM-dd") === key)
      .map((t) => t.title);
  };

  // Head start = the entry opens with today's finished tasks already at the top.
  const buildHeadStart = (tasks) => {
    if (!tasks?.length) return "";
    return ["Today I finished:", ...tasks.map((t) => `\u2713 ${t}`), "", ""].join("\n");
  };

  const handleFirstRunChoice = async (autofillEnabled) => {
    await base44.auth.updateMe({
      diary_setup_done: true,
      diary_autofill_enabled: autofillEnabled,
    });
    setUser((u) => ({ ...u, diary_setup_done: true, diary_autofill_enabled: autofillEnabled }));
    setShowFirstRun(false);
  };

  const toggleAutofill = async (enabled) => {
    setUser((u) => ({ ...u, diary_autofill_enabled: enabled }));
    await base44.auth.updateMe({ diary_autofill_enabled: enabled });
  };

  // The + button: open today's entry if it already exists, otherwise a fresh
  // page (with the head start pre-typed when that option is on).
  const startNewEntry = async () => {
    const key = todayKey();
    const existing = entries.find((e) => e.entry_date === key);
    if (existing) {
      setPrefill("");
      setEditing(existing);
      return;
    }
    if (user?.diary_autofill_enabled) {
      const tasks = await loadCompletedToday();
      setCompletedToday(tasks);
      setPrefill(buildHeadStart(tasks));
    } else {
      setCompletedToday([]);
      setPrefill("");
    }
    setEditing({ entry_date: key });
  };

  const saveEntry = async (patch) => {
    if (editing?.id) {
      const updated = await base44.entities.DiaryEntry.update(editing.id, patch);
      setEditing(updated);
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } else {
      const created = await base44.entities.DiaryEntry.create({
        entry_date: editing?.entry_date || todayKey(),
        autofilled_tasks: completedToday,
        ...patch,
      });
      setEditing(created);
      setEntries((prev) => [created, ...prev]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (editing) {
    return (
      <DiaryEditor
        entry={editing.id ? editing : null}
        dateKey={editing.entry_date}
        initialContent={prefill}
        onSave={saveEntry}
        onBack={() => {
          setEditing(null);
          setPrefill("");
        }}
      />
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Diary</h1>
          <p className="flex items-center gap-1.5 text-sm text-gray-600 mt-1">
            <Lock className="w-3.5 h-3.5" />
            Private to you — no AI, no partners, no sharing unless you save it yourself.
          </p>
        </div>
        <Button onClick={startNewEntry} size="icon" className="flex-shrink-0" aria-label="New entry">
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
          <p className="text-sm text-gray-600">No entries yet.</p>
          <Button onClick={startNewEntry}>
            <Plus className="w-4 h-4 mr-2" />
            Write today's entry
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <DiaryEntryRow
              key={entry.id}
              entry={entry}
              onOpen={(e) => {
                setPrefill("");
                setEditing(e);
              }}
            />
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="diary-autofill-pref" className="text-sm font-medium">
            Give me a head start
          </Label>
          <p className="text-xs text-gray-600">
            New entries open with the tasks you finished that day already written in.
          </p>
        </div>
        <Switch
          id="diary-autofill-pref"
          checked={!!user?.diary_autofill_enabled}
          onCheckedChange={toggleAutofill}
        />
      </div>

      <DiaryFirstRunDialog open={showFirstRun} onChoose={handleFirstRunChoice} />
    </div>
  );
}