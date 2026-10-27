import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskCard from "./TaskCard";
import { isBirthdayTask } from "../utils/birthdayHelpers";

const SECTIONS = [
  { key: "today", label: "Today" },
  { key: "backburner", label: "🔥 Back Burner" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "next7days", label: "Next 7 Days" },
  { key: "upcoming", label: "Upcoming" },
  { key: "later", label: "Later" },
  { key: "birthdays", label: "🎂 Birthdays" },
];

// Shared logic: a task's relevant date. A repeating task sits in the section
// for the day its next occurrence falls on — finishing it moves it to the
// next one — rather than in a separate "Recurring" pile. Birthdays are the
// exception: they get their own section at the bottom.
function getTaskMeta(task) {
  if (isBirthdayTask(task)) return { birthday: true };

  const reminderDate = task.next_reminder ? new Date(task.next_reminder) : null;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const startDate = task.start_date ? new Date(task.start_date) : null;
  // If start_date is set, use it as the relevant date — the task is "in progress"
  // from start through due and should appear in Today's section once started.
  return { birthday: false, relevantDate: startDate || dueDate || reminderDate };
}

// Birthdays list soonest first.
const birthdayWhen = (t) => new Date(t.next_reminder || t.due_date || 0).getTime();
const sortBirthdays = (list) => list.sort((a, b) => birthdayWhen(a) - birthdayWhen(b));

// Categorize into named sections (section view)
function categorizeTask(task) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthAhead = new Date(today);
  monthAhead.setDate(monthAhead.getDate() + 30);

  const { birthday, relevantDate } = getTaskMeta(task);
  if (birthday) return "birthdays";
  if (!relevantDate) return "today";

  const taskDay = new Date(
    relevantDate.getFullYear(),
    relevantDate.getMonth(),
    relevantDate.getDate()
  );

  if (taskDay <= today) return "today";
  if (taskDay.getTime() === tomorrow.getTime()) return "tomorrow";
  if (taskDay < weekAhead) return "next7days";
  if (taskDay < monthAhead) return "upcoming";
  return "later";
}

// Categorize into a specific day index (0-6) or upcoming/later/birthdays (day view)
function categorizeTaskByDay(task) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthAhead = new Date(today);
  monthAhead.setDate(monthAhead.getDate() + 30);

  const { birthday, relevantDate } = getTaskMeta(task);
  if (birthday) return "birthdays";
  if (!relevantDate) return 0;

  const taskDay = new Date(
    relevantDate.getFullYear(),
    relevantDate.getMonth(),
    relevantDate.getDate()
  );

  if (taskDay <= today) return 0;
  const dayDiff = Math.round(
    (taskDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (dayDiff <= 6) return dayDiff;
  if (taskDay < monthAhead) return "upcoming";
  return "later";
}

// Build the 7 named day sections for the day view
function buildDaySections() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sections = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
    let label = dayName;
    if (i === 0) label = `${dayName} · Today`;
    else if (i === 1) label = `${dayName} · Tomorrow`;
    sections.push({ key: `day_${i}`, label });
    if (i === 0) sections.push({ key: "backburner", label: "🔥 Back Burner" });
  }
  sections.push({ key: "upcoming", label: "Upcoming" });
  sections.push({ key: "later", label: "Later" });
  sections.push({ key: "birthdays", label: "🎂 Birthdays" });
  return sections;
}

export default function TaskSections({
  tasks,
  allTasks,
  theme,
  onRefreshTasks,
  onEditTitle,
  onEdit,
  onComplete,
  onUncomplete,
  onSnooze,
  onShowDetails,
  onDelete,
  onAddTask,
  onUpdateTask,
  isSeasonalTheme,
  specialMode,
  viewMode = "sections",
}) {
  // Which sections the person opened or closed, remembered on this phone
  // (Anna, Oct 27 2026: "if someone has upcoming and other things collapsed
  // or expanded on their tasks page, make sure it stays that way"). It used
  // to reset to the defaults on every visit. Day sections in the Days view
  // have keys that change daily (day_0, day_1...), so those still start from
  // the defaults; the named sections (today, upcoming, later, birthdays,
  // backburner...) keep their state.
  const COLLAPSED_KEY = "tasks_sections_collapsed";
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch (e) { return {}; }
  });

  const { sections, grouped } = useMemo(() => {
    if (viewMode === "days") {
      const daySections = buildDaySections();
      const map = {};
      daySections.forEach((s) => (map[s.key] = []));
      tasks.forEach((task) => {
        if (task.silenced) {
          map.backburner.push(task);
          return;
        }
        const cat = categorizeTaskByDay(task);
        if (typeof cat === "number") map[`day_${cat}`].push(task);
        else map[cat].push(task);
      });
      sortBirthdays(map.birthdays);
      return { sections: daySections, grouped: map };
    }

    const map = {
      today: [],
      tomorrow: [],
      next7days: [],
      upcoming: [],
      later: [],
      birthdays: [],
      backburner: [],
    };
    tasks.forEach((task) => {
      if (task.silenced) {
        map.backburner.push(task);
        return;
      }
      const section = categorizeTask(task);
      map[section].push(task);
    });
    sortBirthdays(map.birthdays);
    return { sections: SECTIONS, grouped: map };
  }, [tasks, viewMode]);

  const getSubtasks = (taskId) =>
    allTasks
      .filter((t) => t.parent_task_id === taskId)
      .sort((a, b) => {
        const ao = typeof a.subtask_order === "number" ? a.subtask_order : 9999;
        const bo = typeof b.subtask_order === "number" ? b.subtask_order : 9999;
        if (ao !== bo) return ao - bo;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });

  // Back Burner, Birthdays and an empty day start closed; the rest open.
  const defaultCollapsed = (key) =>
    key === "backburner" || key === "birthdays" || (viewMode === "days" && (grouped[key] || []).length === 0);

  const toggleSection = (key) =>
    setCollapsed((prev) => {
      // The first tap on a section with no saved state flips its DEFAULT
      // (Back Burner, empty days and Birthdays start closed; the rest open).
      const current = prev[key] !== undefined ? prev[key] : defaultCollapsed(key);
      const next = { ...prev, [key]: !current };
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch (e) { /* no storage */ }
      return next;
    });

  const getSectionDate = (sectionKey) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (viewMode === 'days') {
      const match = sectionKey.match(/^day_(\d+)$/);
      if (match) {
        const d = new Date(today);
        d.setDate(d.getDate() + parseInt(match[1], 10));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    } else {
      if (sectionKey === 'today') {
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }
      if (sectionKey === 'tomorrow') {
        const t = new Date(today);
        t.setDate(t.getDate() + 1);
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      }
    }
    return null;
  };

  const renderTaskCard = (task) => (
    <TaskCard
      key={task.id}
      task={task}
      theme={theme}
      onRefreshTasks={onRefreshTasks}
      onUpdateTask={onUpdateTask}
      onEditTitle={onEditTitle}
      onEdit={onEdit}
      onComplete={onComplete}
      onUncomplete={onUncomplete}
      onSnooze={onSnooze}
      onShowDetails={onShowDetails}
      onDelete={onDelete}
      subtaskCount={allTasks.filter((t) => t.parent_task_id === task.id).length}
      completedSubtaskCount={
        allTasks.filter(
          (t) => t.parent_task_id === task.id && t.status === "completed"
        ).length
      }
      subtasks={getSubtasks(task.id)}
    />
  );

  return (
    <div className="space-y-1">
      {sections.map((section) => {
        const sectionTasks = grouped[section.key] || [];
        // Back Burner: hidden when empty, collapsed by default so it stays
        // present without taking over the screen.
        if (section.key === "backburner" && sectionTasks.length === 0) return null;
        // Empty day sections start collapsed too — an expanded empty day is just
        // noise. Tapping the header still expands it to reveal "Add task...".
        // Birthdays start collapsed as well (Anna, Oct 24 2026): a synced
        // calendar can bring in dozens at once, and they're not today's work.
        // The header shows the count, and one tap opens or closes the list.
        // (Before Oct 27 2026 the first tap on a closed-by-default section
        // wrote `true` and it took a second tap to open it.)
        const isCollapsed =
          collapsed[section.key] !== undefined
            ? collapsed[section.key]
            : defaultCollapsed(section.key);

        return (
          <div
            key={section.key}
            className="border-b border-gray-200 dark:border-gray-700 last:border-0"
          >
            <button
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center gap-2 py-3 px-1 active:bg-gray-100/70 dark:active:bg-gray-700/40 rounded-lg transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <span
                className={`font-semibold text-sm ${
                  isSeasonalTheme()
                    ? `${specialMode}-text`
                    : theme === "dark"
                      ? "text-gray-200"
                      : "text-gray-700"
                }`}
              >
                {section.label}
              </span>
              <span className="text-xs text-gray-400 ml-1">
                {sectionTasks.length > 0 && `(${sectionTasks.length})`}
              </span>
            </button>

            {/* No left indent on the rows: it pushed every card right of the
                page's own cards and filters (Anna, Oct 3 2026). */}
            {!isCollapsed && (
              <div className="px-1 pb-2 space-y-2">
                {sectionTasks.map(renderTaskCard)}
                {sectionTasks.length === 0 && (
                  <button
                    onClick={() => onAddTask(getSectionDate(section.key))}
                    className="text-sm text-gray-400 hover:text-gray-600 py-2 flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add task...
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}