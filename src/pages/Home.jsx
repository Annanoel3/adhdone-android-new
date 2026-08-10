import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import WelcomeCard from "../components/home/WelcomeCard";
import DailyTipCard from "../components/home/DailyTipCard";
import QuickActions from "../components/home/QuickActions";
import TodaysTasks from "../components/home/TodaysTasks";
import EndOfDayReview from "../components/home/EndOfDayReview";
import UpcomingBirthdayCard from "../components/home/UpcomingBirthdayCard";
import BirthdayTextDialog from "../components/birthdays/BirthdayTextDialog";
import MotivationCoach from "../components/home/MotivationCoach";
import TaskDetailsModal from "../components/tasks/TaskDetailsModal";
import MomentumCelebration from "../components/shared/MomentumCelebration";
import { isTodayTask } from "../components/utils/todayTasks";
import { ensureBirthdayReminders } from "../components/utils/birthdayScheduler";

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [showEndOfDayReview, setShowEndOfDayReview] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [birthdayTextTask, setBirthdayTextTask] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const specialMode = localStorage.getItem('special_mode') || 'normal'; // v2

  // Helper function to get local date string using toLocaleDateString
  const getLocalDateString = (date) => {
    return new Date(date).toLocaleDateString('en-CA'); // returns YYYY-MM-DD in local time
  };

  useEffect(() => {
    loadData();
    checkEndOfDayReview();
  }, []);

  useEffect(() => {
    if (location.state?.reload) {
      loadData();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Refresh tasks when page becomes visible (tab switch / screen wake)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadTasks();
      }
    };
    const handleTasksChanged = () => loadTasks();
    const handleBirthdayCreated = (e) => {
      setBirthdayTextTask(e.detail?.task || null);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('tasks-changed', handleTasksChanged);
    window.addEventListener('birthday-created', handleBirthdayCreated);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('tasks-changed', handleTasksChanged);
      window.removeEventListener('birthday-created', handleBirthdayCreated);
    };
  }, []);

  const loadTasks = async () => {
    try {
      const allTasks = await base44.entities.Task.list('-updated_date', 500);
      setTasks(allTasks);
      // Roll over passed birthdays to next year and ensure reminders exist
      const birthdayTasks = allTasks.filter(t => t.birthday_person && t.status === "active" && t.next_reminder);
      if (birthdayTasks.length > 0) {
        ensureBirthdayReminders(birthdayTasks).catch(() => {});
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error("Error loading user:", error);
    }
    await loadTasks();
  };

  const checkEndOfDayReview = () => {
    const lastReview = localStorage.getItem('last_eod_review');
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    
    if (hour >= 19 && lastReview !== today) {
      setTimeout(() => {
        setShowEndOfDayReview(true);
      }, 5000);
    }
  };

  const handleTaskComplete = async (task) => {
    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();
    
    // Cancel all scheduled reminders when task is completed
    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
      try {
        const { cancelScheduledReminder } = await import('../components/utils/reminderScheduler');
        await cancelScheduledReminder(task.onesignal_notification_ids);
      } catch (error) {
        console.error("Failed to cancel reminders:", error);
      }
    }
    
    // Optimistically update UI
    setTasks(prevTasks => 
      prevTasks.map(t => 
        t.id === task.id 
          ? { ...t, status: 'completed', completed_at: localISOString, onesignal_notification_ids: [] }
          : t
      )
    );

    try {
      await base44.entities.Task.update(task.id, { 
        status: 'completed',
        completed_at: localISOString,
        onesignal_notification_ids: []
      });

      // Create next recurrence if needed
      if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
        const { createNextRecurrence } = await import('../components/utils/taskRecurrence');
        const result = await createNextRecurrence(task);
        if (result) {
          loadTasks();
        }
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
      loadTasks();
    }
  };

  const handleTaskUpdate = async (updatedTask) => {
    // Optimistically update the task in state
    setTasks(prevTasks => 
      prevTasks.map(t => 
        t.id === updatedTask.id ? { ...t, ...updatedTask } : t
      )
    );
    
    // If the selected task is being viewed, update it too
    if (selectedTask && selectedTask.id === updatedTask.id) {
      setSelectedTask({ ...selectedTask, ...updatedTask });
    }
  };

  const handleViewDetails = (task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleReviewDismiss = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('last_eod_review', today);
    setShowEndOfDayReview(false);
  };

  // FIXED: Filter out subtasks from today's completed count
  const todayCompleted = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at || t.parent_task_id || t.birthday_person) return false;
    const today = getLocalDateString(new Date());
    const completedDate = getLocalDateString(new Date(t.completed_at));
    return completedDate === today;
  });

  const activeTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id && isTodayTask(t) && !t.birthday_person);



  return (
    <div className={`min-h-screen p-4 md:p-8 w-full ${
      theme === 'spicybrains' 
        ? 'bg-gradient-to-br from-green-300 via-blue-300 to-purple-300' 
        : ''
    }`} style={{
      paddingBottom: 'max(8rem, calc(8rem + env(safe-area-inset-bottom)))'
    }}>
      <div className="max-w-7xl mx-auto">
        <MomentumCelebration 
          completedCount={todayCompleted.length}
          remainingCount={activeTasks.length}
          theme={theme}
        />

        <div className="space-y-6">
          <WelcomeCard userName={user?.full_name} theme={theme} specialMode={specialMode} user={user} />
          
          <QuickActions theme={theme} specialMode={specialMode} />

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6 min-w-0">
              <TodaysTasks
                tasks={tasks}
                theme={theme}
                onTaskAction={handleTaskComplete}
                onViewDetails={handleViewDetails}
                specialMode={specialMode}
              />

              <UpcomingBirthdayCard
                tasks={tasks}
                user={user}
                theme={theme}
                specialMode={specialMode}
                onRefresh={loadTasks}
              />
            </div>
            
            <div className="min-w-0">
              <DailyTipCard theme={theme} specialMode={specialMode} />
            </div>
          </div>
        </div>

        <EndOfDayReview
          isOpen={showEndOfDayReview}
          onClose={handleReviewDismiss}
          theme={theme}
        />

        <MotivationCoach theme={theme} />

        <TaskDetailsModal
          task={selectedTask}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onUpdate={handleTaskUpdate}
          onDelete={() => {
            // Remove deleted task from state
            if (selectedTask) {
              setTasks(prevTasks => prevTasks.filter(t => t.id !== selectedTask.id));
            }
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          theme={theme}
        />

        <BirthdayTextDialog
          isOpen={!!birthdayTextTask}
          onClose={() => setBirthdayTextTask(null)}
          birthdayTask={birthdayTextTask}
          onSaved={loadTasks}
        />
      </div>
    </div>
  );
}