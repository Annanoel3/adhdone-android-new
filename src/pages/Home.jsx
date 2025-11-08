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

  useEffect(() => {
    loadData();
    checkEndOfDayReview();
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (location.state?.reload) {
      loadData();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // CRITICAL FIX: Refresh tasks every 30 seconds to pick up reminder updates from cron
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('🔄 [HOME] Auto-refreshing tasks to update reminder times...');
      loadData();
    }, 30000); // Every 30 seconds

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
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error("Error loading user:", error);
      console.log("User not logged in");
    }
    
    const allTasks = await base44.entities.Task.list('-updated_date');
    setTasks(allTasks);
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
    // Optimistically update UI
    setTasks(prevTasks => 
      prevTasks.map(t => 
        t.id === task.id 
          ? { ...t, status: 'completed', completed_at: new Date().toISOString() }
          : t
      )
    );

    // Update in background
    try {
      await base44.entities.Task.update(task.id, { 
        status: 'completed',
        completed_at: new Date().toISOString()
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

  const todayCompleted = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false;
    const today = new Date().toISOString().split('T')[0];
    const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
    return completedDate === today;
  });

  const activeTasks = tasks.filter(t => t.status === 'active');

  return (
    <div className="p-4 md:p-8 w-full">
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
      
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}