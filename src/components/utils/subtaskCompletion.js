import { Task } from "@/entities/Task";

// Mark all active subtasks of a parent task as completed when the parent
// is completed. The onTaskUpdate entity automation handles cancelling each
// subtask's scheduled notifications (same as it does for the parent).
export async function completeSubtasks(parentTaskId) {
  if (!parentTaskId) return;

  // True UTC, like every other way a task gets finished (until Oct 16 2026
  // this stamped local clock time as UTC, hours off for everyone).
  const localISOString = new Date().toISOString();

  const activeSubtasks = await Task.filter({ parent_task_id: parentTaskId, status: 'active' });
  if (activeSubtasks.length === 0) return;

  await Task.bulkUpdate(
    activeSubtasks.map((s) => ({ id: s.id, status: 'completed', completed_at: localISOString }))
  );
}