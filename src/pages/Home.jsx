import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import WelcomeCard from "../components/home/WelcomeCard";
import DailyTipCard from "../components/home/DailyTipCard";
import QuickActions from "../components/home/QuickActions";
import TodaysTasks from "../components/home/TodaysTasks";
import EndOfDayReview from "../components/home/EndOfDayReview";
import MotivationCoach from "../components/home/MotivationCoach";
import TaskDetailsModal from "../components/tasks/TaskDetailsModal";
import MomentumCelebration from "../components/shared/MomentumCelebration";

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [showEndOfDayReview, setShowEndOfDayReview] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const specialMode = localStorage.getItem('special_mode') || 'normal';

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

  // CRITICAL FIX: Refresh tasks every 2 minutes to pick up reminder updates from cron
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('🔄 [HOME] Auto-refreshing tasks to update reminder times...');
      loadData();
    }, 120000); // Every 2 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // CRITICAL FIX: Refresh tasks when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ [HOME] Page visible - refreshing tasks...');
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadData = async () => {
    try {
      console.log('📥 [HOME] Loading data...');
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      console.log('👤 [HOME] User loaded:', currentUser?.email);
    } catch (error) {
      console.error("Error loading user:", error);
      console.log("User not logged in");
    }
    
    try {
      console.log('📋 [HOME] Fetching tasks...');
      const allTasks = await base44.entities.Task.list('-updated_date');
      console.log('✅ [HOME] Tasks fetched:', allTasks.length);
      
      // Log some task details
      if (allTasks.length > 0) {
        const completed = allTasks.filter(t => t.status === 'completed');
        console.log('✅ [HOME] Completed tasks:', completed.length);
        
        // Show first 3 completed tasks with dates
        if (completed.length > 0) {
          console.log('📅 [HOME] Sample completed:', completed.slice(0, 3).map(t => ({
            title: t.title.substring(0, 30),
            completed_at: t.completed_at,
            date_local: t.completed_at ? getLocalDateString(new Date(t.completed_at)) : 'no date'
          })));
        }
      }
      
      setTasks(allTasks);
    } catch (error) {
      console.error('❌ [HOME] Error loading tasks:', error);
    }
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
    // CRITICAL FIX: Store local date/time, not UTC
    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();
    
    console.log('✅ [COMPLETE] Marking task complete with local time:', localISOString);
    
    // Cancel all scheduled reminders when task is completed
    if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
      try {
        console.log('🔕 [COMPLETE] Cancelling reminders:', task.onesignal_notification_ids);
        const { cancelScheduledReminder } = await import('../components/utils/reminderScheduler');
        await cancelScheduledReminder(task.onesignal_notification_ids);
        console.log('✅ [COMPLETE] Successfully cancelled reminders');
      } catch (error) {
        console.error("❌ [COMPLETE] Failed to cancel reminders:", error);
      }
    } else {
      console.log('ℹ️ [COMPLETE] No reminders to cancel for this task');
    }
    
    // Optimistically update UI
    setTasks(prevTasks => 
      prevTasks.map(t => 
        t.id === task.id 
          ? { ...t, status: 'completed', completed_at: localISOString, onesignal_notification_ids: [] }
          : t
      )
    );

    // Update in background
    try {
      await base44.entities.Task.update(task.id, { 
        status: 'completed',
        completed_at: localISOString,
        onesignal_notification_ids: []
      });
    } catch (error) {
      console.error("Failed to complete task:", error);
      // Revert on error
      loadData();
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
    if (t.status !== 'completed' || !t.completed_at || t.parent_task_id) return false;
    const today = getLocalDateString(new Date());
    const completedDate = getLocalDateString(new Date(t.completed_at));
    return completedDate === today;
  });

  const activeTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id);

  // Debug logging
  useEffect(() => {
    console.log('🔍 [HOME DEBUG] ========== TASK COUNT DEBUG ==========');
    console.log('🔍 [HOME DEBUG] Total tasks loaded:', tasks.length);
    console.log('🔍 [HOME DEBUG] Active tasks (all):', tasks.filter(t => t.status === 'active').length);
    console.log('🔍 [HOME DEBUG] Active PARENT tasks:', activeTasks.length);
    console.log('🔍 [HOME DEBUG] Active SUBTASKS:', tasks.filter(t => t.status === 'active' && t.parent_task_id).length);
    console.log('🔍 [HOME DEBUG] Completed tasks (all):', tasks.filter(t => t.status === 'completed').length);
    console.log('🔍 [HOME DEBUG] Completed today (parent only):', todayCompleted.length);
    
    // Show all active parent tasks
    const activeParents = tasks.filter(t => t.status === 'active' && !t.parent_task_id);
    console.log('🔍 [HOME DEBUG] Active parent tasks list:');
    activeParents.forEach((t, i) => {
      console.log(`  ${i+1}. "${t.title}" (id: ${t.id})`);
    });
    
    const today = getLocalDateString(new Date());
    console.log('🔍 [HOME DEBUG] Today date:', today);
    console.log('🔍 [HOME DEBUG] =====================================');
  }, [tasks, todayCompleted, activeTasks]);

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
          <WelcomeCard userName={user?.full_name} theme={theme} specialMode={specialMode} />
          
          <QuickActions theme={theme} specialMode={specialMode} />
          
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TodaysTasks 
                tasks={tasks} 
                theme={theme}
                onTaskAction={handleTaskComplete}
                onViewDetails={handleViewDetails}
                specialMode={specialMode}
              />
            </div>
            
            <div>
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
      </div>
    </div>
  );
}