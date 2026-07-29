import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Bell, Clock, Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { scheduleReminder, cancelScheduledReminder } from '../utils/reminderScheduler';

/**
 * Interactive editor for LLM-decided reminder schedules on one-time/event tasks.
 * Lets the user turn off individual reminders or add custom ones.
 * Each reminder maps to a single OneSignal scheduled notification.
 */
export default function SmartReminderEditor({ task, theme, onUpdate }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const schedule = task.reminder_schedule || [];

  const formatDateTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHrs = Math.round(diffMs / (1000 * 60 * 60));
    const relative = diffHrs > 0
      ? diffHrs < 24 ? `in ${diffHrs}h` : `in ${Math.round(diffHrs / 24)}d`
      : 'past';
    const formatted = d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return `${formatted} (${relative})`;
  };

  const handleDelete = async (reminder) => {
    setDeletingId(reminder.notification_id);
    try {
      if (reminder.notification_id) {
        await cancelScheduledReminder([reminder.notification_id]);
      }
      const newSchedule = schedule.filter(r => r.notification_id !== reminder.notification_id);
      const newIds = (task.onesignal_notification_ids || []).filter(id => id !== reminder.notification_id);
      await base44.entities.Task.update(task.id, {
        reminder_schedule: newSchedule,
        onesignal_notification_ids: newIds,
      });
      onUpdate({ ...task, reminder_schedule: newSchedule, onesignal_notification_ids: newIds });
    } catch (e) {
      console.error('Failed to delete reminder:', e);
      alert('Failed to cancel that reminder. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newDate || !newTime) return;
    const [year, month, day] = newDate.split('-').map(n => parseInt(n, 10));
    const [hours, minutes] = newTime.split(':').map(n => parseInt(n, 10));
    const sendAt = new Date(year, month - 1, day, hours, minutes, 0, 0);

    if (sendAt <= new Date()) {
      alert('Please choose a future date and time.');
      return;
    }

    setIsProcessing(true);
    try {
      const currentUser = await base44.auth.me();
      const notificationId = await scheduleReminder({
        email: currentUser.email,
        title: `📌 ${task.title}`,
        body: `You've got this! ${task.title}`,
        sendAtISO: sendAt.toISOString(),
        taskId: task.id,
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

      if (notificationId) {
        const newEntry = {
          notification_id: notificationId,
          send_at: sendAt.toISOString(),
          label: 'Custom',
          notification_title: `📌 ${task.title}`,
          notification_body: `You've got this! ${task.title}`,
        };
        const newSchedule = [...schedule, newEntry].sort((a, b) =>
          new Date(a.send_at) - new Date(b.send_at)
        );
        const newIds = [...(task.onesignal_notification_ids || []), notificationId];
        await base44.entities.Task.update(task.id, {
          reminder_schedule: newSchedule,
          onesignal_notification_ids: newIds,
        });
        onUpdate({ ...task, reminder_schedule: newSchedule, onesignal_notification_ids: newIds });
      }
      setIsAdding(false);
      setNewDate('');
      setNewTime('');
    } catch (e) {
      console.error('Failed to add reminder:', e);
      alert('Failed to schedule that reminder. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`rounded-lg p-3 space-y-2 ${
      isDark ? 'bg-purple-900/30 border border-purple-800' : 'bg-purple-50 border border-purple-200'
    }`}>
      <p className={`font-semibold text-xs flex items-center gap-1 ${isDark ? 'text-purple-200' : 'text-purple-800'}`}>
        <Sparkles className="w-3 h-3" />
        Smart Reminder Schedule
      </p>

      {schedule.length === 0 && task.reminder_schedule_summary && (
        <div className={`text-xs whitespace-pre-wrap p-2 rounded-md ${
          isDark ? 'bg-gray-800/40 text-gray-300' : 'bg-white border border-purple-100 text-gray-600'
        }`}>
          {task.reminder_schedule_summary}
        </div>
      )}

      {schedule.length === 0 && !task.reminder_schedule_summary && (
        <p className={`text-xs ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
          No reminders scheduled yet. Add one below, or save a new date &amp; time above to let the AI build a full schedule.
        </p>
      )}

      {schedule.map((reminder, idx) => (
        <div
          key={reminder.notification_id || idx}
          className={`flex items-center gap-2 p-2 rounded-md ${
            isDark ? 'bg-gray-800/60' : 'bg-white border border-purple-100'
          }`}
        >
          <Bell className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-purple-300' : 'text-purple-500'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              {reminder.label}
            </p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {formatDateTime(reminder.send_at)}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-shrink-0 text-red-500 hover:bg-red-100 hover:text-red-600"
            onClick={() => handleDelete(reminder)}
            disabled={deletingId === reminder.notification_id}
          >
            {deletingId === reminder.notification_id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      ))}

      {isAdding ? (
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={`flex-1 border rounded px-2 py-1.5 text-xs ${
                isDark ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className={`flex-1 border rounded px-2 py-1.5 text-xs ${
                isDark ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newDate || !newTime || isProcessing}
              className="flex-1 h-8 text-xs"
            >
              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
              Schedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setIsAdding(false); setNewDate(''); setNewTime(''); }}
              className="flex-1 h-8 text-xs"
              disabled={isProcessing}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="w-full h-8 text-xs border-dashed"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Custom Reminder
        </Button>
      )}

      <p className={`text-xs italic ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
        Tap × to turn off a reminder. Save a new date &amp; time above to regenerate the full schedule.
      </p>
    </div>
  );
}