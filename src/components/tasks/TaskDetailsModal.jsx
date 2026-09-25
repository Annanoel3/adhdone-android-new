import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Clock,
  CalendarClock,
  Zap,
  ListChecks,
  Sparkles,
  Plus,
  Trash2,
  Undo,
  Mic,
  Keyboard,
  Pencil,
  Check,
  X,
  Lightbulb,
  Image as ImageIcon,
  Upload,
  FileText,
  Bell,
  BellOff,
  AlarmClock,
  Info
} from "lucide-react";
import { Task } from "@/entities/Task";
import TaskDecompositionModal from "./TaskDecompositionModal";
import SmartReminderEditor from "./SmartReminderEditor";
import AddSubTaskCard from "./AddSubTaskCard";
import ReminderTypeSelector, { getCurrentReminderType } from "./ReminderTypeSelector";
import { supportsAlarms, alertStyleFor, refreshAlarms, requestAlarmPermissions } from "../utils/widgetBridge";
import { AlertStyleInfo } from "../shared/QuickCapturePrompt";
import VoiceTaskInput from "./VoiceTaskInput";
import { scheduleReminder, cancelScheduledReminder } from "../utils/reminderScheduler";
import { deleteTaskWithUndo } from "../utils/snoozeTask";
import { User } from "@/entities/User";
import { base44 } from "@/api/base44Client";
import ImageViewer from "../shared/ImageViewer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverClose,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LaunchButtons from "../launch/LaunchButtons";
import LocationField from "./LocationField";
import SmartDueDatePill from "./SmartDueDatePill";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { Cake } from "lucide-react";
import { trackFire } from "@/lib/appTrack";

// A task nagging at a rhythm ("at 10 am, keep reminding me until I do it")
// has its next_reminder moved along with every ping, so next_reminder is when
// the NEXT ping goes out, not the task's time — showing it made a 10 AM task
// read "Due 2:00 PM" by the afternoon. Its time is the one the person named
// (anchor_time), on the day this round of pings started: next_reminder's day,
// or the day before when the pings have rolled overnight into a morning that
// is still before that time. An all-day task is due at the END of its day
// (due_date), not at the 9 AM anchor its next_reminder holds — it isn't
// overdue at 9:01 AM.
const RHYTHM_INTERVALS = ['10min', '20min', '30min', '1hour', '2hours', '4hours', 'daily', 'every_other_day'];
function shownDueISO(task) {
  if (task?.day_only_task && task?.due_date) return task.due_date;
  const fallback = task?.next_reminder || task?.due_date || null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task?.anchor_time || ''));
  if (!task || !m || task.day_only_task || !RHYTHM_INTERVALS.includes(task.reminder_interval) || !task.next_reminder) return fallback;
  const cursor = new Date(task.next_reminder);
  if (isNaN(cursor.getTime())) return fallback;
  const named = new Date(cursor);
  named.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (cursor.getTime() < named.getTime()) named.setDate(named.getDate() - 1);
  return named.toISOString();
}

export default function TaskDetailsModal({ task: taskProp, isOpen, onClose, onUpdate: onUpdateProp, onDelete, onComplete, theme, itemClassification }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Optimistic changes are applied to a LOCAL copy first, so pills like the
  // Type chip flip the instant the user picks something — even if the parent
  // page is slow to hand the updated record back down.
  const [localPatch, setLocalPatch] = useState({});
  useEffect(() => { setLocalPatch({}); }, [taskProp?.id]);
  const task = taskProp ? { ...taskProp, ...localPatch } : null;
  const onUpdate = (updated) => {
    if (updated && updated.id && updated.id === taskProp?.id) {
      setLocalPatch((prev) => ({ ...prev, ...updated }));
    }
    if (onUpdateProp) onUpdateProp(updated);
  };
  const [subTasks, setSubTasks] = useState([]);
  const [newSubTask, setNewSubTask] = useState("");
  const [showDecomposition, setShowDecomposition] = useState(false);
  const [previousSubTasks, setPreviousSubTasks] = useState(null);
  const [hasDecomposedSuccessfully, setHasDecomposedSuccessfully] = useState(false);
  const [subtaskInputMode, setSubtaskInputMode] = useState('text');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task ? task.title : '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [taskPictures, setTaskPictures] = useState([]);
  const [taskNotes, setTaskNotes] = useState('');
  const [viewingImage, setViewingImage] = useState(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  // Birthdays: the time their reminders go out (editable on the card).
  const [birthdayTime, setBirthdayTime] = useState('');
  const [isSavingBirthdayTime, setIsSavingBirthdayTime] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);
  // v2 card layout only: notes / pictures start folded into "+ Add a …" links.
  const [v2NotesOpen, setV2NotesOpen] = useState(false);
  const [v2PicsOpen, setV2PicsOpen] = useState(false);
  const reminderDateRef = useRef('');
  const reminderTimeRef = useRef('');
  const isInitializingRef = useRef(false);

  useEffect(() => {
    if (task && isOpen) {
      fetchSubTasks(task.id);
      setPreviousSubTasks(null);
      setHasDecomposedSuccessfully(false);
      setEditedTitle(task.title);
      setIsEditingTitle(false);
      setTaskPictures(task.pictures || []);
      setTaskNotes(task.notes || '');
      // Initialize controlled date/time inputs from task
      isInitializingRef.current = true;
      // due_date is the fallback — parser-created tasks only have that one. A
      // task pinging at a rhythm shows the time the person named, not the
      // next ping (see shownDueISO).
      const dateSource = shownDueISO(task);
      if (dateSource) {
        const d = new Date(dateSource);
        const rd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const rt = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        // Day-only tasks have no user-chosen time (we anchor them at 9 AM
        // internally) — leave the time field blank so reopening and re-saving
        // doesn't silently turn "due that day" into "due at 9:00 AM".
        const rtShown = task.day_only_task ? '' : rt;
        setReminderDate(rd);
        setReminderTime(rtShown);
        setBirthdayTime(rt);
        reminderDateRef.current = rd;
        reminderTimeRef.current = rtShown;
      } else {
        setReminderDate('');
        setReminderTime('');
        setBirthdayTime('');
        reminderDateRef.current = '';
        reminderTimeRef.current = '';
      }
      // Events captured by the parser store the date on next_reminder and may
      // have no separate event_time yet — fall back to it so the pickers open
      // pre-filled with the date the event already has.
      const eventSource = task.event_time || task.next_reminder || task.due_date;
      if (eventSource) {
        const ed = new Date(eventSource);
        setEventDate(`${ed.getFullYear()}-${String(ed.getMonth()+1).padStart(2,'0')}-${String(ed.getDate()).padStart(2,'0')}`);
        setEventTime(task.day_only_task && !task.event_time
          ? ''
          : `${String(ed.getHours()).padStart(2,'0')}:${String(ed.getMinutes()).padStart(2,'0')}`);
      } else {
        setEventDate('');
        setEventTime('');
      }
      setTimeout(() => { isInitializingRef.current = false; }, 100);

      // Self-heal tasks created before repeats and smart schedules were kept
      // separate: a repeating task must never carry a lead-time reminder plan,
      // so drop the lead-time part (and its live notifications) the first time
      // it's opened. The reminder AT the task's own time stays: that is the one
      // reminder a repeating task is meant to have. (This used to cancel every
      // push and book nothing, so just opening a repeating task silenced it.)
      // Anything booked outside the plan (a snooze) is left alone too.
      // Never a birthday: it repeats yearly, but its schedule IS its reminders
      // (a week before, the day before, on the day) — this used to cancel them
      // every time a birthday was opened.
      if (task.recurrence_pattern && task.recurrence_pattern !== 'none' && getCurrentReminderType(task) !== 'birthday' && (task.reminder_schedule || []).length > 0) {
        const ownTime = task.classification === 'event' ? (task.event_time || task.next_reminder) : task.next_reminder;
        const ownMs = !task.day_only_task && ownTime ? new Date(ownTime).getTime() : NaN;
        const isAtOwnTime = (r) => Number.isFinite(ownMs) && !!r?.send_at && Math.abs(new Date(r.send_at).getTime() - ownMs) < 60 * 1000;
        const keep = task.reminder_schedule.filter(isAtOwnTime).slice(0, 1);
        const leadTime = task.reminder_schedule.filter((r) => !keep.includes(r));
        if (leadTime.length > 0) {
          const staleIds = Array.from(new Set(
            leadTime.map((r) => r?.notification_id).filter((id) => id && !String(id).startsWith('planned_'))
          ));
          const keptIds = (task.onesignal_notification_ids || []).filter((id) => !staleIds.includes(id));
          (async () => {
            try {
              if (staleIds.length > 0) await cancelScheduledReminder(staleIds).catch(() => {});
              await Task.update(task.id, { reminder_schedule: keep, onesignal_notification_ids: keptIds });
              onUpdate({ ...task, reminder_schedule: keep, onesignal_notification_ids: keptIds });
              refreshAlarms().catch(() => {});
            } catch (e) {
              console.error('Failed to clear stale schedule on repeating task:', e);
            }
          })();
        }
      }
    }
  }, [task?.id, isOpen]);

  const fetchSubTasks = async (taskId) => {
    // Sub-tasks are STEPS — always show them in the order they're performed:
    // by subtask_order when set, otherwise oldest-created first. Sorting by
    // '-created_date' showed the last step first (put clothes away before
    // starting the washer).
    const fetchedSubTasks = await Task.filter({ parent_task_id: taskId }, 'created_date');
    const ordered = [...fetchedSubTasks].sort((a, b) => {
      const ao = a.subtask_order ?? Infinity;
      const bo = b.subtask_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(a.created_date) - new Date(b.created_date);
    });
    setSubTasks(ordered);
    return ordered;
  };

  const handleSubTaskToggle = async (subTask) => {
    const newStatus = subTask.status === 'completed' ? 'active' : 'completed';
    // Counted, so we can see how often a finished step is taken back.
    if (newStatus === 'active') trackFire('task_uncompleted', { props: { task_id: subTask.id, source: 'task_details_step' } });
    // Optimistic — update local state immediately
    setSubTasks(prev => prev.map(s => s.id === subTask.id ? { ...s, status: newStatus } : s));
    if (onUpdate) {
      onUpdate(task);
    }
    // Save in the background, then re-fetch to sync
    base44.entities.Task.update(subTask.id, { status: newStatus })
      .then(() => fetchSubTasks(task.id))
      .catch(error => console.error("Error toggling subtask:", error));
  };

  const handleAddSubTask = async (e) => {
    e.preventDefault();
    if (!newSubTask.trim() || !task) return;

    try {
      // Split by comma to support multiple subtasks
      const subtaskTitles = newSubTask.split(',').map(s => s.trim()).filter(s => s.length > 0);

      // Optimistic — add subtasks to local state immediately
      const tempSubTasks = subtaskTitles.map((title, i) => ({
        id: `temp_${Date.now()}_${i}`,
        title,
        parent_task_id: task.id,
        urgency: task.urgency,
        energy_required: task.energy_required,
        status: 'active',
        reminder_interval: 'once',
        subtask_order: subTasks.length + i + 1,
      }));
      setSubTasks(prev => [...prev, ...tempSubTasks]);
      setNewSubTask("");
      if (onUpdate) onUpdate(task);

      // Create all subtasks in the background
      (async () => {
        try {
          for (let i = 0; i < subtaskTitles.length; i++) {
            const title = subtaskTitles[i];
            await Task.create({
              title: title,
              parent_task_id: task.id,
              subtask_order: subTasks.length + i + 1,
              urgency: task.urgency,
              energy_required: task.energy_required,
              status: 'active',
              // Steps are a checklist — the parent task does all the
              // reminding (same as SubtaskQuickAdd). A step given the
              // parent's interval and a recipient got pushes of its own
              // from the hourly refill.
              reminder_interval: 'once',
              reminder_count: 0,
            });
          }
          // Re-fetch to replace temp subtasks with real ones
          await fetchSubTasks(task.id);
          if (onUpdate) onUpdate(task);
        } catch (error) {
          console.error("Error adding subtask:", error);
          fetchSubTasks(task.id);
        }
      })();
    } catch (error) {
      console.error("Error adding subtask:", error);
    }
  };

  const handleVoiceSubtask = async (transcription) => {
    if (!transcription.trim() || !task) return;

    setIsProcessingVoice(true);

    try {
      const prompt = `Parse this voice input and extract task items to add as sub-tasks:

INPUT: "${transcription}"

If it's a list of things, return each as a separate subtask.
If it's one thing, return it as a single subtask.

CRITICAL: Maintain the EXACT ORDER the items were spoken in.

Return JSON:
{
  "subtasks": ["subtask 1", "subtask 2", ...] (IN THE ORDER SPOKEN)
}`;

      const result = await base44.functions.invoke('extractSubtasks', { prompt });
      const response = result?.data?.response;

      const spoken = response.subtasks || [];

      // OPTIMISTIC: show the parsed steps right away, then create them in the
      // background — the user shouldn't stare at a spinner after speaking.
      setSubTasks(prev => [
        ...prev,
        ...spoken.map((title, i) => ({
          id: `temp_${Date.now()}_${i}`,
          title: title.trim(),
          parent_task_id: task.id,
          status: 'active',
          subtask_order: prev.length + i + 1,
        })),
      ]);
      setIsProcessingVoice(false);

      for (let i = 0; i < spoken.length; i++) {
        const subtaskTitle = spoken[i];
        await Task.create({
          title: subtaskTitle.trim(),
          parent_task_id: task.id,
          subtask_order: subTasks.length + i + 1,
          urgency: task.urgency,
          energy_required: task.energy_required,
          status: 'active',
          // Steps are a checklist — the parent task does all the reminding
          // (same as SubtaskQuickAdd); no interval, time or recipient of
          // their own, so nothing books pushes for them.
          reminder_interval: 'once',
          reminder_count: 0,
        });
      }

      await fetchSubTasks(task.id);
      
      // Call onUpdate with parent task to trigger refresh
      if (onUpdate) {
        onUpdate(task);
      }
    } catch (error) {
      console.error("Error processing voice subtask:", error);
      alert("Failed to process voice input. Please try again.");
    }

    setIsProcessingVoice(false);
  };

  const handleDeleteSubTask = async (subTaskId) => {
    // Optimistic — remove from local state immediately
    setSubTasks(prev => prev.filter(s => s.id !== subTaskId));
    if (onUpdate) {
      onUpdate(task);
    }
    // Delete in the background, then re-fetch to sync
    Task.delete(subTaskId)
      .then(() => fetchSubTasks(task.id))
      .catch(error => console.error("Error deleting subtask:", error));
  };

  const handleUndoDecomposition = async () => {
    if (!previousSubTasks || !task) return;

    const previousSubTaskIds = new Set(previousSubTasks.map(st => st.id));
    const tasksToDelete = subTasks.filter(st => !previousSubTaskIds.has(st.id));

    // OPTIMISTIC: revert the list instantly, then delete in the background.
    setSubTasks(previousSubTasks);
    setPreviousSubTasks(null);
    setHasDecomposedSuccessfully(false);

    (async () => {
      try {
        for (const subTaskToDelete of tasksToDelete) {
          await Task.delete(subTaskToDelete.id);
        }
        await fetchSubTasks(task.id);
        onUpdate();
      } catch (e) {
        console.error('Error undoing breakdown:', e);
        fetchSubTasks(task.id);
      }
    })();
  };

  const handleSaveTitle = async () => {
    if (!editedTitle.trim() || !task) {
      setEditedTitle(task?.title || '');
      setIsEditingTitle(false);
      return;
    }

    // Optimistic update — user sees the title change instantly
    onUpdate({ ...task, title: editedTitle.trim() });
    setIsEditingTitle(false);

    const newTitle = editedTitle.trim();
    try {
      if (task.reminder_interval && task.reminder_interval !== 'once') {
        // A rhythm task ("every hour until I do it"): just save the title.
        // onTaskUpdate re-books its pushes itself when the title changes
        // (with quiet hours and the new name). Re-booking here as well booked
        // ten pushes the server then cancelled, and the title was only saved
        // after all ten — or never, when the task had no next_reminder.
        Task.update(task.id, { title: newTitle }).catch(error => {
          console.error("Error updating task title:", error);
        });
      } else if (task.reminder_schedule && task.reminder_schedule.length > 0) {
        // One-time / event task: every reminder still AHEAD is re-booked at
        // the same moment with the new title, each in its own words (the
        // task's name swapped inside them). Ones already sent stay as they
        // were: re-booking a past time is refused, and that one refusal used
        // to abort the whole loop — the title was never saved and every
        // reminder after it was lost.
        // The title is saved first, so nothing below can lose it.
        await Task.update(task.id, { title: newTitle });

        const oldTitle = (task.title || '').trim();
        const short = (t) => (t.length > 40 ? `${t.slice(0, 37)}...` : t);
        const renameIn = (text, isBody) => {
          const src = String(text || '');
          if (oldTitle.length >= 3 && src.includes(oldTitle)) return src.split(oldTitle).join(newTitle);
          const oldShort = short(oldTitle);
          if (oldShort !== oldTitle && src.includes(oldShort)) return src.split(oldShort).join(short(newTitle));
          // Words that never named the task: keep them, and still say what
          // the reminder is for.
          if (isBody) return src ? `${newTitle}: ${src}` : newTitle;
          const lead = ((src.match(/^[^\p{L}\p{N}]+/u) || [''])[0]).trim();
          return `${lead || '📌'} ${newTitle}`;
        };

        let email = null;
        try { email = (await base44.auth.me())?.email || null; } catch (e) { email = null; }
        const soon = Date.now() + 2 * 60 * 1000;
        const newSchedule = [];
        const replacedIds = [];
        const addedIds = [];
        for (const entry of task.reminder_schedule) {
          const sendMs = entry?.send_at ? new Date(entry.send_at).getTime() : NaN;
          if (!Number.isFinite(sendMs) || sendMs <= soon) {
            newSchedule.push(entry);
            continue;
          }
          const title = renameIn(entry.notification_title, false);
          const body = renameIn(entry.notification_body, true);
          const oldId = entry.notification_id || null;
          // Not booked yet (planned far out) or parked on the Back Burner:
          // only its words change — whoever books it later books these.
          if (!oldId || String(oldId).startsWith('planned_') || task.silenced) {
            newSchedule.push({ ...entry, notification_title: title, notification_body: body });
            continue;
          }
          let newId = null;
          try {
            // The old push goes first: the send ledger turns away a second
            // push for the same task at the same minute.
            await cancelScheduledReminder([oldId]);
            replacedIds.push(oldId);
            newId = await scheduleReminder({
              email,
              title,
              body,
              sendAtISO: entry.send_at,
              taskId: task.id,
              // send_at is already the real send time (moved for quiet hours
              // when it was first booked) — keep it exactly.
              exact: true,
              data: {
                screen: '/TaskNotification',
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder',
              },
              buttons: [
                { id: 'snooze_15', text: 'Snooze 15 min' },
                { id: 'snooze_60', text: 'Snooze 1 hour' },
                { id: 'complete', text: '✅ Done' },
              ],
            });
          } catch (error) {
            console.error("Could not re-book one reminder with the new title:", error);
          }
          if (newId) addedIds.push(newId);
          // Saved even when the booking failed, with no id: the hourly refill
          // books any schedule entry that has none.
          newSchedule.push({ ...entry, notification_id: newId || null, notification_title: title, notification_body: body });
        }
        // Anything booked outside the plan (a snooze) is kept.
        const ids = [
          ...(task.onesignal_notification_ids || []).filter((id) => !replacedIds.includes(id)),
          ...addedIds,
        ];
        await Task.update(task.id, {
          reminder_schedule: newSchedule,
          onesignal_notification_ids: Array.from(new Set(ids)),
        });
        refreshAlarms().catch(() => {});
      } else {
        // Just update title if no recurring reminders
        Task.update(task.id, { title: newTitle }).catch(error => {
          console.error("Error updating task title:", error);
        });
      }
    } catch (error) {
      console.error("Error saving title:", error);
    }
  };

  const handleUpdateField = async (field, value) => {
    if (!task) return;

    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, [field]: value });

    try {
      const updates = { [field]: value };
      
      // CRITICAL: Only cancel reminders for the ONE field that actually
      // reschedules them below (reminder_interval). Cancelling on any other
      // field — urgency, energy, notes — silently killed the task's live
      // notifications with nothing to replace them.
      const shouldCancelReminders = field === 'reminder_interval' &&
        task.onesignal_notification_ids &&
        task.onesignal_notification_ids.length > 0;
      
      if (shouldCancelReminders) {
        try {
          await cancelScheduledReminder(task.onesignal_notification_ids);
        } catch (error) {
          console.error("Failed to cancel existing reminders:", error);
        }
      }

      // If changing reminder interval, recalculate next_reminder and schedule new notifications
      if (field === 'reminder_interval') {
        const now = new Date();
        let nextReminderDate = null;
        const currentUser = await User.me();

        const intervalMs = {
          '10min': 10 * 60 * 1000,
          '20min': 20 * 60 * 1000,
          '30min': 30 * 60 * 1000,
          '1hour': 60 * 60 * 1000,
          '2hours': 2 * 60 * 60 * 1000,
          '4hours': 4 * 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every_other_day': 2 * 24 * 60 * 60 * 1000,
        };

        if (value === 'once') {
          // If changing to 'once', keep current next_reminder if it exists,
          // otherwise set a default future date (e.g., tomorrow 9 AM)
          if (task.next_reminder) {
            // Parse preserving local time — avoid UTC midnight crossing
            const d = new Date(task.next_reminder);
            nextReminderDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
          } else {
            nextReminderDate = new Date();
            nextReminderDate.setDate(nextReminderDate.getDate() + 1);
            nextReminderDate.setHours(9, 0, 0, 0);
          }
          // Ensure it's in the future
          if (nextReminderDate <= now) {
            nextReminderDate.setDate(nextReminderDate.getDate() + 1);
          }
          
          updates.next_reminder = nextReminderDate.toISOString();
          updates.onesignal_notification_ids = [];
          updates.reminder_schedule = null;

          // Schedule single one-time reminder
          try {
            const { getReminderCopy } = await import('../utils/reminderCopy');
            const notificationId = await scheduleReminder({
              email: currentUser.email,
              ...getReminderCopy(task, nextReminderDate),
              sendAtISO: nextReminderDate.toISOString(),
              taskId: task.id,
              data: {
                screen: "/TaskNotification",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });
            if (notificationId) {
              updates.onesignal_notification_ids = [notificationId];
            }
          } catch (error) {
            console.error("Failed to schedule one-time reminder:", error);
          }
        } else if (intervalMs[value]) {
          // FIXED: Preserve existing next_reminder when switching to recurring
          // This allows setting a specific date THEN making it recurring
          if (task.next_reminder) {
            // Parse preserving local time — avoid UTC midnight crossing
            const d = new Date(task.next_reminder);
            nextReminderDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0, 0);
            // Only adjust if in the past
            if (nextReminderDate <= now) {
              nextReminderDate = new Date(now.getTime());
              switch (value) {
                case '10min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 10); break;
                case '20min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 20); break;
                case '30min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 30); break;
                case '1hour': nextReminderDate.setHours(nextReminderDate.getHours() + 1); break;
                case '2hours': nextReminderDate.setHours(nextReminderDate.getHours() + 2); break;
                case '4hours': nextReminderDate.setHours(nextReminderDate.getHours() + 4); break;
                case 'daily': nextReminderDate.setDate(nextReminderDate.getDate() + 1); break;
                case 'every_other_day': nextReminderDate.setDate(nextReminderDate.getDate() + 2); break;
              }
            }
          } else {
            // No existing date, calculate from now
            nextReminderDate = new Date(now.getTime());
            switch (value) {
              case '10min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 10); break;
              case '20min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 20); break;
              case '30min': nextReminderDate.setMinutes(nextReminderDate.getMinutes() + 30); break;
              case '1hour': nextReminderDate.setHours(nextReminderDate.getHours() + 1); break;
              case '2hours': nextReminderDate.setHours(nextReminderDate.getHours() + 2); break;
              case 'daily': nextReminderDate.setDate(nextReminderDate.getDate() + 1); break;
              case 'every_other_day': nextReminderDate.setDate(nextReminderDate.getDate() + 2); break;
            }
          }
          
          updates.next_reminder = nextReminderDate.toISOString();
          updates.reminder_schedule = null;

          // Schedule recurring reminders (10 at a time)
          try {
            const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
            const { getReminderCopy } = await import('../utils/reminderCopy');
            const { notificationIds: newNotificationIds } = await scheduleRecurringReminders({
              email: currentUser.email,
              ...getReminderCopy(task, nextReminderDate),
              startTime: nextReminderDate.toISOString(),
              intervalMs: intervalMs[value],
              count: 10,
              taskId: task.id,
              data: {
                screen: "/TaskNotification",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              }
            });
            updates.onesignal_notification_ids = newNotificationIds || [];
          } catch (error) {
            console.error("Failed to schedule recurring reminders:", error);
            updates.onesignal_notification_ids = [];
          }
        }
      }
      
      // Fire the save in the background — don't block the UI
      Task.update(task.id, updates).catch(error => {
        console.error(`Error updating ${field}:`, error);
      });

      // Sync backend-generated fields (notification IDs, next_reminder)
      onUpdate({ ...task, ...updates });
    } catch (error) {
      console.error(`Error in handleUpdateField for ${field}:`, error);
    }
  };

  const handleUpdateReminderTime = async (selectedTime, selectedDate) => {
    if (!task) return;

    try {
      const currentTaskTime = getCurrentReminderTime(task);
      const currentTaskDate = getCurrentReminderDate(task);

      const effectiveTime = selectedTime !== undefined ? selectedTime : currentTaskTime;
      const effectiveDate = selectedDate !== undefined ? selectedDate : currentTaskDate;

      const _now = new Date();
      const localToday = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
      if (!effectiveDate && !effectiveTime) return;
      // No time given = "get this done by that DAY." We anchor the record at
      // 9 AM so it sorts sensibly, flag it day_only_task, and let the smart
      // reminder system decide when to nudge (night before + day of) instead
      // of pretending the user picked 9 AM as a deadline.
      const dayOnly = !effectiveTime;
      const finalEffectiveDate = effectiveDate || localToday;
      const finalEffectiveTime = effectiveTime || '09:00';

      // Parse date components explicitly to avoid UTC midnight crossing (same as task creation)
      const [year, month, day] = finalEffectiveDate.split('-').map(n => parseInt(n, 10));
      const [hours, minutes] = finalEffectiveTime.split(':').map(n => parseInt(n, 10));
      let nextReminder = new Date(year, month - 1, day, hours, minutes, 0, 0);

      // Past-date guard runs FIRST (synchronously) so we never optimistically
      // show a save that we're about to reject.
      const intervalMsGuard = {
        '10min': 10 * 60 * 1000, '20min': 20 * 60 * 1000, '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000, '2hours': 2 * 60 * 60 * 1000, '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000, 'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };
      const guardNowSync = new Date();
      // Day-only tasks are allowed to sit "in the past" (9 AM today when it's
      // already noon) — the day is what matters, and smart nudges take over.
      const dayOnlyStillValid = dayOnly && finalEffectiveDate >= localToday;
      if (!dayOnlyStillValid && nextReminder <= new Date(guardNowSync.getTime() + 2 * 60 * 1000)) {
        const iv = task.reminder_interval;
        if (iv && iv !== 'once' && intervalMsGuard[iv]) {
          nextReminder = new Date(guardNowSync.getTime() + intervalMsGuard[iv]);
        } else {
          alert("⚠️ The date and time you picked is in the past.\n\nPlease choose a future date and time, then tap Save again.");
          return;
        }
      }

      // Moving a one-time task's date LATER is a push — the Insights page and
      // the smart-nudge LLM count those (due_date_pushes). This card's date
      // pill never counted them; only the quick view and the smart-reminder
      // pill did. Same rule as everywhere else: an earlier date, a first
      // date, or a cleared date is not a push.
      if (!task.reminder_interval || task.reminder_interval === 'once') {
        const oldISO = task.due_date || task.next_reminder;
        if (oldISO && nextReminder.getTime() > new Date(oldISO).getTime()) {
          const pushes = (task.due_date_pushes || 0) + 1;
          task.due_date_pushes = pushes;
          Task.update(task.id, { due_date_pushes: pushes }).catch(() => {});
        }
      }

      // OPTIMISTIC: show the new time + confirmation immediately, then do all
      // the cancel/reschedule network work in the background.
      // The time picked here IS the task's time from now on (anchor_time: what
      // the repeat pill and the Due pill show, and where each new occurrence of
      // a repeating task starts) — even when a rhythm task's first ping has to
      // wait an interval because that time already went by today.
      const namedTime = dayOnly ? null : finalEffectiveTime;
      onUpdate({ ...task, next_reminder: nextReminder.toISOString(), due_date: nextReminder.toISOString(), day_only_task: dayOnly, anchor_time: namedTime });
      const savedRdNow = `${nextReminder.getFullYear()}-${String(nextReminder.getMonth()+1).padStart(2,'0')}-${String(nextReminder.getDate()).padStart(2,'0')}`;
      const savedRtNow = `${String(nextReminder.getHours()).padStart(2,'0')}:${String(nextReminder.getMinutes()).padStart(2,'0')}`;
      setReminderDate(savedRdNow);
      setReminderTime(dayOnly ? '' : savedRtNow);
      reminderDateRef.current = savedRdNow;
      reminderTimeRef.current = dayOnly ? '' : savedRtNow;
      toast({
        title: "Due date saved ✓",
        description: dayOnly
          ? `Due ${nextReminder.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — we'll nudge you the night before and that day.`
          : `We'll remind you an hour before and at ${nextReminder.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`,
      });

      (async () => {
      // Cancel existing reminders — include every notification ID we know about
      // (both onesignal_notification_ids and any IDs stored on individual
      // reminder_schedule entries) so no stale reminder survives a date/time
      // change and fires with outdated "in about 30 minutes" wording.
      const allOldNotificationIds = Array.from(new Set([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map(r => r.notification_id).filter(Boolean)),
      ]));
      if (allOldNotificationIds.length > 0) {
        try {
          await cancelScheduledReminder(allOldNotificationIds);
        } catch (error) {
          console.error("Failed to cancel existing reminders:", error);
        }
      }

      // Reschedule — use recurring or one-time depending on interval (same as task creation)
      let newNotificationIds = [];
      const intervalMs = {
        '10min': 10 * 60 * 1000,
        '20min': 20 * 60 * 1000,
        '30min': 30 * 60 * 1000,
        '1hour': 60 * 60 * 1000,
        '2hours': 2 * 60 * 60 * 1000,
        '4hours': 4 * 60 * 60 * 1000,
        'daily': 24 * 60 * 60 * 1000,
        'every_other_day': 2 * 24 * 60 * 60 * 1000,
      };

      try {
        const currentUser = await base44.auth.me();
        const interval = task.reminder_interval;

        if (interval && interval !== 'once' && intervalMs[interval]) {
          // Recurring: schedule 10 future occurrences (same as creation)
          const { scheduleRecurringReminders } = await import('../utils/reminderScheduler');
          const { getReminderCopy } = await import('../utils/reminderCopy');
          const { notificationIds, lastScheduledUntil } = await scheduleRecurringReminders({
            email: currentUser.email,
            ...getReminderCopy(task, nextReminder),
            startTime: nextReminder.toISOString(),
            intervalMs: intervalMs[interval],
            count: 10,
            taskId: task.id,
            data: {
              screen: "/TaskNotification",
              taskId: task.id,
              urgency: task.urgency,
              type: 'task_reminder'
            },
            buttons: [
              { id: "snooze_15", text: "Snooze 15 min" },
              { id: "snooze_60", text: "Snooze 1 hour" },
              { id: "complete", text: "✅ Done" }
            ]
          });
          newNotificationIds = notificationIds || [];

          Task.update(task.id, {
            next_reminder: nextReminder.toISOString(),
            due_date: nextReminder.toISOString(),
            day_only_task: dayOnly,
            anchor_time: namedTime,
            onesignal_notification_ids: newNotificationIds,
            reminder_schedule: null,
            ...(lastScheduledUntil ? { last_scheduled_until: lastScheduledUntil } : {})
          }).then(() => refreshAlarms()).catch(err => console.error("Error updating task:", err));
        } else {
          // One-time reminder — check for multi-reminder category first
          const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
          const multiIds = await scheduleMultiReminders({
            email: currentUser.email,
            title: task.title,
            scheduledDateISO: nextReminder.toISOString(),
            taskId: task.id,
            urgency: task.urgency,
            dayOnly,
          });

          if (multiIds) {
            newNotificationIds = multiIds;
          } else {
            // No multi-reminder match — single reminder at the scheduled time
            const { getReminderCopy } = await import('../utils/reminderCopy');
            const notificationId = await scheduleReminder({
              email: currentUser.email,
              ...getReminderCopy(task, nextReminder),
              sendAtISO: nextReminder.toISOString(),
              taskId: task.id,
              data: {
                screen: "/TaskNotification",
                taskId: task.id,
                urgency: task.urgency,
                type: 'task_reminder'
              },
              buttons: [
                { id: "snooze_15", text: "Snooze 15 min" },
                { id: "snooze_60", text: "Snooze 1 hour" },
                { id: "complete", text: "✅ Done" }
              ]
            });
            if (notificationId) newNotificationIds = [notificationId];
          }

          Task.update(task.id, {
            next_reminder: nextReminder.toISOString(),
            due_date: nextReminder.toISOString(),
            day_only_task: dayOnly,
            anchor_time: namedTime,
            onesignal_notification_ids: newNotificationIds,
            // A plan that was booked has just been saved by the scheduler
            // itself (reminder_schedule, with each entry's own id and time);
            // writing null here right after wiped it, so the card lost its
            // reminder list and a later rename or back-burner had nothing to
            // work from. Only clear the old plan when no new one was booked.
            ...(multiIds && multiIds.length > 0 ? {} : { reminder_schedule: [] }),
          }).then(() => refreshAlarms()).catch(err => console.error("Error updating task:", err));
        }
      } catch (error) {
        console.error("Failed to reschedule reminder:", error);
      }
      })();
    } catch (error) {
      console.error("Error saving reminder time:", error);
    }
  };

  const handleDueDateChange = async (newDate) => {
    if (!task) return;
    let dueDateValue = null;
    if (newDate) {
      const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
      const existing = task.due_date ? new Date(task.due_date) : null;
      const hours = existing ? existing.getHours() : 17;
      const minutes = existing ? existing.getMinutes() : 0;
      dueDateValue = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
    }
    // Track when the user pushes a due date LATER — used by Insights and the
    // smart-nudge LLM to spot chronically postponed tasks. Only counts as a
    // push when there was an existing due date and the new one is later.
    const updates = { due_date: dueDateValue };
    if (dueDateValue && task.due_date) {
      const oldDate = new Date(task.due_date);
      const newDateObj = new Date(dueDateValue);
      if (newDateObj.getTime() > oldDate.getTime()) {
        updates.due_date_pushes = (task.due_date_pushes || 0) + 1;
      }
    }
    // One-time tasks with a Smart Reminder Schedule: the schedule is anchored
    // to the old date, so a due-date change MUST cancel every old OneSignal
    // notification and regenerate a fresh schedule at the new date. (Recurring
    // interval tasks are rescheduled by the backend onTaskUpdate automation.)
    const hasSmartSchedule = (task.reminder_schedule && task.reminder_schedule.length > 0);
    const isOneTime = !task.reminder_interval || task.reminder_interval === 'once';

    if (isOneTime && (hasSmartSchedule || dueDateValue)) {
      if (dueDateValue) updates.next_reminder = dueDateValue;
      // Optimistic — show the new date and a schedule that's being rebuilt
      onUpdate({ ...task, ...updates, reminder_schedule: [], onesignal_notification_ids: [] });
      toast({ title: 'Due date saved ✓', description: dueDateValue ? 'Rebuilding your reminder schedule…' : undefined });

      (async () => {
        try {
          // Cancel every notification we know about (batch IDs and per-entry
          // IDs), save the new date, and book a fresh plan for it — shared
          // with the Home card's date pill (moveRemindersToDate).
          const { moveRemindersToDate } = await import('../utils/multiReminderScheduler');
          await moveRemindersToDate(task, dueDateValue, updates);
          refreshAlarms().catch(() => {});

          if (dueDateValue) {
            const refreshed = await Task.filter({ id: task.id });
            if (refreshed[0]) onUpdate(refreshed[0]);
          }
        } catch (error) {
          console.error('Error rescheduling reminders for new due date:', error);
        }
      })();
      return;
    }

    Task.update(task.id, updates).catch(error => {
      console.error("Error updating due date:", error);
    });
    onUpdate({ ...task, ...updates });
  };

  // Start date — only meaningful when there's a future due date. Lets the user
  // say "this is due Friday but I should be working on it all week." Default
  // is no start date; clearing it sets it back to null.
  const handleStartDateChange = async (newDate) => {
    if (!task) return;
    let startDateValue = null;
    if (newDate) {
      const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
      startDateValue = new Date(year, month - 1, day, 9, 0, 0, 0).toISOString();
    }
    Task.update(task.id, { start_date: startDateValue }).catch(error => {
      console.error("Error updating start date:", error);
    });
    onUpdate({ ...task, start_date: startDateValue });
  };

  // Set the actual event date & time for event-classified tasks. Cancels any
  // old lead-time reminders and regenerates a fresh schedule from the new time.
  const handleUpdateEventTime = async (selectedDate, selectedTime) => {
    if (!task || !selectedDate || !selectedTime) return;
    const [year, month, day] = selectedDate.split('-').map(n => parseInt(n, 10));
    const [hours, minutes] = selectedTime.split(':').map(n => parseInt(n, 10));
    const eventTime = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // OPTIMISTIC: show the new event time + confirmation immediately, then
    // cancel/reschedule in the background instead of blocking on the network.
    onUpdate({ ...task, event_time: eventTime.toISOString(), next_reminder: eventTime.toISOString() });
    toast({ title: 'Event time saved ✓' });

    (async () => {
      try {
      const allOldIds = Array.from(new Set([
        ...(task.onesignal_notification_ids || []),
        ...((task.reminder_schedule || []).map(r => r.notification_id).filter(Boolean)),
      ]));
      if (allOldIds.length > 0) {
        try { await cancelScheduledReminder(allOldIds); } catch (e) { console.error('Failed to cancel old reminders:', e); }
      }

      await Task.update(task.id, {
        event_time: eventTime.toISOString(),
        next_reminder: eventTime.toISOString(),
        onesignal_notification_ids: [],
        reminder_schedule: [],
      });

      const currentUser = await base44.auth.me();
      const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
      const multiIds = await scheduleMultiReminders({
        email: currentUser.email,
        title: task.title,
        scheduledDateISO: eventTime.toISOString(),
        taskId: task.id,
        urgency: task.urgency,
        classification: 'event',
      });
      if (multiIds && multiIds.length > 0) {
        await Task.update(task.id, { onesignal_notification_ids: multiIds });
      }

      const refreshed = await Task.filter({ id: task.id });
      if (refreshed[0]) {
        onUpdate(refreshed[0]);
      } else {
        onUpdate({ ...task, event_time: eventTime.toISOString(), next_reminder: eventTime.toISOString() });
      }
      } catch (e) {
        console.error('Error updating event time:', e);
      }
    })();
  };

  const handleComplete = async () => {
    if (!task) return;

    // When the parent page owns completion (Home/Tasks), hand off so its
    // confetti celebration fires and its save/recurrence logic runs once.
    if (onComplete) {
      onClose();
      onComplete(task);
      return;
    }

    // Already finished (the button is on a done task too): nothing to finish
    // again — doing it made a second copy of a repeating task.
    if (task.status === 'completed') {
      onClose();
      return;
    }

    // CRITICAL FIX: Store local date/time, not UTC
    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();

    // Optimistic update — user sees the task complete instantly
    onUpdate({
      ...task,
      status: 'completed',
      completed_at: localISOString,
      onesignal_notification_ids: []
    });
    onClose();

    try {
      console.log('✅ [COMPLETE] Marking task complete with local time:', localISOString);

      // The saved record, not the card: finished elsewhere (its notification,
      // another screen) already means its next copy exists.
      const { isAlreadyCompleted, createNextRecurrence } = await import('../utils/taskRecurrence');
      if (await isAlreadyCompleted(task)) return;

      // Cancel all scheduled reminders when task is completed
      if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
        try {
          await cancelScheduledReminder(task.onesignal_notification_ids);
        } catch (error) {
          console.error("Failed to cancel reminders on completion:", error);
        }
      }

      await Task.update(task.id, { 
        status: 'completed',
        completed_at: localISOString,
        onesignal_notification_ids: [] // Clear notification IDs as reminders are cancelled
      });
      refreshAlarms().catch(() => {});

      // Its steps are done with it, as on Home and the Tasks page.
      const { completeSubtasks } = await import('../utils/subtaskCompletion');
      await completeSubtasks(task.id);

      // The next occurrence of a repeating task: the one shared maker, as
      // everywhere else. This card (used from the Calendar) had its own copy
      // that just added a day to whatever time the reminders had got to — no
      // check for a date already gone by, no reminder booked for a timed
      // task, a birthday's reminders never booked, and a second tap made a
      // second copy.
      if (task.recurrence_pattern && task.recurrence_pattern !== 'none') {
        const result = await createNextRecurrence(task);
        if (result?.task) console.log('✅ [RECURRING] New task created:', result.task.id);
      }
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm(`Delete "${task.title}" and all its sub-tasks?`)) return;

    // Optimistic — close dialog and notify parent immediately
    if (onDelete) {
      onDelete();
    }
    onClose();

    // Five-second Undo; reminders are cancelled and the records removed only
    // once it passes. Undo brings the task back through 'tasks-changed'.
    deleteTaskWithUndo(task, subTasks);
  };

  const completedCount = subTasks.filter(s => s.status === 'completed').length;
  const progress = subTasks.length > 0
    ? (completedCount / subTasks.length) * 100
    : 0;

  if (!task) return null;

  const formatReminderTime = (dateString) => {
    if (!dateString) return null;
    // FIXED: Parse UTC time and display as local
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatReminderDate = (dateString) => {
    if (!dateString) return null;
    // FIXED: Parse UTC time and display as local
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // For multi-day events, show "Aug 1 – Aug 3" instead of just the start.
  // The event's date can live on ANY of these three fields depending on which
  // code path created it — reading only next_reminder produced "Event null".
  const formatEventDateRange = () => {
    const start = task.event_time || task.next_reminder || task.due_date;
    if (!start) return null;
    const startStr = formatReminderDate(start);
    if (!task.end_date) return startStr;
    const startDay = new Date(start).toDateString();
    const endDay = new Date(task.end_date).toDateString();
    if (startDay === endDay) return startStr;
    return `${startStr} – ${formatReminderDate(task.end_date)}`;
  };

  const getCurrentReminderTime = (task) => {
    if (!task.next_reminder) return '';
    // FIXED: Parse UTC and display in local time zone
    const date = new Date(task.next_reminder);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getCurrentReminderDate = (task) => {
    if (!task.next_reminder) return '';
    // FIXED: Parse UTC and display in local time zone
    const date = new Date(task.next_reminder);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatReminderInterval = (interval) => {
    const formats = {
      '10min': 'Every 10 minutes',
      '20min': 'Every 20 minutes',
      '30min': 'Every 30 minutes',
      '1hour': 'Every hour',
      '2hours': 'Every 2 hours',
      '4hours': 'Every 4 hours',
      'daily': 'Daily',
      'every_other_day': 'Every other day',
      'once': 'One time'
    };
    return formats[interval] || interval;
  };

  const handlePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPicture(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const updatedPictures = [...taskPictures, file_url];
      setTaskPictures(updatedPictures);
      
      // Update in background without calling onUpdate to avoid reload
      Task.update(task.id, { pictures: updatedPictures }).catch(error => {
        console.error("Error updating task pictures:", error);
      });
    } catch (error) {
      console.error("Error uploading picture:", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleRemovePicture = async (pictureUrl) => {
    const updatedPictures = taskPictures.filter(p => p !== pictureUrl);
    setTaskPictures(updatedPictures);
    
    // Update in background without calling onUpdate to avoid reload
    Task.update(task.id, { pictures: updatedPictures }).catch(error => {
      console.error("Error updating task pictures:", error);
    });
  };

  const handleNotesUpdate = async () => {
    // Instant confirmation; the write happens in the background.
    toast({ title: 'Notes saved ✓' });
    Task.update(task.id, { notes: taskNotes }).catch(error => {
      console.error("Error updating task notes:", error);
    });
  };

  // Calendar classification (Event / Task / Birthday). A user-set value on the
  // task overrides the auto-detected kind passed in from the calendar view.
  const currentClassification = task.classification || itemClassification || (task.birthday_person ? 'birthday' : 'task');
  const isEvent = currentClassification === 'event';
  const currentType = getCurrentReminderType(task);
  // Birthdays and events aren't things to start or put off: no timer, no Back
  // Burner, no Parking Lot on them. Tasks keep all three.
  const isEventOrBirthday = isEvent || currentClassification === 'birthday' || currentType === 'birthday';
  const dueLabel = isEvent ? 'Event Date' : 'Due Date';

  // Birthdays: which reminders go out (a week before, the day before, on the
  // day — whichever are on; just the day for your own) and at what time. The
  // time is the birthday's own time of day, next_reminder, which every
  // birthday reminder is booked from and the yearly rollover keeps.
  const toTimeValue = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const birthdayTimeSaved = currentType === 'birthday' && task.next_reminder ? toTimeValue(task.next_reminder) : '';
  const birthdayReminderDays = (() => {
    if (currentType !== 'birthday' || !task.next_reminder) return [];
    const at = new Date(task.next_reminder);
    const own = task.is_own_birthday || !task.birthday_person;
    const list = own
      ? [{ label: 'On the day', offset: 0, on: true }]
      : [
          { label: '1 week before', offset: -7, on: task.birthday_remind_week_before !== false },
          { label: 'The day before', offset: -1, on: task.birthday_remind_day_before !== false },
          { label: 'On the day', offset: 0, on: task.birthday_remind_day_of !== false },
        ];
    return list.filter((r) => r.on).map((r) => {
      const d = new Date(at);
      d.setDate(d.getDate() + r.offset);
      return {
        label: r.label,
        day: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        past: d.getTime() <= Date.now(),
      };
    });
  })();

  // Changing the time moves all of them: the booked ones are cancelled and the
  // set is booked again at the new time (the ones already past are skipped).
  const handleBirthdayTimeSave = async () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(birthdayTime || '');
    if (!m || !task.next_reminder) return;
    const at = new Date(task.next_reminder);
    at.setHours(Number(m[1]), Number(m[2]), 0, 0);
    const updates = {
      next_reminder: at.toISOString(),
      onesignal_notification_ids: [],
      reminder_schedule: [],
    };
    const oldIds = Array.from(new Set([
      ...(task.onesignal_notification_ids || []),
      ...(task.reminder_schedule || []).map((r) => r.notification_id),
    ])).filter((id) => id && !String(id).startsWith('planned_'));
    setIsSavingBirthdayTime(true);
    try {
      if (oldIds.length > 0) await cancelScheduledReminder(oldIds).catch(() => {});
      await Task.update(task.id, updates);
      const { scheduleBirthdayReminders } = await import('../utils/birthdayScheduler');
      await scheduleBirthdayReminders({ ...task, ...updates });
      // The full-screen alarm lives on the phone — hand it the new time now.
      refreshAlarms().catch(() => {});
      const fresh = await base44.entities.Task.get(task.id).catch(() => null);
      onUpdate(fresh || { ...task, ...updates });
      toast({ title: 'Saved ✓', description: `Birthday reminders now go out at ${formatReminderTime(at.toISOString())}.` });
    } catch (e) {
      console.error('Could not change the birthday reminder time:', e);
      toast({ title: "Couldn't save that", description: 'Please try again.' });
    } finally {
      setIsSavingBirthdayTime(false);
    }
  };
  // The task's date is stored in TWO places (due_date and next_reminder)
  // depending on which code path created it — the parser sets due_date only,
  // while editing here sets both. Read either one so a task created with a date
  // never shows an empty "Add due date".
  const dueSource = shownDueISO(task);

  const handleClassificationChange = async (newClass) => {
    if (!task || newClass === currentClassification) return;
    const updates = { classification: newClass };
    if (newClass === 'birthday') {
      if (!task.birthday_person) updates.birthday_person = task.title;
    } else if (task.birthday_person) {
      updates.birthday_person = null;
    }
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, ...updates });
    toast({ title: "Saved ✓", description: newClass === 'event' ? 'Marked as event' : newClass === 'birthday' ? 'Marked as birthday' : 'Marked as task' });
    // Save in the background
    Task.update(task.id, updates).catch(error => {
      console.error("Error updating classification:", error);
    });
  };

  // Switch a task to "Smart Reminders" — the LLM smart-nudge system takes over.
  // Cancels every scheduled notification (recurring + one-time/event schedule)
  // and clears all reminder fields so the task flows to the LLM.
  const handleSetSmartReminders = async () => {
    if (!task) return;
    const updates = {
      reminder_interval: null,
      recurrence_pattern: 'none',
      next_reminder: null,
      event_time: null,
      day_only_task: false,
      onesignal_notification_ids: [],
      reminder_schedule: [],
      classification: 'task',
      birthday_person: null,
    };
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, ...updates });
    toast({ title: "Smart Reminders on ✓", description: "AI will decide when to nudge you about this task." });
    // Cancel old reminders + save in the background
    (async () => {
      try {
        const allOldIds = Array.from(new Set([
          ...(task.onesignal_notification_ids || []),
          ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
        ]));
        if (allOldIds.length > 0) {
          await cancelScheduledReminder(allOldIds).catch(e => console.error("Failed to cancel reminders:", e));
        }
        await Task.update(task.id, updates);
      } catch (e) {
        console.error("Error switching to smart reminders:", e);
      }
    })();
  };

  // Choosing "Event" cancels any old notifications, marks the task as an event,
  // and — if a date/time is already set — regenerates the LLM lead-time reminder
  // schedule so the future-notifications list appears immediately.
  const handleSelectEvent = async () => {
    if (!task) return;
    const updates = {
      classification: 'event',
      onesignal_notification_ids: [],
      reminder_schedule: [],
    };
    if (task.birthday_person) updates.birthday_person = null;
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, ...updates });
    const eventDate = task.event_time || task.next_reminder;
    if (!eventDate) {
      toast({ title: 'Event saved', description: 'Set the event date & time to generate reminders.' });
    }
    // Cancel old reminders + save + schedule in the background
    (async () => {
      try {
        const currentUser = await base44.auth.me();
        const allOldIds = Array.from(new Set([
          ...(task.onesignal_notification_ids || []),
          ...((task.reminder_schedule || []).map((r) => r.notification_id).filter(Boolean)),
        ]));
        if (allOldIds.length > 0) {
          await cancelScheduledReminder(allOldIds).catch(e => console.error(e));
        }
        await Task.update(task.id, updates);

        if (eventDate) {
          try {
            const { scheduleMultiReminders } = await import('../utils/multiReminderScheduler');
            const multiIds = await scheduleMultiReminders({
              email: currentUser.email,
              title: task.title,
              scheduledDateISO: eventDate,
              taskId: task.id,
              urgency: task.urgency,
              classification: 'event',
            });
            if (multiIds && multiIds.length > 0) {
              await Task.update(task.id, { onesignal_notification_ids: multiIds });
            }
          } catch (e) {
            console.error('Failed to generate event reminders:', e);
          }
          const refreshed = await Task.filter({ id: task.id });
          if (refreshed[0]) onUpdate(refreshed[0]);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  };

  // Back Burner — silence all notifications for this task (or reactivate them).
  // The onTaskUpdate automation cancels/reschedules the actual OneSignal
  // notifications, so the frontend only flips the flag.
  // Alarm vs regular notification for THIS task. Same reminder times either
  // way; this only changes how they arrive. A task with no choice of its own
  // follows the user's default, and the first tap here makes it explicit.
  const handleSetAlertStyle = async (next) => {
    if (!task || alertStyleFor(task) === next) return;
    onUpdate({ ...task, alert_style: next });
    toast({
      title: next === 'alarm' ? 'Full-screen alarm ⏰' : 'Regular notifications',
      description: next === 'alarm'
        ? 'Reminders for this task ring full-screen, impossible to ignore.'
        : 'Reminders for this task arrive as normal notifications.',
    });
    try {
      await Task.update(task.id, { alert_style: next });
      await refreshAlarms();
      // First time an alarm is switched on, Android's own switches come up.
      if (next === 'alarm') await requestAlarmPermissions({ setup: true });
    } catch (e) {
      console.error('Error changing alert style:', e);
    }
  };

  const handleToggleSilenced = async () => {
    if (!task) return;
    const newSilenced = !task.silenced;
    // Optimistic update — user sees the change instantly
    onUpdate({ ...task, silenced: newSilenced });
    toast({
      title: newSilenced ? 'On the back burner 🔇' : 'Reminders back on 🔔',
      description: newSilenced
        ? 'No more notifications for this task until you reactivate it.'
        : 'Notifications resumed for this task.',
    });
    // Save in the background. Parking it leaves a permanent mark, so finishing
    // it later still counts as a rescue on the Progress page.
    const patch = newSilenced ? { silenced: true, was_back_burnered: true } : { silenced: false };
    Task.update(task.id, patch)
      // The phone's full-screen alarms are its own copy: parking the task
      // takes them off, bringing it back puts them back — now, not whenever
      // Home is next opened.
      .then(() => refreshAlarms())
      .catch(e => {
        console.error('Error toggling silenced:', e);
      });
  };

  // Switching to a repeating cadence throws away any lead-time / smart reminder
  // plan the task picked up earlier — a repeat just fires on its schedule:
  // ONE reminder each time, at the task's own time (the same one every next
  // copy gets — bookAtTimeReminder). This used to cancel every reminder and
  // book none, while saying "one reminder each time".
  //  - A rhythm the user asked for ("keep reminding me every hour") keeps its
  //    pings; only a lead-time plan is dropped.
  //  - An all-day task, a "by 5 PM" deadline or one with no time has no
  //    at-the-time reminder: smart nudges carry it, as before.
  //  - Turning the repeat off changes nothing else: it's the same task.
  const handleSetRepeat = async (pattern) => {
    if (!task) return;
    if (!pattern || pattern === 'none') {
      onUpdate({ ...task, recurrence_pattern: 'none' });
      toast({ title: 'Repeat turned off ✓', description: 'This task won\'t come back after you finish it.' });
      Task.update(task.id, { recurrence_pattern: 'none' }).catch(e => console.error('Error setting repeat:', e));
      return;
    }
    const planIds = (task.reminder_schedule || []).map((r) => r?.notification_id)
      .filter((id) => id && !String(id).startsWith('planned_'));
    const isRhythm = !!task.reminder_interval && task.reminder_interval !== 'once';
    const oldIds = Array.from(new Set(isRhythm
      ? planIds
      : [...(task.onesignal_notification_ids || []), ...planIds]
    )).filter((id) => id && !String(id).startsWith('planned_'));
    const updates = {
      recurrence_pattern: pattern,
      reminder_schedule: [],
      onesignal_notification_ids: isRhythm
        ? (task.onesignal_notification_ids || []).filter((id) => !oldIds.includes(id))
        : [],
    };
    onUpdate({ ...task, ...updates });
    toast({ title: 'Repeat saved ✓', description: `Repeats ${pattern} — one reminder each time, nothing extra.` });
    (async () => {
      try {
        if (oldIds.length > 0) {
          await cancelScheduledReminder(oldIds).catch(e => console.error('Failed to cancel reminders:', e));
        }
        await Task.update(task.id, updates);
        const { atTimeReminderFor, bookAtTimeReminder } = await import('../utils/taskRecurrence');
        const repeating = { ...task, ...updates };
        if (atTimeReminderFor(repeating)) {
          const currentUser = await base44.auth.me();
          const { ids, schedule } = await bookAtTimeReminder(repeating, currentUser.email);
          onUpdate({ ...repeating, onesignal_notification_ids: ids, reminder_schedule: schedule });
        }
        refreshAlarms().catch(() => {});
      } catch (e) {
        console.error('Error setting repeat:', e);
      }
    })();
  };

  // One entry point for the ReminderTypeSelector — routes each type to the
  // right existing handler so all the cancel/reschedule logic stays in one place.
  const handleChangeReminderType = (type, sub) => {
    if (type === 'smart') return handleSetSmartReminders();
    if (type === 'interval') return handleUpdateField('reminder_interval', sub);
    if (type === 'repeat') return handleSetRepeat(sub);
    if (type === 'once') return handleUpdateField('reminder_interval', 'once');
    if (type === 'event') return handleSelectEvent();
    if (type === 'birthday') return handleClassificationChange('birthday');
  };


  // ---- Regrouped card layout ("v2"), now for everyone. ----
  // Same controls, same handlers; only where they sit changed. The flag stays
  // so the previous arrangement (the `!v2` branches) can be brought back in
  // one line if it's ever wanted.
  const v2 = true;
  const v2Group = `rounded-2xl border p-3 space-y-3 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`;
  const v2Label = `text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`;
  const v2Link = `text-xs font-semibold ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`;
  const hasPictures = taskPictures.length > 0;
  const hasNotes = (taskNotes || '').trim().length > 0;
  // ---- Pieces of the card that the regrouped (v2) layout moves around. ----
  // Each is rendered exactly once, in whichever spot the layout puts it.
  const backBurnerControl = (
    <>
      {!isEventOrBirthday && (
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggleSilenced}
        className={`gap-1.5 h-8 transition-all active:scale-95 ${
          task.silenced
            ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-sm'
            : theme === 'dark'
              ? 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        {task.silenced ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
        {task.silenced ? 'Back Burner 🔇' : 'Back Burner'}
      </Button>
      )}
    </>
  );
  const alertStyleControl = (
    <>
      {supportsAlarms() && !task.silenced && (
      <div className="flex items-center gap-1">
        <div className={`inline-flex h-8 rounded-full border overflow-hidden text-xs font-medium ${
          theme === 'dark' ? 'border-gray-600' : 'border-gray-300'
        }`}>
          <button
            type="button"
            onClick={() => handleSetAlertStyle('notification')}
            className={`flex items-center gap-1 px-3 transition-colors ${
              alertStyleFor(task) !== 'alarm'
                ? 'bg-gray-800 text-white'
                : theme === 'dark' ? 'bg-gray-800 text-gray-400 hover:text-gray-200' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Notification
          </button>
          <button
            type="button"
            onClick={() => handleSetAlertStyle('alarm')}
            className={`flex items-center gap-1 px-3 transition-colors ${
              alertStyleFor(task) === 'alarm'
                ? 'bg-red-500 text-white'
                : theme === 'dark' ? 'bg-gray-800 text-gray-400 hover:text-gray-200' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <AlarmClock className="w-3.5 h-3.5" />
            Full-screen
          </button>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="What's the difference?" className={`p-1 rounded-full ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}>
              <Info className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className={`w-72 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : ''}`}>
            <AlertStyleInfo dark={theme === 'dark'} />
          </PopoverContent>
        </Popover>
      </div>
      )}
    </>
  );
  const energyControl = (
    <>
      {!isEvent && (
      <Popover>
        <PopoverTrigger asChild>
          <button className={`cursor-pointer hover:opacity-80 transition-opacity ${
            theme === 'minimalist'
              ? 'bg-blue-100 text-blue-700'
              : theme === 'dark'
                ? 'bg-blue-900 text-blue-300'
                : 'bg-purple-200 text-purple-800'
          } px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1`}>
            <Zap className="w-3 h-3" />
            {task.energy_required} energy
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <div className="space-y-1">
            <button onClick={() => handleUpdateField('energy_required', 'low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low Energy</button>
            <button onClick={() => handleUpdateField('energy_required', 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium Energy</button>
            <button onClick={() => handleUpdateField('energy_required', 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High Energy</button>
          </div>
        </PopoverContent>
      </Popover>
      )}
    </>
  );
  const priorityControl = (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium ${
            task.urgency === 'urgent' ? 'bg-red-100 text-red-700' :
            task.urgency === 'high' ? 'bg-amber-100 text-amber-700' :
            task.urgency === 'medium' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {task.urgency} priority
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <div className="space-y-1">
            <button onClick={() => handleUpdateField('urgency', 'low')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Low Priority</button>
            <button onClick={() => handleUpdateField('urgency', 'medium')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Medium Priority</button>
            <button onClick={() => handleUpdateField('urgency', 'high')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">High Priority</button>
            <button onClick={() => handleUpdateField('urgency', 'urgent')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded">Urgent</button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
  const picturesSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className={`text-sm font-medium flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          <ImageIcon className="w-4 h-4" />
          Pictures
        </label>
        <label>
          <input
            type="file"
            accept="image/*"
            onChange={handlePictureUpload}
            className="hidden"
            disabled={isUploadingPicture}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploadingPicture}
            className="cursor-pointer"
            onClick={(e) => e.currentTarget.previousElementSibling?.click()}
          >
            {isUploadingPicture ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload Image
              </>
            )}
          </Button>
        </label>
      </div>
      {taskPictures.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {taskPictures.map((pic, idx) => (
            <div key={idx} className="relative group">
              <img
                src={pic}
                alt="Task attachment"
                className="w-full h-32 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setViewingImage(pic)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemovePicture(pic);
                }}
                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600 transition-colors"
                title="Delete photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const notesSection = (
    <div className="space-y-2">
      <label className={`text-sm font-medium flex items-center gap-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
        <FileText className="w-4 h-4" />
        Notes
      </label>
      <div className="relative">
        <Textarea
          value={taskNotes}
          onChange={(e) => setTaskNotes(e.target.value)}
          placeholder="Add any additional notes..."
          className="min-h-[80px] pr-10"
        />
        <button
          onClick={handleNotesUpdate}
          title="Save notes"
          className="absolute bottom-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors"
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
  const handleToParkingLot = async () => {
    if (!confirm(`Convert "${task.title}" to a parking lot idea?`)) return;

    // Optimistic — close dialog and notify parent immediately
    if (onDelete) {
      onDelete();
    }
    onClose();

    // Cancel reminders + create idea + delete task in the background
    (async () => {
      try {
        if (task.onesignal_notification_ids && task.onesignal_notification_ids.length > 0) {
          await cancelScheduledReminder(task.onesignal_notification_ids);
        }
        await base44.entities.ParkingLotIdea.create({
          idea: task.title + (task.description ? `\n\n${task.description}` : ''),
          converted_to_task: false
        });
        await base44.entities.Task.delete(task.id);
        refreshAlarms().catch(() => {});
      } catch (error) {
        console.error("Error converting to parking lot:", error);
      }
    })();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        {/* [&>*]:min-w-0 — the dialog is a grid, so one wide child (a long
            location pill, a reminder row) used to stretch the whole column
            past the screen and clip everything on the right. */}
        <DialogContent className={`max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white'}`}>
          
          <DialogHeader>
            <DialogTitle className={`text-2xl font-bold pt-6 pb-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="flex-1 text-2xl font-bold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') {
                        setEditedTitle(task.title);
                        setIsEditingTitle(false);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveTitle}
                    className="h-8 w-8"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditedTitle(task.title);
                      setIsEditingTitle(false);
                    }}
                    className="h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1">{task.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditingTitle(true)}
                    className="h-8 w-8"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className={v2 ? 'space-y-3 py-3' : 'space-y-6 py-4'}>
            {task.description && (
              <div>
                <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Description</h4>
                <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>{task.description}</p>
              </div>
            )}

            {/* v2: a paused task says so up top, where it can't be missed, and
                offers the one thing you'd want to do about it. */}
            {v2 && task.silenced && !isEvent && (
              <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${theme === 'dark' ? 'bg-amber-900/30 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BellOff className="w-4 h-4" /> On the Back Burner — reminders paused
                </div>
                <Button size="sm" variant="outline" onClick={handleToggleSilenced} className={theme === 'dark' ? 'border-amber-700 text-amber-200' : 'border-amber-300 text-amber-800 hover:bg-amber-100'}>
                  Turn back on
                </Button>
              </div>
            )}

            {/* Reminders group. For everyone but v2 this wrapper is invisible
                (plain space-y-6), so the layout is unchanged. */}
            <div className={v2 ? v2Group : 'space-y-6'}>
              {v2 && <div className={v2Label}>Reminders</div>}
            {/* Task Type — the primary control that determines notification behavior.
                Pulled into its own row above the other pills so it stands out. */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wide ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Type</span>
              <ReminderTypeSelector task={task} theme={theme} onChangeType={handleChangeReminderType} />
            </div>

            {/* Birthdays: when the reminders go out, and a time that can be changed. */}
            {currentType === 'birthday' && task.next_reminder && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>Reminders at</span>
                  <input
                    type="time"
                    value={birthdayTime}
                    onChange={(e) => setBirthdayTime(e.target.value)}
                    className={`border rounded-lg px-2 py-1 text-sm ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                  {birthdayTime && birthdayTime !== birthdayTimeSaved && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleBirthdayTimeSave}
                      disabled={isSavingBirthdayTime}
                      className="h-8 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isSavingBirthdayTime ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save</>}
                    </Button>
                  )}
                </div>
                <ul className="space-y-1">
                  {birthdayReminderDays.map((r) => (
                    <li
                      key={r.label}
                      className={`text-sm flex items-center gap-2 ${
                        r.past
                          ? theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                          : theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                      }`}
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {r.label} · {r.day}{r.past ? ' (passed)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!v2 && backBurnerControl}
              {!v2 && alertStyleControl}
              {!v2 && energyControl}
              {!v2 && priorityControl}
              {/* Intelligent notification schedule — visible directly, not buried in a popover.
                  Always shown for events so the future-reminder list is visible. */}
              {/* A repeating task is black and white: it fires on its cadence.
                   No smart/lead-time reminder plan. */}
              {currentType !== 'repeat' && currentType !== 'birthday' && ((task.reminder_schedule && task.reminder_schedule.length > 0) || task.classification === 'event') && (
                <div className="w-full mt-2">
                  <SmartReminderEditor task={task} theme={theme} onUpdate={onUpdate} isEvent={isEvent} />
                </div>
              )}

              {/* Smart Reminders task — no fixed reminder time, but it can
                   still be due by a day, and that day must be pushable. */}
              {currentType === 'smart' && (
                <SmartDueDatePill
                  task={task}
                  theme={theme}
                  onSave={(iso) => handleUpdateField('due_date', iso)}
                />
              )}

              {/* First-reminder date & time — only for tasks whose reminders
                   are NOT run by the smart schedule. When a Smart Reminder
                   Schedule exists it already shows (and owns) the times, so a
                   separate date/time pill just duplicates it. */}
              {/* A repeating task's one at-the-time reminder is saved as a
                   one-entry schedule, but it has no plan to show — its time
                   stays editable here. */}
              {(currentType === 'once' || currentType === 'interval' || currentType === 'repeat') &&
                (currentType === 'repeat' || !(task.reminder_schedule && task.reminder_schedule.length > 0)) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                      dueSource && new Date(dueSource).getTime() < Date.now() && task.status !== 'completed'
                        ? theme === 'dark' ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700'
                        : 'bg-purple-500 text-white'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {dueSource ? (
                        new Date(dueSource).getTime() < Date.now() && task.status !== 'completed'
                          ? `Overdue • ${formatReminderDate(dueSource)}${task.day_only_task ? '' : ` • ${formatReminderTime(dueSource)}`}`
                          : task.day_only_task
                            ? `Due ${formatReminderDate(dueSource)}`
                            : `Due ${isEvent ? formatEventDateRange() : formatReminderDate(dueSource)} • ${formatReminderTime(dueSource)}`
                      ) : (
                        'Add due date'
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto p-4 ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'
                  }`}>
                    <div className="space-y-3">
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Due Date:</label>
                        <input
                          type="date"
                          value={reminderDate}
                          onChange={(e) => { setReminderDate(e.target.value); reminderDateRef.current = e.target.value; }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Time (optional):</label>
                        <input
                          type="time"
                          value={reminderTime}
                          onChange={(e) => { setReminderTime(e.target.value); reminderTimeRef.current = e.target.value; }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {reminderTime
                            ? 'Set a time: you get a heads-up an hour before, then a reminder at that exact time.'
                            : 'No time? Then it just needs to be done that day — smart reminders nudge you the night before and that day.'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleUpdateReminderTime(reminderTime, reminderDate)}
                        disabled={!reminderDate || isSavingReminder}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isSavingReminder ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save Due Date</>}
                      </Button>
                      {reminderTime && (
                        <button
                          onClick={() => { setReminderTime(''); reminderTimeRef.current = ''; handleUpdateReminderTime('', reminderDate); }}
                          className="w-full text-center px-3 py-2 text-sm hover:bg-gray-50 rounded text-gray-600 font-medium"
                        >
                          Clear time — just due that day
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Due date — only shown when the combined "Due <date> • <time>"
                   pill above ISN'T rendered (i.e. the task's times are owned by
                   a Smart Reminder Schedule). Otherwise the reminder pill IS
                   the due date, so a second date pill just confuses things. */}
              {(currentType === 'once' || currentType === 'interval') &&
                (task.reminder_schedule && task.reminder_schedule.length > 0) && (
                task.due_date ? (
                  <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                        new Date(task.due_date).getTime() < Date.now() && task.status !== 'completed'
                          ? theme === 'dark' ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700'
                          : theme === 'dark' ? 'bg-amber-900 text-amber-300' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <CalendarClock className="w-3 h-3" />
                        {new Date(task.due_date).getTime() < Date.now() && task.status !== 'completed'
                          ? (isEvent ? 'Past event' : 'Overdue')
                          : `${isEvent ? 'Event' : 'Due'} ${formatReminderDate(task.due_date)}`}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{dueLabel}:</label>
                        <input
                          type="date"
                          defaultValue={task.due_date ? task.due_date.split('T')[0] : ''}
                          onChange={(e) => { handleDueDateChange(e.target.value); setDueDatePopoverOpen(false); }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <button
                          onClick={() => { handleDueDateChange(null); setDueDatePopoverOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
                        >
                          {isEvent ? 'Remove event date' : 'Remove due date'}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="cursor-pointer hover:opacity-80 transition-opacity border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-white flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {isEvent ? 'Add Event Date' : 'Add Due Date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>{dueLabel}:</label>
                        <input
                          type="date"
                          onChange={(e) => { if (e.target.value) { handleDueDateChange(e.target.value); setDueDatePopoverOpen(false); } }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <p className="text-xs text-gray-500">
                          {isEvent ? 'The date this event takes place.' : 'Reminders continue until this date, then switch to overdue reminders.'}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )
              )}

              {/* Start date — a multi-day span only makes sense for an event
                   (a trip, a conference). A one-time task just has a due date,
                   so showing "Add Start Date" there is noise. */}
              {isEvent && dueSource && new Date(dueSource).getTime() > Date.now() && (
                task.start_date ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                        theme === 'dark' ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <CalendarClock className="w-3 h-3" />
                        Start {formatReminderDate(task.start_date)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Start Date:</label>
                        <input
                          type="date"
                          defaultValue={task.start_date ? task.start_date.split('T')[0] : ''}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <button
                          onClick={() => handleStartDateChange(null)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
                        >
                          Remove start date
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="cursor-pointer hover:opacity-80 transition-opacity border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-white flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        Add Start Date
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className={`w-56 p-3 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
                      <div className="space-y-2">
                        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Start Date:</label>
                        <input
                          type="date"
                          onChange={(e) => { if (e.target.value) handleStartDateChange(e.target.value); }}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                        <p className="text-xs text-gray-500">When you'll start working on this before it's due.</p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )
              )}

              {/* Location — only events happen at a place. Regular tasks and
                   chores don't need one, so it stays off their card. */}
              {isEvent && (
                <LocationField
                  task={task}
                  theme={theme}
                  onSave={(loc) => handleUpdateField('location', loc)}
                />
              )}

              {/* Event date & time — editable for event tasks. Setting it
                   regenerates the lead-time reminder schedule automatically. */}
              {currentType === 'event' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="cursor-pointer hover:opacity-80 transition-opacity bg-indigo-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      {(() => {
                        // The event's date may live on next_reminder (that's
                        // what the parser sets) — showing "Set Event Date &
                        // Time" when a date is already known was just wrong.
                        const when = task.event_time || task.next_reminder;
                        if (!when) return 'Set Event Date & Time';
                        const dateStr = isEvent ? formatEventDateRange() : formatReminderDate(when);
                        return task.day_only_task && !task.event_time
                          ? `Event ${dateStr} • Add time`
                          : `Event ${dateStr} • ${formatReminderTime(when)}`;
                      })()}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className={`w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto p-4 ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'
                  }`}>
                    <div className="space-y-3">
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Event Date:</label>
                        <input
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <div>
                        <label className={`text-sm font-medium block mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Event Time:</label>
                        <input
                          type="time"
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                          className={`w-full border rounded px-3 py-2 ${theme === 'dark' ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleUpdateEventTime(eventDate, eventTime)}
                        disabled={!eventDate || !eventTime || isSavingEvent}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isSavingEvent ? <span>Saving...</span> : <><Check className="w-4 h-4 mr-1" /> Save Event Time</>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
              {v2 && (
                <div className="flex flex-wrap items-center gap-2">
                  {alertStyleControl}
                </div>
              )}
            </div>

            {v2 && (
              <div className={v2Group}>
                <div className={v2Label}>About this task</div>
                <div className="flex flex-wrap gap-2">
                  {energyControl}
                  {priorityControl}
                </div>
                <div className="flex flex-wrap gap-4">
                  {!(v2NotesOpen || hasNotes) && (
                    <button type="button" className={v2Link} onClick={() => setV2NotesOpen(true)}>＋ Add a note</button>
                  )}
                  {!(v2PicsOpen || hasPictures) && (
                    <button type="button" className={v2Link} onClick={() => setV2PicsOpen(true)}>＋ Add a picture</button>
                  )}
                </div>
                {(v2NotesOpen || hasNotes) && notesSection}
                {(v2PicsOpen || hasPictures) && picturesSection}
              </div>
            )}

            {!v2 && picturesSection}
            {!v2 && notesSection}

            {!isEvent && (
            <div className={v2 ? v2Group : 'space-y-4'}>
              {subTasks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ListChecks className="w-4 h-4" />
                      Progress: {completedCount} of {subTasks.length}
                    </h4>
                    <span className="text-sm font-bold">{Math.round(progress)}%</span>
                  </div>
                  <Progress
                    value={progress}
                    className={`h-3 ${
                      theme === 'minimalist'
                        ? '[&>div]:bg-green-500'
                        : theme === 'dark'
                          ? '[&>div]:bg-green-600'
                          : '[&>div]:bg-gradient-to-r [&>div]:from-purple-500 [&>div]:to-orange-500'
                    }`}
                  />
                </div>
              )}

              {/* UPDATED: Better visual separation for manual input when no subtasks */}
              {subTasks.length === 0 && (
                <AddSubTaskCard
                  compact={v2}
                  theme={theme}
                  mode={subtaskInputMode}
                  setMode={setSubtaskInputMode}
                  newSubTask={newSubTask}
                  setNewSubTask={setNewSubTask}
                  onSubmit={handleAddSubTask}
                  onVoice={handleVoiceSubtask}
                  isProcessingVoice={isProcessingVoice}
                  onAIBreakdown={() => {
                    setPreviousSubTasks(subTasks);
                    setHasDecomposedSuccessfully(false);
                    setShowDecomposition(true);
                  }}
                />
              )}

              {subTasks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Sub-tasks</h4>
                    <div className="flex items-center gap-2">
                      {subTasks.length < 3 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPreviousSubTasks(subTasks);
                            setHasDecomposedSuccessfully(false);
                            setShowDecomposition(true);
                          }}
                          className="text-xs"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Suggest More
                        </Button>
                      )}
                      {previousSubTasks !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleUndoDecomposition}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          <Undo className="w-3 h-3 mr-1" />
                          Undo AI Breakdown
                        </Button>
                      )}
                    </div>
                  </div>
                  {subTasks.map((subTask) => (
                    <div
                      key={subTask.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        subTask.status === 'completed'
                          ? theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                          : theme === 'minimalist'
                            ? 'bg-white border-gray-200'
                            : theme === 'dark'
                              ? 'bg-gray-800/50 border-gray-700'
                              : 'bg-gradient-to-r from-purple-50/30 to-orange-50/30 border-purple-100'
                      }`}
                    >
                      <Checkbox
                        checked={subTask.status === 'completed'}
                        onCheckedChange={() => handleSubTaskToggle(subTask)}
                        className={theme === 'colorful' ? 'data-[state=checked]:bg-purple-600' : ''}
                      />
                      <span className={`flex-1 ${
                        subTask.status === 'completed' ? 'line-through text-gray-500' : theme === 'dark' ? 'text-gray-200' : 'text-gray-900'
                      }`}>
                        {subTask.title}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleDeleteSubTask(subTask.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  <AddSubTaskCard
                  compact={v2}
                    theme={theme}
                    boxed={false}
                    mode={subtaskInputMode}
                    setMode={setSubtaskInputMode}
                    newSubTask={newSubTask}
                    setNewSubTask={setNewSubTask}
                    onSubmit={handleAddSubTask}
                    onVoice={handleVoiceSubtask}
                    isProcessingVoice={isProcessingVoice}
                  />
                </div>
              )}
            </div>)}

            {progress === 100 && subTasks.length > 0 && !isEvent && (
              <div className={`p-6 rounded-xl text-center ${
                theme === 'minimalist'
                  ? 'bg-green-50 border-2 border-green-200'
                  : theme === 'dark'
                    ? 'bg-green-900/20 border-2 border-green-800'
                    : 'bg-gradient-to-r from-purple-100 to-orange-100 border-2 border-purple-300'
              }`}>
                <Sparkles className={`w-12 h-12 mx-auto mb-3 ${
                  theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
                }`} />
                <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                  All sub-tasks complete! 🎉
                </h3>
                <p className={theme === 'dark' ? 'text-gray-400 mb-4' : 'text-gray-600 mb-4'}>
                  You're ready to mark this main task as done.
                </p>
              </div>
            )}

            {/* v2: the timer sits with the task, not in the footer. */}
            {v2 && task.status !== 'completed' && !isEventOrBirthday && (
              <div className={v2Group}>
                <div className={v2Label}>Timer</div>
                <LaunchButtons task={task} theme={theme} />
              </div>
            )}
          </div>

          <DialogFooter className={v2 ? 'flex-col gap-2 sm:flex-col sm:space-x-0' : 'gap-2 flex-wrap'}>
            {/* Birthdays aren't in the menu any more — this is the way to the full list */}
            {currentClassification === 'birthday' && (
              <Button
                variant="outline"
                onClick={() => { onClose(); navigate('/Birthdays'); }}
                className="w-full border-pink-300 text-pink-700 hover:bg-pink-50"
              >
                <Cake className="w-4 h-4 mr-2" />
                See all birthdays
              </Button>
            )}
            {!v2 && task.status !== 'completed' && !isEventOrBirthday && (
              <div className="w-full mb-1">
                <LaunchButtons task={task} theme={theme} />
              </div>
            )}
            {v2 ? (
              <>
                <Button
                  onClick={handleComplete}
                  className={`w-full h-11 text-base ${theme === 'minimalist'
                    ? 'bg-green-600 hover:bg-green-700'
                    : theme === 'dark'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {isEvent ? 'Went' : 'Mark as Complete'}
                </Button>
                <div className="w-full flex flex-wrap justify-center gap-6 text-sm pt-1">
                  {!isEventOrBirthday && !task.silenced && (
                    <button type="button" onClick={handleToggleSilenced} className={`flex items-center gap-1 ${theme === 'dark' ? 'text-amber-300' : 'text-amber-700'}`}>
                      <BellOff className="w-4 h-4" /> Back Burner
                    </button>
                  )}
                  {!isEventOrBirthday && (
                  <button type="button" onClick={handleToParkingLot} className={`flex items-center gap-1 ${theme === 'dark' ? 'text-purple-300' : 'text-purple-600'}`}>
                    <Lightbulb className="w-4 h-4" /> To Parking Lot
                  </button>
                  )}
                  <button type="button" onClick={handleDelete} className="flex items-center gap-1 text-red-600">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </>
            ) : (
              <>
            {!isEventOrBirthday && (
            <Button
              variant="outline"
              onClick={handleToParkingLot}
              className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
            >
              <Lightbulb className="w-4 h-4 mr-2" />
              To Parking Lot
            </Button>
            )}
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={handleComplete}
              className={theme === 'minimalist'
                ? 'bg-green-600 hover:bg-green-700'
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {isEvent ? 'Went' : 'Mark as Complete'}
            </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDecompositionModal
        task={task}
        isOpen={showDecomposition}
        onClose={() => {
          setShowDecomposition(false);
          if (!hasDecomposedSuccessfully) {
            setPreviousSubTasks(null);
          }
          setHasDecomposedSuccessfully(false);
        }}
        onUpdate={() => {
          setHasDecomposedSuccessfully(true);
          fetchSubTasks(task.id);
          onUpdate();
        }}
        theme={theme}
      />

      <ImageViewer
        imageUrl={viewingImage}
        isOpen={!!viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </>
  );
}