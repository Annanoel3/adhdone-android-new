import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskCard from "./TaskCard";

const SECTIONS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "next7days", label: "Next 7 Days" },
  { key: "upcoming", label: "Upcoming" },
  { key: "later", label: "Later" },
  { key: "recurring", label: "Recurring" },
];

// Shared logic: determine if a task is recurring, and its relevant date.
function getTaskMeta(task) {
  const hasDueDate = !!task.due_date;
  const isRollingReminder =
    task.reminder_interval &&
    ["daily", "every_other_day"].includes(task.reminder_interval) &&
    !hasDueDate;

  if (
    (task.recurrence_pattern && task.recurrence_pattern !== "none") ||
    isRollingReminder
  )
    return { recurring: true };

  const reminderDate = task.next_reminder ? new Date(task.next_reminder) : null;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const startDate = task.start_date ? new Date(task.start_date) : null;
  // If start_date is set, use it as the relevant date — the task is "in progress"
  // from start through due and should appear in Today's section once started.
  return { recurring: false, relevantDate: startDate || dueDate || reminderDate };
}

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

  const { recurring, relevantDate } = getTaskMeta(task);
  if (recurring) return "recurring";
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

// Categorize into a specific day index (0-6) or upcoming/later/recurring (day view)
function categorizeTaskByDay(task) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthAhead = new Date(today);
  monthAhead.setDate(monthAhead.getDate() + 30);

  const { recurring, relevantDate } = getTaskMeta(task);
  if (recurring) return "recurring";
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
  }
  sections.push({ key: "upcoming", label: "Upcoming" });
  sections.push({ key: "later", label: "Later" });
  sections.push({ key: "recurring", label: "Recurring" });
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
  const [collapsed, setCollapsed] = useState({});

  const { sections, grouped } = useMemo(() => {
    if (viewMode === "days") {
      const daySections = buildDaySections();
      const map = {};
      daySections.forEach((s) => (map[s.key] = []));
      tasks.forEach((task) => {
        if (task.classification === "birthday" || task.birthday_person) return;
        const cat = categorizeTaskByDay(task);
        if (typeof cat === "number") map[`day_${cat}`].push(task);
        else map[cat].push(task);
      });
      return { sections: daySections, grouped: map };
    }

    const map = {
      today: [],
      tomorrow: [],
      next7days: [],
      upcoming: [],
      later: [],
      recurring: [],
    };
    tasks.forEach((task) => {
      if (task.classification === "birthday" || task.birthday_person) return;
      const section = categorizeTask(task);
      map[section].push(task);
    });
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

  const toggleSection = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

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
        const isCollapsed = collapsed[section.key];

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

            {!isCollapsed && (
              <div className="pl-6 pb-2 space-y-2">
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