import React, { useState, useEffect, useCallback } from "react";
import { Task } from "@/entities/Task";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Download, Loader2, List, CalendarDays } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import TaskDetailsModal from "../components/tasks/TaskDetailsModal";
import TaskEditModal from "../components/tasks/TaskEditModal";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";
import { snoozeTask, deleteTaskWithUndo } from "../components/utils/snoozeTask";
import { refreshAlarms } from "../components/utils/widgetBridge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTaskSort, sortTasks } from "@/hooks/useTaskSort";
import TaskSortDropdown from "../components/tasks/TaskSortDropdown";
import WeeklyStar from "../components/tasks/WeeklyStar";
import TaskSections from "../components/tasks/TaskSections";
import TaskCompletionCelebration from "../components/tasks/TaskCompletionCelebration";
import { isBirthdayTask } from "../components/utils/birthdayHelpers";
import { countCompletionForGif } from "../components/utils/completionMilestone";
import PullToRefresh from "../components/shared/PullToRefresh";
import { checkCompletionEggs } from "../components/eastereggs/completionEggs";
import { trackFire } from "@/lib/appTrack";

export default function Tasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [allTasks, setAllTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [statusFilter, setStatusFilter] = useState('active');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [specialMode, setSpecialMode] = useState('normal');
  const [activeTasks, setActiveTasks] = useState([]);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('tasks_view_mode') || 'sections');
  const [showCelebration, setShowCelebration] = useState(false);
  const { sortBy } = useTaskSort();

  useEffect(() => {
    localStorage.setItem('tasks_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    loadTasks();
    const handleTasksChanged = () => loadTasks();
    // Tasks captured from the native share sheet land while the app is in the
    // background — refetch whenever the app comes back to the foreground.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadTasks();
    };
    window.addEventListener('tasks-changed', handleTasksChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => {
      window.removeEventListener('tasks-changed', handleTasksChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  // Reload tasks when navigating back to this page with a reload state
  useEffect(() => {
    if (location.state?.reload) {
      loadTasks();
      // Clear the state so it doesn't reload again on every render
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Effect to update active and completed tasks whenever allTasks changes
  useEffect(() => {
    setActiveTasks(allTasks.filter(t => t.status === 'active' && !t.parent_task_id && !t.birthday_person));
    
    // Calculate tasks completed this week
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    
    const completedThisWeekCount = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at || t.birthday_person) return false;
      const completedDate = new Date(t.completed_at);
      return completedDate >= startOfWeek;
    }).length;
    
    setCompletedThisWeek(completedThisWeekCount);
  }, [allTasks]);

  const applyFilters = useCallback(() => {
    // Birthdays are listed here like any dated item — they sit in the section
    // for their day, on a birthday card, and can be filtered to on their own.
    // They are still birthdays, not tasks: the card says so.
    let topLevelTasks = allTasks.filter(t => !t.parent_task_id);
    let filtered = topLevelTasks.filter(t => t.status === statusFilter);
    
    if (urgencyFilter !== 'all') {
      filtered = filtered.filter(t => t.urgency === urgencyFilter);
    }

    if (typeFilter !== 'all') {
      if (typeFilter === 'task') {
        // "Tasks" = anything not tagged as an event, payment or birthday
        filtered = filtered.filter(t => (!t.classification || t.classification === 'task') && !isBirthdayTask(t));
      } else if (typeFilter === 'birthday') {
        filtered = filtered.filter(isBirthdayTask);
      } else {
        filtered = filtered.filter(t => t.classification === typeFilter);
      }
    }

    // Sort tasks using the shared sort preference
    setFilteredTasks(sortTasks(filtered, sortBy));
  }, [allTasks, statusFilter, urgencyFilter, typeFilter, sortBy]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const loadTasks = async () => {
    const fetchedTasks = await Task.list('-created_date', 500);
    setAllTasks(fetchedTasks);
  };

  // Opened with ?taskId= (e.g. tapping a task on the home-screen widget) —
  // show that task's details card once the tasks are loaded.
  const openedFromParamRef = React.useRef(false);
  useEffect(() => {
    if (openedFromParamRef.current || allTasks.length === 0) return;
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (!taskId) return;
    const found = allTasks.find(t => t.id === taskId);
    if (!found) return;
    openedFromParamRef.current = true;
    setSelectedTask(found);
    setIsDetailsModalOpen(true);
  }, [allTasks]);

  const handleTaskUpdate = (updatedTask) => {
    setAllTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
  };

  const handleComplete = async (task) => {
    // Already finished (a second tap, or the details card's button on a done
    // task): nothing to finish again — doing it made a second copy of a
    // repeating task.
    if (task.status === 'completed') return;

    // Confetti fires immediately — before any awaits. Only for real tasks.
    if (!task.parent_task_id) {
      setShowCelebration(false);
      requestAnimationFrame(() => setShowCelebration(true));
      setTimeout(() => setShowCelebration(false), 2200);
      countCompletionForGif();
      checkCompletionEggs(task);
    }

    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();

    // Optimistic — update UI instantly
    setAllTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, status: 'completed', completed_at: localISOString }
        : t.parent_task_id === task.id && t.status !== 'completed'
          ? { ...t, status: 'completed', completed_at: localISOString }
          : t
    ));

    // Its booked reminders are cancelled from here straight away, as Home and
    // the details card do. The server cancels them too, but only once the save
    // has landed and its clean-up has started, and a reminder booked for this
    // very minute (an hourly "keep reminding me" ping) went out in between.
    if (task.onesignal_notification_ids?.length) {
      import('../components/utils/reminderScheduler')
        .then(({ cancelScheduledReminder }) => cancelScheduledReminder(task.onesignal_notification_ids))
        .catch((error) => console.error("Failed to cancel reminders:", error));
    }

    // Save + side effects in the background
    (async () => {
      try {
        const { isAlreadyCompleted, createNextRecurrence } = await import('../components/utils/taskRecurrence');
        // The saved record, not the card: finished elsewhere (its
        // notification, another screen) already means its next copy exists.
        if (await isAlreadyCompleted(task)) {
          loadTasks();
          return;
        }
        await Task.update(task.id, { status: 'completed', completed_at: localISOString });
        // A finished task's alarms come off the phone now, not whenever Home
        // is next opened.
        refreshAlarms().catch(() => {});
        await updateTodaysSummary();
        const { completeSubtasks } = await import('../components/utils/subtaskCompletion');
        await completeSubtasks(task.id);
        if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
          const result = await createNextRecurrence(task);
          // Show the next occurrence the moment it exists — it lands in the
          // section for its day — rather than waiting on a full reload.
          if (result?.task) {
            setAllTasks(prev => prev.some(t => t.id === result.task.id) ? prev : [result.task, ...prev]);
          }
          if (result) loadTasks();
        }
      } catch (error) {
        console.error("Failed to complete task:", error);
        loadTasks();
      }
    })();
  };

  // `source` says which control did it (the card, a step on the card, …).
  const handleUncomplete = async (task, source = 'tasks_page') => {
    // Optimistic — update UI instantly
    setAllTasks(prev => prev.map(t =>
      t.id === task.id ? { ...t, status: 'active', completed_at: null } : t
    ));
    // Counted, so we can see how often a finished task is taken back (and
    // from where).
    trackFire('task_uncompleted', { props: { task_id: task.id, source } });

    (async () => {
      try {
        await Task.update(task.id, { status: 'active', completed_at: null });
        // Checking a repeating task off made its next occurrence; taking the
        // check back takes that copy back too (only while it's untouched) —
        // otherwise checking it again made a second one.
        const { removeNextRecurrence } = await import('../components/utils/taskRecurrence');
        const removedId = await removeNextRecurrence(task);
        if (removedId) setAllTasks(prev => prev.filter(t => t.id !== removedId));
        refreshAlarms().catch(() => {});
        await updateTodaysSummary();
      } catch (error) {
        console.error("Failed to uncomplete task:", error);
        loadTasks();
      }
    })();
  };

  const handleSnooze = async (task, minutes) => {
    // Optimistic — update UI instantly. The task stays ACTIVE and keeps its
    // date: a snooze adds one extra reminder, it doesn't move or hide anything.
    setAllTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, snooze_count: (t.snooze_count || 0) + 1, consecutive_snoozes: (t.consecutive_snoozes || 0) + 1 }
        : t
    ));

    // Shared helper: books ONE extra reminder at the snoozed time and counts
    // the snooze; everything else already booked stays put.
    snoozeTask(task, minutes).catch(error => {
      console.error("Failed to snooze task:", error);
      loadTasks();
    });
  };

  const handleDelete = async (task) => {
    // Optimistic — remove from UI instantly; the real delete waits five
    // seconds behind an Undo toast (undo reloads the list via 'tasks-changed').
    const subtasks = allTasks.filter(t => t.parent_task_id === task.id);
    setAllTasks(prev => prev.filter(t => t.id !== task.id && t.parent_task_id !== task.id));
    deleteTaskWithUndo(task, subtasks);
  };

  const getSubtaskCount = (taskId) => {
    return allTasks.filter(t => t.parent_task_id === taskId).length;
  };

  const getCompletedSubtaskCount = (taskId) => {
    return allTasks.filter(t => t.parent_task_id === taskId && t.status === 'completed').length;
  };

  const getTasksForExport = () => {
    return allTasks;
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const tasksToExport = getTasksForExport();
      console.log("Preparing to export tasks:", tasksToExport);
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert("PDF export simulated! Check console for tasks that would be exported.");
    } catch (error) {
      console.error("Failed to export PDF:", error);
      alert("Failed to export PDF due to an error.");
    } finally {
      setIsExporting(false);
    }
  };

  const isSeasonalTheme = () => {
    return ['christmas', 'valentines', 'newyears', 'stpatricks', 'fourthjuly', 'summer', 'spring'].includes(specialMode);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 w-full pb-0 ${
      theme === 'spicybrains' && !isSeasonalTheme()
        ? 'bg-gradient-to-br from-red-300 via-orange-300 to-red-400'
        : ''
    }`}>
      {showCelebration && <TaskCompletionCelebration theme={theme} />}
      <PullToRefresh onRefresh={loadTasks}>
      <div className="max-w-6xl mx-auto">
        <Card className={`${isSeasonalTheme() ? `${specialMode}-card` : ''} border-none shadow-lg mb-6 ${
          !isSeasonalTheme() ? (
            theme === 'minimalist'
              ? 'bg-white/90 backdrop-blur-sm'
              : theme === 'dark'
                ? 'bg-gray-800/90 backdrop-blur-sm'
                : 'bg-gradient-to-br from-blue-100 to-purple-100'
          ) : ''
        }`}>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h1 className={`text-3xl font-bold mb-2 ${
                  isSeasonalTheme() ? `${specialMode}-title` :
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  My Tasks
                  <WeeklyStar slot={2} />
                </h1>
                <p className={`mt-1 ${
                  isSeasonalTheme() ? `${specialMode}-text` :
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {activeTasks.length} active • {completedThisWeek} completed this week
                  <WeeklyStar slot={1} />
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => navigate(createPageUrl("AddTask"))}
                  className={`${
                    isSeasonalTheme()
                      ? 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200'
                      : theme === 'minimalist'
                        ? 'bg-green-600 hover:bg-green-700'
                        : theme === 'dark'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
                  }`}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Task
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className={isSeasonalTheme() ? 'bg-white/80 hover:bg-white border-gray-200' : ''}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export PDF
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="snoozed">Snoozed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="payment">💳 Payments</SelectItem>
              <SelectItem value="event">📅 Events</SelectItem>
              <SelectItem value="birthday">🎂 Birthdays</SelectItem>
              <SelectItem value="task">📌 Tasks</SelectItem>
            </SelectContent>
          </Select>

          <TaskSortDropdown />

          <WeeklyStar slot={0} />

          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant={viewMode === 'sections' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('sections')}
              className={`h-8 px-3 text-xs ${
                isSeasonalTheme() ? 'bg-white/70 text-gray-800' : ''
              }`}
            >
              <List className="w-3.5 h-3.5 mr-1" />
              Sections
            </Button>
            <Button
              variant={viewMode === 'days' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('days')}
              className={`h-8 px-3 text-xs ${
                isSeasonalTheme() ? 'bg-white/70 text-gray-800' : ''
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 mr-1" />
              Days
            </Button>
            <WeeklyStar slot={3} />
          </div>
        </div>

        {filteredTasks.length > 0 ? (
          <TaskSections
            tasks={filteredTasks}
            allTasks={allTasks}
            theme={theme}
            onRefreshTasks={loadTasks}
            onEditTitle={async (taskId, newTitle) => {
              setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: newTitle } : t));
              Task.update(taskId, { title: newTitle }).catch(error => {
                console.error("Failed to update title:", error);
                loadTasks();
              });
            }}
            onUpdateTask={handleTaskUpdate}
            onEdit={(taskToEdit) => {
              setSelectedTask(taskToEdit);
              setIsEditModalOpen(true);
            }}
            onComplete={handleComplete}
            onUncomplete={handleUncomplete}
            onSnooze={handleSnooze}
            onShowDetails={(taskToShow) => {
              setSelectedTask(taskToShow);
              setIsDetailsModalOpen(true);
            }}
            onDelete={handleDelete}
            onAddTask={(date) => navigate(createPageUrl("AddTask"), { state: { presetDate: date } })}
            isSeasonalTheme={isSeasonalTheme}
            specialMode={specialMode}
            viewMode={viewMode}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No tasks found</p>
          </div>
        )}

        <TaskDetailsModal
          task={selectedTask}
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedTask(null);
          }}
          onUpdate={handleTaskUpdate}
          onComplete={handleComplete}
          onDelete={() => {
            loadTasks();
            setIsDetailsModalOpen(false);
            setSelectedTask(null);
          }}
          theme={theme}
        />

        <TaskEditModal
          task={selectedTask}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedTask(null);
          }}
          onUpdate={handleTaskUpdate}
          theme={theme}
        />
      </div>
      </PullToRefresh>

      {/* Android Navigation Button Spacer */}
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}