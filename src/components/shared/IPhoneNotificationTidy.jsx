import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isIPhoneApp } from '@/lib/phonePlatform';

// iPhone only (Oct 30 2026). On Android a finished task's reminders are taken
// off the phone by a silent push the phone filters (TaskPushes.finished). The
// iPhone app has no such filter yet (IOS_PLAN.md phase 2), so a reminder that
// was already showing stayed in Notification Center after the task was done,
// and tapping it opened a task that was finished. Here, whenever the app opens,
// comes back to the front, or a task changes, the app asks the phone which
// tasks the reminders still showing are about (NotifyBridge.deliveredTaskIds),
// looks those tasks up, and clears the reminders for any that are done or gone
// (NotifyBridge.clearTask). Reminders for open tasks are never touched.

const DONE = new Set(['completed', 'archived', 'deleted', 'cancelled']);
let running = false;
let again = false;

async function tidy() {
  const NB = window.Capacitor?.Plugins?.NotifyBridge;
  if (typeof NB?.deliveredTaskIds !== 'function' || typeof NB?.clearTask !== 'function') return;
  if (running) { again = true; return; }
  running = true;
  try {
    const res = await NB.deliveredTaskIds();
    const ids = Array.isArray(res?.taskIds) ? res.taskIds.slice(0, 30) : [];
    for (const id of ids) {
      let rows = null;
      try {
        rows = await base44.entities.Task.filter({ id });
      } catch (e) {
        continue; // couldn't look it up (offline): leave the reminder alone
      }
      const task = Array.isArray(rows) ? rows[0] : null;
      if (!task || DONE.has(String(task.status || ''))) {
        await NB.clearTask({ taskId: id }).catch(() => {});
      }
    }
  } catch (e) {
    // Best effort; the next open tries again.
  } finally {
    running = false;
    if (again) { again = false; setTimeout(tidy, 1000); }
  }
}

export default function IPhoneNotificationTidy() {
  useEffect(() => {
    if (!isIPhoneApp()) return undefined;
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(tidy, 1500); };
    const onVisible = () => { if (document.visibilityState === 'visible') soon(); };
    soon();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('tasks-changed', soon);
    window.addEventListener('task-done', soon);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('tasks-changed', soon);
      window.removeEventListener('task-done', soon);
    };
  }, []);
  return null;
}
