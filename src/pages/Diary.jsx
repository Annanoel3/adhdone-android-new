import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Lock, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import DiaryFirstRunDialog from "@/components/diary/DiaryFirstRunDialog";
import MoodPromptCard from "@/components/diary/MoodPromptCard";
import DiaryEditor from "@/components/diary/DiaryEditor";
import DiaryEntryCard from "@/components/diary/DiaryEntryCard";

const todayKey = () => format(new Date(), "yyyy-MM-dd");

export default function Diary() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [todayEntry, setTodayEntry] = useState(null);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [showMoodPrompt, setShowMoodPrompt] = useState(false);
  const [completedToday, setCompletedToday] = useState([]);

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);

    const all = await base44.entities.DiaryEntry.list("-entry_date", 100);
    const key = todayKey();
    const today = all.find((e) => e.entry_date === key) || null;
    setEntries(all.filter((e) => e.entry_date !== key));
    setTodayEntry(today);

    if (!me.diary_setup_done) {
      setShowFirstRun(true);
    } else if (!today && me.diary_autofill_enabled) {
      setCompletedToday(await loadCompletedToday());
      setShowMoodPrompt(true);
    }

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

  const handleFirstRunChoice = async (autofillEnabled) => {
    await base44.auth.updateMe({
      diary_setup_done: true,
      diary_autofill_enabled: autofillEnabled,
    });
    setUser((u) => ({ ...u, diary_setup_done: true, diary_autofill_enabled: autofillEnabled }));
    setShowFirstRun(false);
    if (autofillEnabled && !todayEntry) {
      setCompletedToday(await loadCompletedToday());
      setShowMoodPrompt(true);
    }
  };

  const toggleAutofill = async (enabled) => {
    setUser((u) => ({ ...u, diary_autofill_enabled: enabled }));
    await base44.auth.updateMe({ diary_autofill_enabled: enabled });
  };

  const createTodayEntry = async ({ moodAnswer, tasks }) => {
    const lines = [];
    if (moodAnswer) lines.push(moodAnswer);
    if (tasks?.length) {
      lines.push("", "Today I finished:");
      tasks.forEach((t) => lines.push(`\u2713 ${t}`));
      lines.push("");
    }
    const entry = await base44.entities.DiaryEntry.create({
      entry_date: todayKey(),
      content: lines.join("\n"),
      mood_answer: moodAnswer || "",
      autofilled_tasks: tasks || [],
    });
    setTodayEntry(entry);
    setShowMoodPrompt(false);
  };

  const saveTodayContent = async (content) => {
    if (todayEntry) {
      const updated = await base44.entities.DiaryEntry.update(todayEntry.id, { content });
      setTodayEntry(updated);
    } else {
      const created = await base44.entities.DiaryEntry.create({
        entry_date: todayKey(),
        content,
      });
      setTodayEntry(created);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Diary</h1>
        <p className="flex items-center gap-1.5 text-sm text-gray-600 mt-1">
          <Lock className="w-3.5 h-3.5" />
          Private to you — no AI, no partners, no sharing unless you save it yourself.
        </p>
      </div>

      {showMoodPrompt && !todayEntry ? (
        <MoodPromptCard
          onAnswer={(answer) => createTodayEntry({ moodAnswer: answer, tasks: completedToday })}
          onSkip={() => createTodayEntry({ moodAnswer: "", tasks: completedToday })}
        />
      ) : (
        <DiaryEditor entry={todayEntry} onSave={saveTodayContent} />
      )}

      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="diary-autofill-pref" className="text-sm font-medium">
            Give me a head start
          </Label>
          <p className="text-xs text-gray-600">
            New entries open with the tasks you finished and a "how did today go?" prompt.
          </p>
        </div>
        <Switch
          id="diary-autofill-pref"
          checked={!!user?.diary_autofill_enabled}
          onCheckedChange={toggleAutofill}
        />
      </div>

      {entries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Past entries</h2>
          {entries.map((entry) => (
            <DiaryEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <DiaryFirstRunDialog open={showFirstRun} onChoose={handleFirstRunChoice} />
    </div>
  );
}