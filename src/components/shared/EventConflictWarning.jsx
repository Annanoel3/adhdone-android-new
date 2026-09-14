import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarClock, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const fmt = (task) => {
  const raw = task?.event_time || task?.next_reminder;
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
};

// Heads-up when a new event lands on top of one already booked. Overlaps are
// often real (a call during a commute, two things at the same venue), so the
// default action KEEPS the event — this warns, it never blocks.
export default function EventConflictWarning({ theme }) {
  const [payload, setPayload] = useState(null);
  const [removing, setRemoving] = useState(false);
  const dark = theme === 'dark';

  useEffect(() => {
    const onConflict = (e) => setPayload(e.detail);
    window.addEventListener('event-conflict-detected', onConflict);
    return () => window.removeEventListener('event-conflict-detected', onConflict);
  }, []);

  if (!payload) return null;
  const { task, conflicts } = payload;

  const removeNew = async () => {
    setRemoving(true);
    try {
      await base44.functions.invoke('cancelTaskNotifications', { taskId: task.id }).catch(() => {});
      await base44.entities.Task.delete(task.id);
      window.dispatchEvent(new CustomEvent('tasks-updated'));
    } catch (e) {
      console.error('Failed to remove conflicting event:', e);
    }
    setRemoving(false);
    setPayload(null);
  };

  return (
    <Dialog open onOpenChange={() => setPayload(null)}>
      <DialogContent className={`max-w-md ${dark ? 'bg-gray-800 text-white border-gray-700' : ''}`}>
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

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={() => setPayload(null)} className="w-full">
            Book it anyway
          </Button>
          <Button
            variant="outline"
            onClick={removeNew}
            disabled={removing}
            className="w-full gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {removing ? 'Removing…' : 'Remove the new one'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}