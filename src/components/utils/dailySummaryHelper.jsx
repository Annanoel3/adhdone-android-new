import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { EnergyLog } from "@/entities/EnergyLog";

/**
 * Updates or creates today's daily summary based on actual task data
 */
export async function updateTodaysSummary() {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Get all tasks
    const allTasks = await Task.list();
    
    // Count completed tasks for TODAY (using completed_at)
    const completedToday = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
      return completedDate === today;
    });
    
    const completedCount = completedToday.length;
    
    // Count ALL remaining active tasks (current state)
    const remainingTasks = allTasks.filter(t => t.status === 'active').length;
    
    // For today's total: completed today + currently active tasks
    // This gives us a snapshot of "tasks in play today"
    const totalTasks = completedCount + remainingTasks;
    
    // Calculate completion rate based on today's work
    const completionRate = totalTasks > 0 
      ? Math.round((completedCount / totalTasks) * 100)
      : 0;
    
    // Calculate streak
    const summaries = await DailySummary.list('-date', 30);
    let streakDays = 0;
    
    if (completedCount > 0) {
      // Start with 1 for today
      streakDays = 1;
      
      // Check previous days
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterdaySummary = summaries.find(s => s.date === yesterday);
      
      if (yesterdaySummary && yesterdaySummary.tasks_completed > 0) {
        streakDays = (yesterdaySummary.streak_days || 0) + 1;
      }
    } else {
      // No tasks completed today - check if yesterday had a streak
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterdaySummary = summaries.find(s => s.date === yesterday);
      if (yesterdaySummary && yesterdaySummary.tasks_completed > 0) {
        // Streak broken
        streakDays = 0;
      }
    }
    
    // Get energy logs for today
    const energyLogs = await EnergyLog.list('-logged_at', 100);
    const todayEnergy = energyLogs.filter(log => {
      const logDate = new Date(log.logged_at).toISOString().split('T')[0];
      return logDate === today;
    });
    
    const energyLevels = todayEnergy.map(e => ({
      time: new Date(e.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      level: e.energy_level
    }));
    
    // Generate highlights
    const highlights = [];
    if (completedCount > 0) {
      highlights.push(`✅ Completed ${completedCount} ${completedCount === 1 ? 'task' : 'tasks'} today`);
    }
    if (completionRate >= 80 && totalTasks > 0) {
      highlights.push("⭐ Outstanding completion rate!");
    }
    if (streakDays >= 3) {
      highlights.push(`🔥 ${streakDays} day streak!`);
    }
    if (highlights.length === 0) {
      highlights.push("🌟 Every step counts!");
    }
    
    // Check if summary already exists for today
    const existingSummaries = await DailySummary.filter({ date: today });
    
    const summaryData = {
      date: today,
      tasks_completed: completedCount,
      tasks_remaining: remainingTasks,
      total_tasks: totalTasks,
      completion_rate: completionRate,
      streak_days: streakDays,
      energy_levels: energyLevels,
      highlights: highlights
    };
    
    if (existingSummaries.length > 0) {
      // Update existing - use the first one if there are duplicates
      await DailySummary.update(existingSummaries[0].id, summaryData);
      
      // Delete any duplicate summaries for today
      for (let i = 1; i < existingSummaries.length; i++) {
        await DailySummary.delete(existingSummaries[i].id);
      }
    } else {
      // Create new
      await DailySummary.create(summaryData);
    }
    
    return summaryData;
  } catch (error) {
    console.error("Error updating daily summary:", error);
    return null;
  }
}