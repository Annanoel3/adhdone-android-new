import React, { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskCard from "./TaskCard";

const SECTIONS = [
  { key: "today", label: "Today" },
  { key: "next7days", label: "Next 7 Days" },
  { key: "upcoming", label: "Upcoming" },
  { key: "later", label: "Later" },
  { key: "recurring", label: "Recurring" },
];

function categorizeTask(task) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const monthAhead = new Date(today);
  monthAhead.setDate(monthAhead.getDate() + 30);

  // Recurring = explicit recurrence pattern, OR a rolling reminder interval
  // (daily/every-other-day) with no due date (those roll forward when completed)
  const hasDueDate = !!task.due_date;
  const isRollingReminder =
    task.reminder_interval &&
    ["daily", "every_other_day"].includes(task.reminder_interval) &&
    !hasDueDate;

  if (
    (task.recurrence_pattern && task.recurrence_pattern !== "none") ||
    isRollingReminder
  )
    return "recurring";

  const reminderDate = task.next_reminder ? new Date(task.next_reminder) : null;
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const relevantDate = dueDate || reminderDate;

  // No due date → Today (available to do now)
  if (!relevantDate) return "today";

  const taskDay = new Date(
    relevantDate.getFullYear(),
    relevantDate.getMonth(),
    relevantDate.getDate()
  );

  // Due today or overdue → Today
  if (taskDay <= today) return "today";

  // Next 7 days
  if (taskDay >= tomorrow && taskDay < weekAhead) return "next7days";

  // Upcoming (beyond 7 days, within 30 days)
  if (taskDay >= weekAhead && taskDay < monthAhead) return "upcoming";

  // Later (beyond 30 days)
  return "later";
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
  isSeasonalTheme,
  specialMode,
}) {
  const [collapsed, setCollapsed] = useState({});

  const grouped = useMemo(() => {
    const map = { today: [], next7days: [], upcoming: [], later: [], recurring: [] };
    tasks.forEach((task) => {
      const section = categorizeTask(task);
      map[section].push(task);
    });
    return map;
  }, [tasks]);

  const getSubtasks = (taskId) => allTasks.filter((t) => t.parent_task_id === taskId);

  const toggleSection = (key) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const cardClasses = isSeasonalTheme()
    ? `${specialMode}-card`
    : theme === "dark"
      ? "bg-gray-800/90 backdrop-blur-sm border-gray-700"
      : theme === "spicybrains"
        ? "bg-gradient-to-br from-pink-100 to-purple-100 border-pink-300"
        : "bg-white border-gray-200";

  const renderTaskCard = (task) => (
    <TaskCard
      key={task.id}
      task={task}
      theme={theme}
      onRefreshTasks={onRefreshTasks}
      onEditTitle={onEditTitle}
      onEdit={onEdit}
      onComplete={onComplete}
      onUncomplete={onUncomplete}
      onSnooze={onSnooze}
      onShowDetails={onShowDetails}
      onDelete={onDelete}
      subtaskCount={allTasks.filter((t) => t.parent_task_id === task.id).length}
      completedSubtaskCount={
        allTasks.filter((t) => t.parent_task_id === task.id && t.status === "completed").length
      }
      subtasks={getSubtasks(task.id)}
    />
  );

  return (
    <div className="space-y-1">
      {SECTIONS.map((section) => {
        const sectionTasks = grouped[section.key];
        const isCollapsed = collapsed[section.key];

        return (
          <div key={section.key} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
            <button
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center gap-2 py-3 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
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
                    onClick={onAddTask}
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