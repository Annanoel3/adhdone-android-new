import { Achievement } from "@/entities/Achievement";
import { User } from "@/entities/User";
import { sendAchievementNotification } from "./notificationHelper";

const ACHIEVEMENTS = {
  first_task: {
    title: "Getting Started",
    description: "Completed your first task",
    icon: "🎯",
    points: 10
  },
  five_tasks: {
    title: "On a Roll",
    description: "Completed 5 tasks",
    icon: "⚡",
    points: 25
  },
  ten_tasks: {
    title: "Task Master",
    description: "Completed 10 tasks",
    icon: "🏆",
    points: 50
  },
  three_day_streak: {
    title: "Consistency Champion",
    description: "Maintained a 3-day streak",
    icon: "🔥",
    points: 30
  },
  week_streak: {
    title: "Week Warrior",
    description: "Maintained a 7-day streak",
    icon: "💪",
    points: 75
  },
  urgent_master: {
    title: "Pressure Handler",
    description: "Completed 5 urgent tasks",
    icon: "🚀",
    points: 40
  },
  early_bird: {
    title: "Early Bird",
    description: "Completed 5 tasks before 9 AM",
    icon: "🌅",
    points: 35
  }
};

export async function checkAndAwardAchievements(stats) {
  const user = await User.me();
  const existingAchievements = await Achievement.list();
  const achievementTypes = new Set(existingAchievements.map(a => a.achievement_type));
  const newAchievements = [];

  // First task
  if (stats.totalTasksCompleted >= 1 && !achievementTypes.has('first_task')) {
    const achievement = await createAchievement('first_task');
    newAchievements.push(achievement);
  }

  // Five tasks
  if (stats.totalTasksCompleted >= 5 && !achievementTypes.has('five_tasks')) {
    const achievement = await createAchievement('five_tasks');
    newAchievements.push(achievement);
  }

  // Ten tasks
  if (stats.totalTasksCompleted >= 10 && !achievementTypes.has('ten_tasks')) {
    const achievement = await createAchievement('ten_tasks');
    newAchievements.push(achievement);
  }

  // 3-day streak
  if (stats.streakDays >= 3 && !achievementTypes.has('three_day_streak')) {
    const achievement = await createAchievement('three_day_streak');
    newAchievements.push(achievement);
  }

  // 7-day streak
  if (stats.streakDays >= 7 && !achievementTypes.has('week_streak')) {
    const achievement = await createAchievement('week_streak');
    newAchievements.push(achievement);
  }

  // Urgent tasks
  if (stats.completedUrgentTask && !achievementTypes.has('urgent_master')) {
    const urgentCount = existingAchievements.filter(a => a.achievement_type === 'urgent_completed').length;
    if (urgentCount >= 5) {
      const achievement = await createAchievement('urgent_master');
      newAchievements.push(achievement);
    }
  }

  // Early bird
  if (stats.completedBeforeNineAM && !achievementTypes.has('early_bird')) {
    const earlyCount = existingAchievements.filter(a => a.achievement_type === 'early_completed').length;
    if (earlyCount >= 5) {
      const achievement = await createAchievement('early_bird');
      newAchievements.push(achievement);
    }
  }

  // Send notifications for new achievements
  for (const achievement of newAchievements) {
    await sendAchievementNotification(user.email, achievement);
  }

  return newAchievements;
}

async function createAchievement(type) {
  const config = ACHIEVEMENTS[type];
  return await Achievement.create({
    achievement_type: type,
    title: config.title,
    description: config.description,
    icon: config.icon,
    points: config.points,
    unlocked_at: new Date().toISOString()
  });
}