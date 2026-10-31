// Who sees Goals (Anna, Oct 31 2026: "Show goals only on my account for now").
//
// THE one gate for everything Goals: the Tools menu item, the /Goals,
// /Planner and /goal/:id pages (anyone else is sent Home), the Home card and
// GoalStepSync. To open Goals to everyone, change the one line in
// goalsEnabled to `return !!user?.email;`.
const GOALS_ACCOUNTS = ['s2kap2chick@gmail.com'];

export function goalsEnabled(user) {
  return !!user?.email && GOALS_ACCOUNTS.includes(String(user.email).trim().toLowerCase());
}
