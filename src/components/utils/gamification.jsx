import { User } from "@/entities/User";
import { Achievement } from "@/entities/Achievement";

const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500, 6000, 8000, 10500, 13500];

export const awardPoints = async (points, reason = "") => {
  try {
    const user = await User.me();
    const today = new Date().toISOString().split('T')[0];
    
    // Reset daily points if it's a new day
    let dailyPoints = user.daily_points || 0;
    if (user.last_points_reset !== today) {
      dailyPoints = 0;
    }
    
    const newDailyPoints = dailyPoints + points;
    const newTotalPoints = (user.total_points || 0) + points;
    
    // Calculate new level
    let newLevel = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (newTotalPoints >= LEVEL_THRESHOLDS[i]) {
        newLevel = i + 1;
        break;
      }
    }
    
    const leveledUp = newLevel > (user.level || 1);
    
    // Update user
    await User.updateMyUserData({
      total_points: newTotalPoints,
      daily_points: newDailyPoints,
      last_points_reset: today,
      level: newLevel
    });
    
    // Check for level-up achievement
    if (leveledUp) {
      await Achievement.create({
        achievement_type: `level_${newLevel}`,
        title: `Level ${newLevel} Reached!`,
        description: `You've reached level ${newLevel}!`,
        icon: "trophy",
        points: newLevel * 10
      });
    }
    
    return { success: true, newTotalPoints, newLevel, leveledUp };
  } catch (error) {
    console.error("Error awarding points:", error);
    return { success: false };
  }
};

export const getPointsForAction = (action) => {
  const pointsMap = {
    task_completed: 10,
    urgent_task_completed: 25,
    pomodoro_completed: 5,
    three_day_streak: 50,
    seven_day_streak: 100,
    daily_goal_met: 20,
    early_morning_task: 15,
    energy_checkin: 3
  };
  
  return pointsMap[action] || 0;
};