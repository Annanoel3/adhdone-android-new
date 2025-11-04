import { base44 } from "@/api/base44Client";

/**
 * Send a notification using the /notifySend endpoint
 */
export async function sendNotification({ toUserId, title, body, screen }) {
  try {
    const response = await base44.functions.invoke('notifySend', {
      toUserId,
      title,
      body,
      screen
    });

    return response.data;
  } catch (error) {
    console.error("[notificationHelper] Error sending notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a task reminder notification
 */
export async function sendTaskReminder(task, userEmail) {
  return sendNotification({
    toUserId: userEmail,
    title: "Task Reminder 📋",
    body: task.title,
    screen: "/Tasks"
  });
}

/**
 * Send an achievement notification
 */
export async function sendAchievementNotification(userEmail, achievement) {
  return sendNotification({
    toUserId: userEmail,
    title: "🏆 Achievement Unlocked!",
    body: `${achievement.title} - +${achievement.points} points`,
    screen: "/Progress"
  });
}

/**
 * Send accountability message notification
 */
export async function sendAccountabilityMessage(recipientEmail, senderName, message) {
  return sendNotification({
    toUserId: recipientEmail,
    title: `💬 Message from ${senderName}`,
    body: message.substring(0, 100),
    screen: "/Chat"
  });
}

/**
 * Send poke notification
 */
export async function sendPokeNotification(recipientEmail, senderName) {
  return sendNotification({
    toUserId: recipientEmail,
    title: "👋 Poke from your accountability partner!",
    body: `${senderName} is checking in on you. Keep up the great work!`,
    screen: "/Accountability"
  });
}

/**
 * Send connection request notification
 */
export async function sendConnectionRequest(recipientEmail, requesterName) {
  return sendNotification({
    toUserId: recipientEmail,
    title: "🤝 New Connection Request",
    body: `${requesterName} wants to be your accountability partner`,
    screen: "/Accountability"
  });
}

/**
 * Send trial ending warning
 */
export async function sendTrialWarning(userEmail, daysRemaining) {
  const title = daysRemaining === 0 ? "Trial Ending Today! ⏰" : "Trial Ending Soon 🎯";
  const body = daysRemaining === 0 
    ? "Your ADHDone trial ends today! Subscribe to keep all features."
    : `Your ADHDone trial ends in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}!`;
  
  return sendNotification({
    toUserId: userEmail,
    title,
    body,
    screen: "/Subscribe"
  });
}

/**
 * Send weekly recap notification
 */
export async function sendWeeklyRecap(userEmail, stats) {
  return sendNotification({
    toUserId: userEmail,
    title: "📊 Your Week in Review",
    body: `${stats.tasksCompleted} tasks completed • ${stats.streakDays} day streak • ${stats.points} points earned`,
    screen: "/Progress"
  });
}