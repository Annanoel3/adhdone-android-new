
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Task } from "@/entities/Task";
import { User } from "@/entities/User"; 
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
  // The specialMode variable is no longer used for inline styling on the main div,
  // but it's kept here as it might be used elsewhere or in future changes.
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

  // Reload when coming back to home page
  useEffect(() => {
    if (location.state?.reload) {
      loadData();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  const loadData = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
      
      // DEBUG: Log current user info
      console.log("🔍 [HOME DEBUG] Current user:", currentUser.email);
      console.log("🔍 [HOME DEBUG] User ID:", currentUser.id);
    } catch (error) {
      console.log("User not logged in");
    }
    
    const allTasks = await Task.list('-updated_date');
    
    // DEBUG: Log task information
    console.log("🔍 [HOME DEBUG] Total tasks fetched:", allTasks.length);
    if (allTasks.length > 0) {
      console.log("🔍 [HOME DEBUG] Sample task created_by:", allTasks[0].created_by);
      console.log("🔍 [HOME DEBUG] All unique created_by values:", 
        [...new Set(allTasks.map(t => t.created_by))]);
    }
    
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
    await Task.update(task.id, { 
      status: 'completed',
      completed_at: new Date().toISOString()
    });
    loadData();
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
          onUpdate={loadData}
          theme={theme}
        />
      </div>
      
      {/* Android Navigation Button Spacer */}
      <div style={{ height: '120px' }} aria-hidden="true"></div>
    </div>
  );
}
