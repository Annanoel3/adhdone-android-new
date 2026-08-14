import { Task } from "@/entities/Task";

// Mark all active subtasks of a parent task as completed when the parent
// is completed. The onTaskUpdate entity automation handles cancelling each
// subtask's scheduled notifications (same as it does for the parent).
export async function completeSubtasks(parentTaskId) {
  if (!parentTaskId) return;

  const now = new Date();
  const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();

  const activeSubtasks = await Task.filter({ parent_task_id: parentTaskId, status: 'active' });
  if (activeSubtasks.length === 0) return;

  await Task.bulkUpdate(
    activeSubtasks.map((s) => ({ id: s.id, status: 'completed', completed_at: localISOString }))
  );
}