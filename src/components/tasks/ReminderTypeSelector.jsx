import React, { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Brain,
  Timer,
  Repeat,
  CalendarClock,
  CalendarDays,
  Cake,
  ChevronRight,
  Check,
  Info,
} from 'lucide-react';

// One consolidated control that replaces the old classification pill, the
// interval pill, the "Make Recurring" pill, and the "Add Reminder" pill.
// Selecting a type routes to the parent's existing handlers so all the
// cancel/reschedule logic stays in one place.

const INTERVAL_OPTIONS = [
  { value: '10min', label: 'Every 10 minutes' },
  { value: '20min', label: 'Every 20 minutes' },
  { value: '30min', label: 'Every 30 minutes' },
  { value: '1hour', label: 'Every hour' },
  { value: 'daily', label: 'Daily' },
  { value: 'every_other_day', label: 'Every other day' },
];

const REPEAT_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'none', label: 'Turn off' },
];

export function getCurrentReminderType(task) {
  if (task.classification === 'birthday' || task.birthday_person) return 'birthday';
  if (task.classification === 'event') return 'event';
  if (task.recurrence_pattern && task.recurrence_pattern !== 'none') return 'repeat';
  if (task.reminder_interval && task.reminder_interval !== 'once') return 'interval';
  if (task.reminder_interval === 'once' || task.next_reminder) return 'once';
  return 'smart';
}

const TYPE_META = {
  smart: { icon: Brain, label: 'Smart Reminders', pillClass: 'bg-purple-100 text-purple-700' },
  interval: { icon: Timer, label: 'Interval', pillClass: 'bg-white border border-gray-300 text-gray-700' },
  repeat: { icon: Repeat, label: 'Repeats', pillClass: 'bg-indigo-100 text-indigo-700' },
  once: { icon: CalendarClock, label: 'One-Time', pillClass: 'bg-purple-500 text-white' },
  event: { icon: CalendarDays, label: 'Event', pillClass: 'bg-indigo-100 text-indigo-700' },
  birthday: { icon: Cake, label: 'Birthday', pillClass: 'bg-pink-100 text-pink-700' },
};

function formatIntervalLabel(value) {
  const found = INTERVAL_OPTIONS.find((o) => o.value === value);
  return found ? found.label : value;
}

export default function ReminderTypeSelector({ task, theme, onChangeType }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const currentType = getCurrentReminderType(task);
  const meta = TYPE_META[currentType];
  const isDark = theme === 'dark';

  let pillLabel = meta.label;
  if (currentType === 'interval') pillLabel = formatIntervalLabel(task.reminder_interval);
  if (currentType === 'repeat') pillLabel = `Repeats ${task.recurrence_pattern}`;
  if (currentType === 'once' && task.next_reminder) {
    const d = new Date(task.next_reminder);
    pillLabel = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  if (currentType === 'event' && task.event_time) {
    const d = new Date(task.event_time);
    pillLabel = `Event ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  const handleSelect = (type, sub) => {
    setOpen(false);
    setExpanded(null);
    onChangeType(type, sub);
  };

  const subBtnClass = (active) =>
    active
      ? 'bg-purple-50 text-purple-700 font-medium'
      : isDark
        ? 'hover:bg-gray-700 text-gray-200'
        : 'hover:bg-gray-100';

  const renderRow = (type, Icon, label, description, hasSub, onToggle) => {
    const active = currentType === type;
    return (
      <div>
        <button
          onClick={() => (hasSub ? onToggle() : handleSelect(type))}
          className={`w-full text-left px-3 py-2 text-sm rounded flex items-center gap-2 ${
            active ? 'bg-purple-50 text-purple-700 font-medium' : isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100'
          }`}
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1">
            <div>{label}</div>
            {description && <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{description}</div>}
          </div>
          {active && <Check className="w-4 h-4 text-purple-600" />}
          {hasSub && <ChevronRight className={`w-4 h-4 transition-transform ${expanded === type ? 'rotate-90' : ''}`} />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1">
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setExpanded(null);
      }}
    >
      <PopoverTrigger asChild>
        <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${meta.pillClass}`}>
          <meta.icon className="w-3 h-3" />
          {pillLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className={`w-72 max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto p-2 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
        <div className="space-y-0.5">
          {renderRow('smart', Brain, 'Smart Reminders', 'AI decides when to nudge', false)}
          {renderRow('interval', Timer, 'Interval Reminders', 'Every X minutes / hours', true, () => setExpanded(expanded === 'interval' ? null : 'interval'))}
          {expanded === 'interval' && (
            <div className="ml-6 space-y-0.5">
              {INTERVAL_OPTIONS.map((o) => (
                <button key={o.value} onClick={() => handleSelect('interval', o.value)} className={`w-full text-left px-3 py-1.5 text-sm rounded ${subBtnClass(task.reminder_interval === o.value)}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {renderRow('repeat', Repeat, 'Repeat on Completion', 'Recreates daily / weekly / monthly / yearly', true, () => setExpanded(expanded === 'repeat' ? null : 'repeat'))}
          {expanded === 'repeat' && (
            <div className="ml-6 space-y-0.5">
              {REPEAT_OPTIONS.map((o) => (
                <button key={o.value} onClick={() => handleSelect('repeat', o.value)} className={`w-full text-left px-3 py-1.5 text-sm rounded ${subBtnClass(task.recurrence_pattern === o.value)}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {renderRow('once', CalendarClock, 'One-Time Reminder', 'Single reminder at a specific time', false)}
          {renderRow('event', CalendarDays, 'Event', 'Scheduled event with lead-time reminders', false)}
        </div>
      </PopoverContent>
    </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full ${isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
            title="What do these reminder types do?"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className={`w-80 max-w-[calc(100vw-1.5rem)] max-h-[85vh] overflow-y-auto p-4 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'}`}>
          <p className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Reminder types</p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Brain className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" />
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Smart Reminders</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>AI decides when and how often to nudge you — a few well-timed reminders per day instead of constant pinging. Best for tasks with no hard deadline.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Timer className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" />
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Interval Reminders</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>A reminder fires on a fixed schedule (every 10 min, every 2 hours, daily…). Pick this only when you specifically want frequent, repeating nudges.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Repeat className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" />
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Repeat on Completion</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>When you complete the task, a fresh copy is auto-created for the next cycle (daily, weekly, monthly, or yearly). Great for habits and recurring chores.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <CalendarClock className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" />
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>One-Time Reminder</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>A single reminder at one specific date and time. It fires once, then it is done — no repeats.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <CalendarDays className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" />
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Event</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>A scheduled occasion with a fixed date and time (meetings, appointments). You get lead-time reminders before it starts.</p>
              </div>
            </div>
            <p className={`text-xs italic pt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Birthdays are detected automatically from your calendar or quick-add — you don't choose them here.</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}