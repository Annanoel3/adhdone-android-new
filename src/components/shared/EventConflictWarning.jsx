import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarClock, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { usePopupTurn } from '@/components/onboarding/onboardingSurface';

const startOf = (task) => task?.event_time || task?.next_reminder;

const fmt = (task) => {
  const raw = startOf(task);
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
};

const asDateValue = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const asTimeValue = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Heads-up when a new event lands on top of one already booked. Overlaps are
// often real (a call during a commute, two things at the same venue), so the
// default action KEEPS the event — this warns, it never blocks. The alternative
// is moving it, not deleting it: the plan is still real, it just needs a
// different slot.
export default function EventConflictWarning({ theme }) {
  const [payload, setPayload] = useState(null);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  // Takes its turn with other popups (never stacks on one), but as the answer
  // to something the user just did it shows the moment the screen is free.
  const shown = usePopupTurn(!!payload, { reactive: true });
  const dark = theme === 'dark';

  useEffect(() => {
    const onConflict = (e) => {
      const start = new Date(startOf(e.detail.task));
      setDate(asDateValue(start));
      setTime(asTimeValue(start));
      setPicking(false);
      setPayload(e.detail);
    };
    window.addEventListener('event-conflict-detected', onConflict);
    return () => window.removeEventListener('event-conflict-detected', onConflict);
  }, []);

  if (!payload || !shown) return null;
  const { task, conflicts } = payload;

  const reschedule = async () => {
    const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
    const [hh, mm] = time.split(':').map((n) => parseInt(n, 10));
    const when = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (isNaN(when.getTime())) return;

    setSaving(true);
    try {
      // Old pushes point at the old time — clear them before booking new ones.
      await base44.functions.invoke('cancelTaskNotifications', { taskId: task.id }).catch(() => {});
      await base44.entities.Task.update(task.id, {
        next_reminder: when.toISOString(),
        event_time: when.toISOString(),
        onesignal_notification_ids: [],
        reminder_schedule: [],
      });

      const user = await base44.auth.me();
      const { scheduleMultiReminders } = await import('@/components/utils/multiReminderScheduler');
      const ids = await scheduleMultiReminders({
        email: user.email,
        title: task.title,
        scheduledDateISO: when.toISOString(),
        taskId: task.id,
        urgency: task.urgency,
        classification: 'event',
      });
      if (ids) await base44.entities.Task.update(task.id, { onesignal_notification_ids: ids });
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    } catch (e) {
      console.error('Failed to reschedule event:', e);
    }
    setSaving(false);
    setPayload(null);
  };

  return (
    <Dialog open onOpenChange={() => setPayload(null)}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] ${dark ? 'bg-gray-800 text-white border-gray-700' : ''}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-500" />
            That overlaps something
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-300' : ''}>
            Just so it doesn't sneak up on you — this might be fine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className={`p-3 rounded-lg ${dark ? 'bg-gray-700' : 'bg-amber-50'}`}>
            <p className="text-xs uppercase tracking-wide opacity-60">Just added</p>
            <p className="font-medium">{task.title}</p>
            <p className="text-sm opacity-70">{fmt(task)}</p>
          </div>
          <div className={`p-3 rounded-lg ${dark ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className="text-xs uppercase tracking-wide opacity-60">
              Already on your calendar
            </p>
            {conflicts.map((c) => (
              <div key={c.id} className="mt-1">
                <p className="font-medium">{c.title}</p>
                <p className="text-sm opacity-70">{fmt(c)}</p>
              </div>
            ))}
          </div>
        </div>

        {picking ? (
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-sm font-medium block mb-1">New date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">New time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white text-gray-900"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={reschedule} disabled={saving || !date || !time} className="flex-1">
                {saving ? 'Moving…' : 'Move it'}
              </Button>
              <Button variant="outline" onClick={() => setPicking(false)} className="flex-1">
                Back
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => setPayload(null)} className="w-full">
              Book it anyway
            </Button>
            <Button variant="outline" onClick={() => setPicking(true)} className="w-full gap-2">
              <Clock className="w-4 h-4" />
              Move it to another time
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}