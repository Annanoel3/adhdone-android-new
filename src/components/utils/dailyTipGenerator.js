import { base44 } from "@/api/base44Client";
import { isTodayTask, isUpcomingTask } from "./todayTasks";

const isEvening = () => new Date().getHours() >= 17;

const getLocalDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const CURRENT_PROMPT_VERSION = 11;

// Shared daily-tip generation. Builds a context-aware prompt from the user's
// tasks/mood/streak and invokes the generateDailyTip backend (which uses web
// search). Persists the resulting tip and returns the created DailyTip record.
export async function generateSmartTipForUser(today) {
  const user = await base44.auth.me();
  const tasks = await base44.entities.Task.list('-created_date', 50);

  const summaries = await (async () => {
    try {
      return await base44.entities.DailySummary.list('-date', 7);
    } catch {
      return [];
    }
  })();

  const todayDateTip = getLocalDateString();
  const activeTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id && isTodayTask(t, todayDateTip));
  const snoozedTasks = tasks.filter(t => t.status === 'snoozed' && !t.parent_task_id && isTodayTask(t, todayDateTip));
  const upcomingTasks = tasks.filter(t => t.status === 'active' && !t.parent_task_id && isUpcomingTask(t, todayDateTip));
  const completedToday = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false;
    const d = new Date(t.completed_at);
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return localDate === today;
  });

  const currentStreak = summaries.length > 0 ? summaries[0].streak_days || 0 : 0;

  const todayDate = getLocalDateString();
  const moodDate = localStorage.getItem('today_mood_date');
  const todayMood = moodDate === todayDate ? localStorage.getItem('today_mood') : null;

  const createdToday = tasks.filter(t => {
    if (!t.created_date) return false;
    const d = new Date(t.created_date);
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return localDate === todayDate;
  });

  const completedTodayFiltered = completedToday.filter(t => {
    if (!t.next_reminder) return true;
    const d = new Date(t.next_reminder);
    const reminderDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return reminderDate <= todayDate;
  });

  const completedTitles = completedTodayFiltered.map(t => `"${t.title}"`).join(', ');

  const evening = isEvening();
  const effectiveCompleted = evening ? completedTodayFiltered : completedToday;
  let contextualGuidance = '';

  if (evening) {
    const moodLabel = { not_great: 'not great', feeling_ok: 'okay', good: 'good', lets_go: 'energized' }[todayMood] || 'unknown';
    const moodSummary = todayMood ? `They said they were feeling ${moodLabel} about the day.` : 'No mood check-in today.';
    contextualGuidance = `
CONTEXT: It's evening. This is "Tonight's Tip" — a warm, celebratory wind-down. NOT a productivity push.
MOOD CHECK-IN: ${moodSummary}
DAY SUMMARY: They created ${createdToday.length} task(s) today and completed ${effectiveCompleted.length} of them.
${effectiveCompleted.length > 0 ? `COMPLETED TASK TITLES: ${completedTitles}` : ''}

CRITICAL TONE RULE: Always lead with a celebration of what they DID, no matter how small. Opening the app and creating a task IS a win. Showing up IS a win. Never frame the day as tough or failed. If they completed 0 tasks but created some, celebrate that they planned. If they completed tasks, celebrate that with a SPECIFIC reference to what they actually did (use the real task titles in a natural, warm way — e.g. if they completed "feed dogs", say something like "You fed the pups today!" or "The dogs are fed and you can rest easy."). Tomorrow is always a fresh start — end on hope, not guilt.

NEVER say things like "today was tough" or "even though you struggled." Always find the win first. NEVER be vague when you have task titles — be specific and personal.

Examples when tasks were completed (use actual titles!):
If tasks are "feed dogs" and "check on cat food": "The pets are taken care of and dinner happened — you did real things today. Rest up. 🐾"
If task is "walk the dog": "You got the pup out today — that's a win for both of you. Wind down and enjoy the rest of your evening."

Examples when 0 tasks completed but tasks were created:
"You showed up today — you opened the app, you made a plan. That's not nothing, that's actually the hardest part. Tomorrow those tasks are ready and waiting. Fresh start incoming. 🌅"

Examples when nothing was created or completed:
"You came back to check in — that matters more than you think. Tomorrow, just pick ONE tiny thing to start with. That's it. One thing."
`;
  } else if (todayMood === 'not_great') {
    contextualGuidance = `
MOOD: The user said they're not feeling great about the day ahead. This is the most important thing to address.
TONE: Compassionate, zero pressure, focus on finding just ONE tiny foothold. Normalize struggling. Help them find the will to begin without guilt.
Examples:
"Rough start? That's okay - your only job right now is to do ONE tiny thing. Not the whole list. Just one. Pick the smallest possible task and let that be enough for this moment."
"Not feeling it today? That's your brain, not your worth. Try the 2-minute rule: work on something - anything - for just 2 minutes. You can stop after. But you probably won't."`;
  } else if (todayMood === 'feeling_ok') {
    contextualGuidance = `
MOOD: The user is feeling okay - not great, not amazing. Middle of the road.
TONE: Gentle encouragement. Help them turn "okay" into a quiet win. Steady, practical advice.
Examples:
"'Okay' is actually a great launching pad. Your brain isn't hyped up OR dragging - that's peak task-completion mode. Pick something medium-sized and just start."
"Feeling okay is underrated. No drama, no resistance - just you and the to-do list. A calm start often leads to a surprisingly productive day."`;
  } else if (todayMood === 'good') {
    contextualGuidance = `
MOOD: The user is feeling good today.
TONE: Positive and encouraging. Help them channel that good energy into tackling things that matter. Maybe nudge them toward a harder task they've been avoiding.
Examples:
"You're feeling good - use it! This is the perfect day to take on that one task you've been avoiding. Good energy is rare, don't waste it on easy stuff."
"Feeling good? Lean into it. Put your best energy toward your most meaningful task first, while the momentum is on your side."`;
  } else if (todayMood === 'lets_go') {
    contextualGuidance = `
MOOD: The user is fired up and ready to crush the day.
TONE: Match their energy! Celebrate it, give them tips on riding that momentum and making the most of peak motivation days.
Examples:
"You're fired up - love it! Strike while the iron is hot: batch your hardest tasks together while you're in this state. Motivation this good doesn't come every day."
"LET'S GO energy is precious. Make a quick list of your top 3 priorities and attack them in order. Don't let that drive get scattered - focus it!"`;
  } else if (effectiveCompleted.length >= 3) {
    contextualGuidance = `
TONE: They've completed ${effectiveCompleted.length} tasks today - they're ON FIRE! Give an encouraging tip about momentum.
Examples:
"You're on a roll with ${effectiveCompleted.length} wins today! Ride that dopamine wave - your brain's loving this success pattern."`;
  } else if (effectiveCompleted.length >= 1) {
    contextualGuidance = `
TONE: They've completed ${effectiveCompleted.length} task(s) today - good start! Keep it going.
Examples:
"Nice! You already checked one off today. Your brain's warmed up - what's the next tiny win you can grab?"`;
  } else {
    contextualGuidance = `
TONE: They haven't completed anything yet today. Gentle, no-judgment nudge to get started.
Examples:
"Start with just one small win - pick something that takes less than 5 minutes. Once you complete it, you'll feel ready to tackle the next one!"`;
  }

  if (!evening && activeTasks.length > 0) {
    const tasksWithFirstSteps = activeTasks.filter(t => {
      const title = t.title.toLowerCase();
      const avoidWords = ['plan', 'organize', 'restructure', 'rebuild', 'overhaul', 'redo entire'];
      return !avoidWords.some(word => title.includes(word));
    });

    const easyTask = tasksWithFirstSteps.find(t => t.energy_required === 'low')
      || tasksWithFirstSteps.find(t => t.energy_required === 'medium' && t.urgency === 'low')
      || tasksWithFirstSteps[0];

    if (easyTask) {
      const easyTaskDesc = easyTask.description ? `\nTASK DESCRIPTION: ${easyTask.description}` : '';
      const allTaskContext = activeTasks.slice(0, 8).map(t => {
        const d = t.description ? ` — ${t.description}` : '';
        return `- "${t.title}"${d}`;
      }).join('\n');

      contextualGuidance += `

ACTIONABLE TASK SUGGESTION:
Suggest starting with: "${easyTask.title}" (${easyTask.energy_required || 'medium'} energy)${easyTaskDesc}

ALL ACTIVE TASKS (for context — you may pick a different one if the suggested task is ambiguous):
${allTaskContext}

CRITICAL INSTRUCTION: Do NOT just say "start with [task name]". Instead, SUGGEST A SPECIFIC FIRST STEP for this task.

RESEARCH RULE: Many task titles are brand names, apps, subscriptions, or products (e.g. "cancel everyday dose" is a coffee subscription, NOT a pharmacy; "cancel Spotify" is an app). Before suggesting a first step, use the task description AND web search to understand what the task ACTUALLY refers to. Do NOT assume a task requires a phone call unless it clearly says "call" or names a person/business you contact by phone. If a task is ambiguous and you cannot determine what it refers to, give a generic first step like "open the relevant app or website and find the cancel option" rather than guessing.

Examples of first steps:
- For "cancel everyday dose" (coffee subscription): "open the Everyday Dose app or your email receipt and find the manage subscription option"
- For "remind dad about door": "send him a quick text"
- For "go through subscriptions": "open your email and search for 'subscribe confirmation'"
- For "write email": "open a blank email and write the subject line"
- For "clean kitchen": "fill the sink with water"
- For "organize photos": "open your photo library"

Always make the first step tiny, concrete, and something they can do RIGHT NOW in under 2 minutes. Format: "The first step is to [specific action]"`;
    }
  }

  const prompt = `You're giving quick, practical advice to someone who needs help getting stuff done. Be warm and real - like texting a friend who's stuck.

      CRITICAL RULES:
      1. Keep it SHORT - 1-2 sentences max
      2. Be conversational and understanding (not clinical or diagnostic)
      3. ONE SPECIFIC FIRST STEP they can take right now (under 2 minutes)
      4. A touch of humor is good, but stay practical
      5. No "your ADHD brain" or othering language - just helpful tips anyone could use
      6. Make them feel understood, not analyzed
      7. IF YOU MENTION A TASK, ALWAYS INCLUDE THE EXACT FIRST STEP, NOT JUST THE TASK ITSELF

      ${contextualGuidance}

      CONTEXT:
      - Active tasks (due today or no due date): ${activeTasks.length}
      - Snoozed tasks (due today or no due date): ${snoozedTasks.length}
      - Upcoming tasks (due later): ${upcomingTasks.length}
      - Tasks created today: ${createdToday.length}
      - Completed today: ${effectiveCompleted.length}
      - Streak: ${currentStreak} days

      EXAMPLES OF FIRST-STEP TIPS:

      "Procrastinating on that email? Open a blank one and type just the subject line. That tiny start breaks the ice."

      "That subscription task on your list? Open your email and search 'subscribe' — you'll spot all the receipts in seconds."

      "Task feels overwhelming? Just do the first tiny step - open the document, grab the spray bottle, or pull out your phone. Once you start, continuing is easier."

      "Can't find the energy to start? Grab a timer, set it for 2 minutes, and do the easiest possible version. Starting creates momentum - waiting for motivation doesn't."

      "Movement gets the blood flowing: stand up, do 5 jumping jacks, then immediately dive into your first step. Your brain needs the reset."

      Return ONLY the tip text, nothing else.`;

  const response = await base44.functions.invoke('generateDailyTip', { prompt });

  const tipText = response?.data?.tipText;
  const category = response?.data?.category;

  const newTip = await base44.entities.DailyTip.create({
    tip_text: tipText,
    category,
    shown_date: today,
    prompt_version: CURRENT_PROMPT_VERSION
  });

  return newTip;
}

// Delete any tip stored for the given local date so a fresh one can be generated.
export async function clearTodaysTip(today) {
  const existing = await base44.entities.DailyTip.filter({ shown_date: today });
  for (const t of existing) {
    await base44.entities.DailyTip.delete(t.id);
  }
}