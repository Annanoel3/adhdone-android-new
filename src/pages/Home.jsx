import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import WelcomeCard from "../components/home/WelcomeCard";
import DailyTipCard from "../components/home/DailyTipCard";
import QuickActions from "../components/home/QuickActions";
import TodaysTasks from "../components/home/TodaysTasks";
import PendingTaskCards from "../components/home/PendingTaskCards";
import EndOfDayReview from "../components/home/EndOfDayReview";
import BirthdayTextDialog from "../components/birthdays/BirthdayTextDialog";
import TaskDetailsModal from "../components/tasks/TaskDetailsModal";
import MomentumCelebration from "../components/shared/MomentumCelebration";
import TaskCompletionCelebration from "../components/tasks/TaskCompletionCelebration";
import { isTodayTask, isCompletedToday } from "../components/utils/todayTasks";
import { ensureBirthdayReminders } from "../components/utils/birthdayScheduler";
import { listActiveTasks } from "../components/utils/widgetBridge";
import BirthdayStrip from "../components/home/BirthdayStrip";
import NotificationsOffBanner from "../components/home/NotificationsOffBanner";
import { countCompletionForGif } from "../components/utils/completionMilestone";
import PullToRefresh from "../components/shared/PullToRefresh";
import { checkCompletionEggs } from "../components/eastereggs/completionEggs";
import { usePopupTurn } from "../components/onboarding/onboardingSurface";
import { ONBOARDING_STEPS, isStepDone } from "../components/onboarding/onboardingGate";

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [showEndOfDayReview, setShowEndOfDayReview] = useState(false);
  // The day review opens on its own, so it takes its turn: it waits until no
  // other popup is on screen and then holds the screen until it's closed.
  const endOfDayReviewShown = usePopupTurn(showEndOfDayReview);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [birthdayTextTask, setBirthdayTextTask] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
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

  // The layout writes the theme from the user's profile into localStorage a
  // moment after auth resolves — which is AFTER this page first renders. Keep
  // reading it so the dark theme isn't stuck on the initial light value.
  useEffect(() => {
    const interval = setInterval(() => {
      setTheme(localStorage.getItem('adhd_theme') || 'minimalist');
    }, 200);
    return () => clearInterval(interval);
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
    const handleTasksChanged = (e) => {
      // A sender that already knows what changed (Focus Mode's "I completed
      // this") says so in the event, and the list shows it at once instead of
      // re-fetching a copy the server hasn't updated yet. The sender fires a
      // plain tasks-changed once its save lands, and that one reloads.
      const d = e?.detail;
      if (d?.taskId && d?.patch) {
        setTasks(prev => prev.map(t => t.id === d.taskId ? { ...t, ...d.patch } : t));
        return;
      }
      loadTasks();
    };
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

  // Several reloads can be in flight at once (landing on Home after a sprint,
  // then finishing the task in Focus Mode), and a slow one fired BEFORE a save
  // can answer after the one fired AFTER it, putting the stale list back —
  // that is how a task just finished in Focus Mode kept sitting on the Home
  // list looking untouched. Only the newest request's answer is kept.
  const loadSeq = useRef(0);
  const loadTasks = async () => {
    const seq = ++loadSeq.current;
    try {
      // Every active task (paged), plus the recently finished ones that
      // "done today" and the step counts need. This list also feeds the
      // phone's alarm set (TodaysTasks → pushAlarms), and native drops every
      // alarm missing from it: the old "500 most recently edited, finished
      // ones included" let finished tasks crowd older active ones out.
      const [activeTasks, recentlyDone] = await Promise.all([
        listActiveTasks(),
        base44.entities.Task.filter({ status: 'completed' }, '-updated_date', 200).catch(() => []),
      ]);
      const seen = new Set(activeTasks.map(t => t.id));
      const allTasks = [...activeTasks, ...(recentlyDone || []).filter(t => !seen.has(t.id))];
      if (seq !== loadSeq.current) return;
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
        // Not on a visit that is still walking someone through the app (the
        // welcome chat, the "welcome back" chat, the Home tour): reviewing a
        // day on top of all that is noise. It comes on the next evening visit.
        if (!isStepDone(ONBOARDING_STEPS.welcome) || !isStepDone(ONBOARDING_STEPS.homeTour)) return;
        setShowEndOfDayReview(true);
      }, 5000);
    }
  };

  const handleTaskComplete = async (task) => {
    // Already finished (a second tap, or a card that hadn't caught up with a
    // finish from the notification): nothing to finish again — doing it made
    // a second copy of a repeating task.
    if (task.status === 'completed') return;

    // Confetti fires immediately — before any awaits — so it never gets held up
    // by the save. Only for real tasks, not subtasks.
    if (!task.parent_task_id) {
      setShowCelebration(false);
      requestAnimationFrame(() => setShowCelebration(true));
      setTimeout(() => setShowCelebration(false), 2200);
      countCompletionForGif();
      checkCompletionEggs(task);
    }

    const localISOString = new Date().toISOString();
    
    // Cancel all scheduled reminders in the BACKGROUND — never block the UI
    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
      import('../components/utils/reminderScheduler')
        .then(({ cancelScheduledReminder }) => cancelScheduledReminder(task.onesignal_notification_ids))
        .catch((error) => console.error("Failed to cancel reminders:", error));
    }

    // Optimistically update UI (parent + its subtasks)
    setTasks(prevTasks => 
      prevTasks.map(t => 
        t.id === task.id 
          ? { ...t, status: 'completed', completed_at: localISOString, onesignal_notification_ids: [] }
          : t.parent_task_id === task.id && t.status !== 'completed'
            ? { ...t, status: 'completed', completed_at: localISOString }
            : t
      )
    );

    try {
      const { isAlreadyCompleted, createNextRecurrence } = await import('../components/utils/taskRecurrence');
      // The saved record, not the card: finished elsewhere already means its
      // next copy already exists.
      if (await isAlreadyCompleted(task)) {
        loadTasks();
        return;
      }

      await base44.entities.Task.update(task.id, { 
        status: 'completed',
        completed_at: localISOString,
        onesignal_notification_ids: []
      });

      // Mark all active subtasks as completed too
      const { completeSubtasks } = await import('../components/utils/subtaskCompletion');
      await completeSubtasks(task.id);

      // Create next recurrence if needed
      if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
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
  const todayCompleted = tasks.filter(isCompletedToday);

  // "Today" count = things you realistically need to DO today. Excludes:
  // subtasks, birthdays, events (you attend those, not "do" them), and
  // recurring no-deadline tasks (ongoing habits with no due date aren't "due today").
  const activeTasks = tasks.filter(t =>
    t.status === 'active' &&
    !t.parent_task_id &&
    isTodayTask(t) &&
    !t.birthday_person &&
    t.classification !== 'event' &&
    !(t.reminder_interval && t.reminder_interval !== 'once' && !t.due_date)
  );



  return (
    <div className={`min-h-screen p-4 md:p-8 w-full ${
      theme === 'spicybrains' 
        ? 'bg-gradient-to-br from-green-300 via-blue-300 to-purple-300' 
        : ''
    }`} style={{
      paddingBottom: 'max(8rem, calc(8rem + env(safe-area-inset-bottom)))'
    }}>
      {showCelebration && <TaskCompletionCelebration theme={theme} />}
      <PullToRefresh onRefresh={loadTasks}>
      <div className="max-w-7xl mx-auto">
        <MomentumCelebration 
          completedCount={todayCompleted.length}
          remainingCount={activeTasks.length}
          theme={theme}
        />

        <div className="space-y-6">
          <NotificationsOffBanner theme={theme} specialMode={specialMode} />

          <WelcomeCard userName={user?.full_name} theme={theme} specialMode={specialMode} user={user} />
          
          <QuickActions theme={theme} specialMode={specialMode} user={user} />

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6 min-w-0">
              <PendingTaskCards theme={theme} />

              <div data-tour="todays-tasks">
                <TodaysTasks
                  tasks={tasks}
                  theme={theme}
                  onTaskAction={handleTaskComplete}
                  onViewDetails={handleViewDetails}
                  onUpdateTask={handleTaskUpdate}
                  specialMode={specialMode}
                />
              </div>

              {/* Birthdays get their own compact spot right under Today's Focus */}
              <BirthdayStrip
                tasks={tasks}
                theme={theme}
                specialMode={specialMode}
                onWriteText={setBirthdayTextTask}
                onRefresh={loadTasks}
              />
            </div>
            
            <div className="min-w-0">
              <DailyTipCard theme={theme} specialMode={specialMode} />
            </div>
          </div>
        </div>

        <EndOfDayReview
          isOpen={endOfDayReviewShown}
          onClose={handleReviewDismiss}
          theme={theme}
        />

        {/* MotivationCoach ("Your Coach") is switched off everywhere: its
            numbers were wrong (it told Anna she had finished zero tasks on a
            day the end-of-day review counted several). Do not mount it again
            without fixing what it counts first. */}

        <TaskDetailsModal
          task={selectedTask}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onUpdate={handleTaskUpdate}
          onComplete={handleTaskComplete}
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
      </PullToRefresh>
    </div>
  );
}