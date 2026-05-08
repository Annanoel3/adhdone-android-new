import { base44 } from "@/api/base44Client";

/**
 * Updates or creates today's daily summary based on actual task data
 */
export async function updateTodaysSummary() {
  const today = new Date().toISOString().split('T')[0];

  try {
    const allTasks = await base44.entities.Task.list();

    const completedToday = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
      return completedDate === today;
    });

    const completedCount = completedToday.length;
    const remainingTasks = allTasks.filter(t => t.status === 'active').length;
    const totalTasks = completedCount + remainingTasks;
    const completionRate = totalTasks > 0
      ? Math.round((completedCount / totalTasks) * 100)
      : 0;

    // Calculate streak
    const summaries = await base44.entities.DailySummary.list('-date', 30);
    let streakDays = 0;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const yesterdaySummary = summaries.find(s => s.date === yesterday);

    if (completedCount > 0) {
      streakDays = yesterdaySummary && yesterdaySummary.tasks_completed > 0
        ? (yesterdaySummary.streak_days || 0) + 1
        : 1;
    }

    // Get energy logs for today
    const energyLogs = await base44.entities.EnergyLog.list('-logged_at', 100);
    const todayEnergy = energyLogs.filter(log => {
      const logDate = new Date(log.logged_at).toISOString().split('T')[0];
      return logDate === today;
    });

    const energyLevels = todayEnergy.map(e => ({
      time: new Date(e.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      level: e.energy_level
    }));

    const highlights = [];
    if (completedCount > 0) highlights.push(`✅ Completed ${completedCount} ${completedCount === 1 ? 'task' : 'tasks'} today`);
    if (completionRate >= 80 && totalTasks > 0) highlights.push("⭐ Outstanding completion rate!");
    if (streakDays >= 3) highlights.push(`🔥 ${streakDays} day streak!`);
    if (highlights.length === 0) highlights.push("🌟 Every step counts!");

    const summaryData = {
      date: today,
      tasks_completed: completedCount,
      tasks_remaining: remainingTasks,
      total_tasks: totalTasks,
      completion_rate: completionRate,
      streak_days: streakDays,
      energy_levels: energyLevels,
      highlights
    };

    const existingSummaries = await base44.entities.DailySummary.filter({ date: today });

    if (existingSummaries.length > 0) {
      await base44.entities.DailySummary.update(existingSummaries[0].id, summaryData);
      for (let i = 1; i < existingSummaries.length; i++) {
        await base44.entities.DailySummary.delete(existingSummaries[i].id);
      }
    } else {
      await base44.entities.DailySummary.create(summaryData);
    }

    return summaryData;
  } catch (error) {
    console.error("Error updating daily summary:", error);
    return null;
  }
}