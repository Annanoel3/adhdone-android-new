import { base44 } from "@/api/base44Client";
import { cancelScheduledReminder } from "./reminderScheduler";
import { refreshAlarms } from "./widgetBridge";

// Turns a task into a Parking Lot idea and carries everything on it along:
// description, notes (including ones typed but not saved yet), pictures,
// location and its steps. Then the task, its steps and its reminders go.
export async function moveTaskToParkingLot(task, { notes, pictures, subTasks = [] } = {}) {
  const realSteps = subTasks.filter((s) => !String(s.id).startsWith("temp_"));
  const steps = realSteps.map((s) => `${s.status === "completed" ? "✓" : "•"} ${s.title}`);
  const noteParts = [
    (notes ?? task.notes ?? "").trim(),
    steps.length ? `Steps:\n${steps.join("\n")}` : "",
    task.location ? `Location: ${task.location}` : "",
  ].filter(Boolean);

  const ids = Array.from(new Set([
    ...(task.onesignal_notification_ids || []),
    ...(task.reminder_schedule || []).map((r) => r?.notification_id),
  ])).filter((id) => id && !String(id).startsWith("planned_"));
  if (ids.length) await cancelScheduledReminder(ids).catch(() => {});

  await base44.entities.ParkingLotIdea.create({
    idea: task.title + (task.description ? `\n\n${task.description}` : ""),
    ...(noteParts.length ? { notes: noteParts.join("\n\n") } : {}),
    pictures: pictures?.length ? pictures : task.pictures || [],
    converted_to_task: false,
  });
  for (const s of realSteps) await base44.entities.Task.delete(s.id).catch(() => {});
  await base44.entities.Task.delete(task.id);
  refreshAlarms().catch(() => {});
}