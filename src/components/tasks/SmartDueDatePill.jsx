import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getLocalDateString } from '../utils/todayTasks';

// Due date for a Smart Reminders task. Smart tasks have no fixed reminder time
// — the AI decides when to nudge — but they can still be due by a day, and the
// user needs to be able to push that day out. Writes ONLY due_date, so the task
// stays on smart reminders.
export default function SmartDueDatePill({ task, theme, onSave }) {
  const [open, setOpen] = useState(false);
  const isDark = theme === 'dark';
  const due = task.due_date;
  const overdue = due && new Date(due).getTime() < Date.now() && task.status !== 'completed';

  const save = (value) => {
    if (!value) return onSave(null);
    const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
    const existing = due ? new Date(due) : null;
    const hours = existing ? existing.getHours() : 9;
    const minutes = existing ? existing.getMinutes() : 0;
    onSave(new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
          due
            ? overdue
              ? isDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700'
              : isDark ? 'bg-amber-900 text-amber-300' : 'bg-amber-100 text-amber-700'
            : 'border border-dashed border-gray-300 text-gray-500 bg-white'
        }`}>
          <CalendarClock className="w-3 h-3" />
          {due
            ? `${overdue ? 'Overdue' : 'Due'} ${new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : 'Add Due Date'}
        </button>
      </PopoverTrigger>
      <PopoverContent className={`w-60 p-3 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
        <div className="space-y-2">
          <label className={`text-sm font-medium block ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Due Date:</label>
          <input
            type="date"
            // The day on the person's own calendar, the same day the pill shows.
            // This used to be the UTC day: a task due Sep 25 at 11:59 PM showed
            // Sep 26 here, and picking Sep 26 did nothing (the box already
            // said Sep 26, so the phone reported no change).
            defaultValue={due ? getLocalDateString(new Date(due)) : ''}
            onChange={(e) => { if (e.target.value) { save(e.target.value); setOpen(false); } }}
            className={`w-full border rounded px-3 py-2 ${isDark ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
          />
          <p className="text-xs text-gray-500">Smart reminders keep deciding when to nudge you — this is just the day it needs to be done by.</p>
          {due && (
            <button
              onClick={() => { save(null); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
            >
              Remove due date
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}