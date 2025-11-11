
import React, { useState, useEffect, useCallback } from "react";
import { Task } from "@/entities/Task";
import { Button } from "@/components/ui/button";
import { Plus, Filter, Download, Loader2, Zap, Clock } from "lucide-react";
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
import TaskCard from "../components/tasks/TaskCard";
import TaskDetailsModal from "../components/tasks/TaskDetailsModal";
import TaskEditModal from "../components/tasks/TaskEditModal";
import HelpfulRemindersSuggestions from "../components/tasks/HelpfulRemindersSuggestions";
import { updateTodaysSummary } from "../components/utils/dailySummaryHelper";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Tasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const [allTasks, setAllTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [statusFilter, setStatusFilter] = useState('active');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [specialMode, setSpecialMode] = useState('normal');
  const [activeTasks, setActiveTasks] = useState([]);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
      const newSpecialMode = localStorage.getItem('special_mode') || 'normal';
      setSpecialMode(newSpecialMode);
    }, 100);
    return () => clearInterval(interval);
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
    setActiveTasks(allTasks.filter(t => t.status === 'active' || t.status === 'snoozed'));
    
    // Calculate tasks completed this week
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    
    const completedThisWeekCount = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      const completedDate = new Date(t.completed_at);
      return completedDate >= startOfWeek;
    }).length;
    
    setCompletedThisWeek(completedThisWeekCount);
  }, [allTasks]);

  const applyFilters = useCallback(() => {
    let topLevelTasks = allTasks.filter(t => !t.parent_task_id);
    let filtered = topLevelTasks.filter(t => t.status === statusFilter);
    
    if (urgencyFilter !== 'all') {
      filtered = filtered.filter(t => t.urgency === urgencyFilter);
    }
    setFilteredTasks(filtered);
  }, [allTasks, statusFilter, urgencyFilter]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const loadTasks = async () => {
    const fetchedTasks = await Task.list('-created_date');
    setAllTasks(fetchedTasks);
  };

  const handleComplete = async (task) => {
    // CRITICAL FIX: Store local date/time, not UTC
    const now = new Date();
    // Calculate the UTC equivalent of the local time.
    // getTimezoneOffset returns the difference in minutes between UTC and local time.
    // If local time is UTC+X, offset is -X. If local time is UTC-Y, offset is +Y.
    // To get the local time's components into an ISO string with 'Z', we adjust the UTC timestamp.
    // Example: If local is 12:00 (UTC+2), offset is -120.
    // now.getTime() will correspond to 10:00 UTC.
    // now.getTime() - (-120 * 60000) = now.getTime() + 7,200,000 (2 hours).
    // This effectively converts the 10:00 UTC timestamp to a 12:00 UTC timestamp,
    // which then produces an ISO string reflecting 12:00 in the HH:mm portion, followed by 'Z'.
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();
    
    console.log('✅ [COMPLETE] Marking task complete with local time:', localISOString);
    
    await Task.update(task.id, {
      status: 'completed',
      completed_at: localISOString
    });
    await updateTodaysSummary();
    loadTasks();
  };

  const handleUncomplete = async (task) => {
    await Task.update(task.id, {
      status: 'active',
      completed_at: null
    });
    await updateTodaysSummary();
    loadTasks();
  };

  const handleSnooze = async (task, minutes) => {
    const nextReminder = new Date();
    nextReminder.setMinutes(nextReminder.getMinutes() + minutes);

    await Task.update(task.id, {
      snooze_count: (task.snooze_count || 0) + 1,
      consecutive_snoozes: (task.consecutive_snoozes || 0) + 1,
      status: 'snoozed',
      next_reminder: nextReminder.toISOString()
    });
    loadTasks();
  };

  const handleDelete = async (task) => {
    await Task.delete(task.id);
    loadTasks();
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
    <div className={`min-h-screen p-4 md:p-8 w-full ${
      theme === 'spicybrains' && !isSeasonalTheme()
        ? 'bg-gradient-to-br from-red-300 via-orange-300 to-red-400'
        : ''
    }`}>
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
                </h1>
                <p className={`mt-1 ${
                  isSeasonalTheme() ? `${specialMode}-text` :
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {activeTasks.length} active • {completedThisWeek} completed this week
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

        <div className="mb-6">
          <HelpfulRemindersSuggestions theme={theme} onTaskCreated={loadTasks} />
        </div>

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
        </div>

        <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              theme={theme}
              onRefreshTasks={loadTasks}
              onEditTitle={async (taskId, newTitle) => {
                await Task.update(taskId, { title: newTitle });
                loadTasks();
              }}
              onEdit={(taskToEdit) => {
                setSelectedTask(taskToEdit);
                setIsEditModalOpen(true);
              }}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onShowDetails={(taskToShow) => {
                setSelectedTask(taskToShow);
                setIsDetailsModalOpen(true);
              }}
              onDelete={handleDelete}
              subtaskCount={getSubtaskCount(task.id)}
              completedSubtaskCount={getCompletedSubtaskCount(task.id)}
            />
          ))}
        </div>

        {filteredTasks.length === 0 && (
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
          onUpdate={loadTasks}
          theme={theme}
        />

        <TaskEditModal
          task={selectedTask}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedTask(null);
          }}
          onUpdate={loadTasks}
          theme={theme}
        />
      </div>
      
      {/* Android Navigation Button Spacer */}
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}
