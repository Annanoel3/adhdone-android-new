import React from "react";
import { base44 } from "@/api/base44Client";
import { scheduleReminder } from "./reminderScheduler";
import { getReminderCopy, smartSnoozeTime } from "./reminderCopy";
import { refreshAlarms } from "./widgetBridge";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

// The ONE way to snooze a task from a button.
//
// A snooze adds ONE extra reminder at the chosen time and counts the snooze.
// That is all it does. It never cancels or moves anything else: the task's
// remaining reminders — the rest of the smart schedule, tomorrow's, the day
// after's — carry on exactly as booked, so a task that isn't finished today
// still reminds as normal tomorrow. (It used to cancel every booked push and
// replace them with the snoozed one, which quietly wiped the rest.)
//
// The task stays ACTIVE and keeps its own date and time; only the extra
// reminder is new. The extra push joins onesignal_notification_ids so that
// completing the task still cancels it.
//
// Returns the time the extra reminder will fire.
export async function snoozeTaskUntil(task, when) {
  const user = await base44.auth.me();
  const snoozeUntil = new Date(when);

  let notificationId = null;
  try {
    notificationId = await scheduleReminder({
      email: user.email,
      ...getReminderCopy(task, snoozeUntil),
      sendAtISO: snoozeUntil.toISOString(),
      taskId: task.id,
      data: { screen: "/TaskNotification", taskId: task.id, urgency: task.urgency, type: "task_reminder", snoozed: true },
    });
  } catch (e) {
    // Too soon, or refused as a duplicate of a push already booked for that
    // minute — either way the schedule already covers it. The snooze still counts.
    console.warn("[snoozeTask] extra reminder not booked:", e?.message || e);
  }

  const ids = Array.from(new Set([
    ...(task.onesignal_notification_ids || []),
    ...(notificationId ? [notificationId] : []),
  ]));

  await base44.entities.Task.update(task.id, {
    snooze_count: (task.snooze_count || 0) + 1,
    consecutive_snoozes: (task.consecutive_snoozes || 0) + 1,
    onesignal_notification_ids: ids,
  });

  return snoozeUntil;
}

export async function snoozeTask(task, minutes) {
  const when = smartSnoozeTime(task, new Date(Date.now() + minutes * 60 * 1000));
  return snoozeTaskUntil(task, when);
}

// Closed, swiped away, opened and left, or rang out with nobody answering:
// nothing happens to the task's reminders. This only keeps count.
export function recordReminderDismissed(task) {
  if (!task?.id) return Promise.resolve();
  return base44.entities.Task.update(task.id, {
    dismissed_count: (task.dismissed_count || 0) + 1,
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Delete with a five-second undo.
//
// The task leaves the screen at once, a toast offers Undo for five seconds,
// and only when those pass (or the app is sent to the background — a delete
// must never quietly survive a swipe-away) does anything actually happen:
// the task's pending pushes are cancelled and the record removed. Undo just
// stops the clock — nothing was cancelled or deleted yet, so the task comes
// back exactly as it was, reminders included.
//
// Shared by the quick-view trash icon and the details card, so both delete
// the same way. Callers remove the task from their own state before calling
// and get it back through the 'tasks-changed' event on undo.
const UNDO_MS = 5000;
const pendingDeletes = new Map();

function commitAllPending() {
  for (const p of Array.from(pendingDeletes.values())) p.commit();
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", commitAllPending);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") commitAllPending();
  });
}

async function reallyDelete(records) {
  for (const t of records) {
    try {
      await base44.functions.invoke("cancelTaskNotifications", { taskId: t.id });
    } catch (e) {
      console.warn("[deleteTask] could not cancel reminders for", t.id, e?.message || e);
    }
  }
  for (const t of records) {
    try {
      await base44.entities.Task.delete(t.id);
    } catch (e) {
      console.error("[deleteTask] delete failed for", t.id, e);
    }
  }
  refreshAlarms().catch(() => {});
}

export function deleteTaskWithUndo(task, subtasks = []) {
  if (!task?.id || pendingDeletes.has(task.id)) return;
  const records = [task, ...(subtasks || []).filter((s) => s?.id)];
  let settled = false;
  let handle = null;

  const commit = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pendingDeletes.delete(task.id);
    handle?.dismiss?.();
    reallyDelete(records);
  };
  const undo = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pendingDeletes.delete(task.id);
    handle?.dismiss?.();
    window.dispatchEvent(new CustomEvent("tasks-changed"));
  };

  const timer = setTimeout(commit, UNDO_MS);
  pendingDeletes.set(task.id, { commit });
  handle = toast({
    title: `Deleted "${task.title || "task"}"`,
    duration: UNDO_MS,
    action: React.createElement(ToastAction, { altText: "Undo delete", onClick: undo }, "Undo"),
  });
}
