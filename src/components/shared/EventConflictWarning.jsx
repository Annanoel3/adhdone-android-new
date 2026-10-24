import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarClock, Clock, Copy } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { usePopupTurn } from '@/components/onboarding/onboardingSurface';
import { CONFLICT_EVENT, resolveConflict, showPendingConflicts } from '@/components/utils/eventConflicts';

const startOf = (task) => task?.event_time || task?.next_reminder || task?.due_date;
const allDay = (task) => !task?.event_time;

const fmt = (task) => {
  const raw = startOf(task);
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString('en-US', allDay(task)
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

const asDateValue = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const asTimeValue = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const notesOf = (t) => [t?.notes, t?.description].map((x) => String(x || '').trim()).filter(Boolean).join('\n\n');

// Double bookings and likely duplicates, one popup for both (Sep 14 2026 for
// an overlap added in the app; Oct 23 2026, Anna: from a calendar import too,
// and duplicates with a choice of what to keep). The server flags them
// (shared/eventConflicts.ts); this shows each flag in turn, tells the server
// the moment one is on screen (so the 15-minute fallback notification is
// cancelled), and sends back what the person decided. It warns, it never
// blocks: overlaps are often real (a call during a commute, two things at the
// same venue), so the default keeps everything as it is.
export default function EventConflictWarning({ user, theme }) {
  const [queue, setQueue] = useState([]);
  const [items, setItems] = useState({});
  const [picking, setPicking] = useState(false);
  const [combining, setCombining] = useState(false);
  const [keepId, setKeepId] = useState(null);
  const [choice, setChoice] = useState({ title: 'kept', time: 'kept', notes: 'kept', location: 'kept' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const seenRef = useRef(new Set());
  const current = queue[0] || null;
  // Takes its turn with other popups (never stacks on one), but as the answer
  // to something the user just did it shows the moment the screen is free.
  const shown = usePopupTurn(!!current, { reactive: true });
  const dark = theme === 'dark';

  useEffect(() => {
    const onConflict = (e) => {
      const flags = Array.isArray(e.detail?.flags) ? e.detail.flags : [];
      const got = e.detail?.items || {};
      setItems((prev) => ({ ...prev, ...got }));
      setQueue((prev) => {
        const have = new Set(prev.map((f) => f.id));
        return [...prev, ...flags.filter((f) => f && f.id && !have.has(f.id) && !seenRef.current.has(`done:${f.id}`))];
      });
    };
    window.addEventListener(CONFLICT_EVENT, onConflict);
    return () => window.removeEventListener(CONFLICT_EVENT, onConflict);
  }, []);

  // Anything flagged while the app was closed (a calendar sync on the phone).
  useEffect(() => {
    if (!user?.email) return undefined;
    showPendingConflicts();
    const onBack = () => { if (document.visibilityState === 'visible') showPendingConflicts(); };
    document.addEventListener('visibilitychange', onBack);
    return () => document.removeEventListener('visibilitychange', onBack);
  }, [user?.email]);

  // On screen: the fallback notification isn't needed.
  useEffect(() => {
    if (!shown || !current || seenRef.current.has(current.id)) return;
    seenRef.current.add(current.id);
    resolveConflict(current.id, 'seen').catch(() => {});
    const a = items[current.task_ids[0]];
    const start = new Date(startOf(a) || Date.now());
    setDate(asDateValue(start));
    setTime(asTimeValue(start));
    setPicking(false);
    setCombining(false);
    setKeepId(current.task_ids[0]);
    setChoice({ title: 'kept', time: 'kept', notes: 'kept', location: 'kept' });
  }, [shown, current, items]);

  if (!current || !shown) return null;
  const a = items[current.task_ids[0]];
  const b = items[current.task_ids[1]];
  if (!a || !b) {
    // One of them is gone (deleted meanwhile): nothing to ask.
    seenRef.current.add(`done:${current.id}`);
    setQueue((q) => q.slice(1));
    return null;
  }
  const isDup = current.kind === 'duplicate';
  const newer = current.source === 'app' ? a : (Date.parse(a.created_date || 0) >= Date.parse(b.created_date || 0) ? a : b);
  const older = newer === a ? b : a;

  const finish = (action, extra) => {
    seenRef.current.add(`done:${current.id}`);
    setQueue((q) => q.slice(1));
    if (action) resolveConflict(current.id, action, extra).catch(() => {});
  };

  const reschedule = async () => {
    const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
    const [hh, mm] = time.split(':').map((n) => parseInt(n, 10));
    const when = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (isNaN(when.getTime())) return;

    setSaving(true);
    try {
      // Old pushes point at the old time — clear them before booking new ones.
      await base44.functions.invoke('cancelTaskNotifications', { taskId: newer.id }).catch(() => {});
      await base44.entities.Task.update(newer.id, {
        next_reminder: when.toISOString(),
        event_time: when.toISOString(),
        ...(newer.due_date ? { due_date: when.toISOString() } : {}),
        day_only_task: false,
        // The time they just picked: it may go off inside quiet hours (RULES.md §9 Q4).
        time_stated: true,
        onesignal_notification_ids: [],
        reminder_schedule: [],
      });

      const me = await base44.auth.me();
      const { scheduleMultiReminders } = await import('@/components/utils/multiReminderScheduler');
      const ids = await scheduleMultiReminders({
        email: me.email,
        title: newer.title,
        scheduledDateISO: when.toISOString(),
        taskId: newer.id,
        urgency: newer.urgency,
        classification: 'event',
        timeStated: true,
      });
      if (ids) await base44.entities.Task.update(newer.id, { onesignal_notification_ids: ids });
      // 'tasks-changed' is the event the pages listen for (Home reloads, and
      // its reload re-sends the phone's alarm set); the alarm set is also
      // rebuilt directly, for the screens that don't reload.
      window.dispatchEvent(new CustomEvent('tasks-changed'));
      import('@/components/utils/widgetBridge').then((m) => m.refreshAlarms()).catch(() => {});
    } catch (e) {
      console.error('Failed to reschedule event:', e);
    }
    setSaving(false);
    finish('moved');
  };

  const combine = async () => {
    setSaving(true);
    try {
      const fields = {};
      for (const k of Object.keys(choice)) if (choice[k] !== 'kept') fields[k] = choice[k];
      await resolveConflict(current.id, 'combine', { keepTaskId: keepId, fields });
      window.dispatchEvent(new CustomEvent('tasks-changed'));
      import('@/components/utils/widgetBridge').then((m) => m.refreshAlarms()).catch(() => {});
    } catch (e) {
      console.error('Failed to combine:', e);
    }
    setSaving(false);
    seenRef.current.add(`done:${current.id}`);
    setQueue((q) => q.slice(1));
  };

  const kept = keepId === a.id ? a : b;
  const other = kept === a ? b : a;
  const differs = (k) => {
    if (k === 'title') return String(kept.title || '').trim() !== String(other.title || '').trim();
    if (k === 'time') return (startOf(kept) || '') !== (startOf(other) || '') || allDay(kept) !== allDay(other);
    if (k === 'notes') return notesOf(kept) !== notesOf(other) && !!notesOf(other);
    if (k === 'location') return !!other.location && (other.location || '') !== (kept.location || '');
    return false;
  };
  const Pick = ({ k, label, keptText, otherText, both }) => (
    <div className={`p-2 rounded-lg ${dark ? 'bg-gray-700' : 'bg-gray-50'}`}>
      <p className="text-xs uppercase tracking-wide opacity-60 mb-1">{label}</p>
      <div className="flex flex-col gap-1">
        {[['kept', keptText], ['other', otherText], ...(both ? [['both', 'Keep both']] : [])].map(([v, text]) => (
          <label key={v} className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name={`pick-${k}`} checked={choice[k] === v} onChange={() => setChoice((c) => ({ ...c, [k]: v }))} className="mt-1" />
            <span className="break-words">{text || <span className="opacity-50">(none)</span>}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const Card = ({ task, label, tone }) => (
    <div className={`p-3 rounded-lg ${dark ? 'bg-gray-700' : tone === 'new' ? 'bg-amber-50' : 'bg-gray-50'}`}>
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      <p className="font-medium">{task.title}</p>
      <p className="text-sm opacity-70">{fmt(task)}{task.location ? ` · ${task.location}` : ''}</p>
    </div>
  );

  return (
    <Dialog open onOpenChange={() => finish(isDup ? 'different' : 'keep')}>
      <DialogContent className={`max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto ${dark ? 'bg-gray-800 text-white border-gray-700' : ''}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDup ? <Copy className="w-5 h-5 text-amber-500" /> : <CalendarClock className="w-5 h-5 text-amber-500" />}
            {isDup ? 'Same thing twice?' : 'That overlaps something'}
          </DialogTitle>
          <DialogDescription className={dark ? 'text-gray-300' : ''}>
            {isDup
              ? (current.why || 'These two look like the same thing. You can fold them into one.')
              : 'Just so it doesn\'t sneak up on you — this might be fine.'}
          </DialogDescription>
        </DialogHeader>

        {combining ? (
          <div className="space-y-3">
            <p className="text-sm opacity-80">Which one stays on your list?</p>
            <div className="flex flex-col gap-2">
              {[a, b].map((t) => (
                <label key={t.id} className={`flex items-start gap-2 p-3 rounded-lg cursor-pointer ${keepId === t.id ? (dark ? 'bg-gray-600' : 'bg-amber-50') : (dark ? 'bg-gray-700' : 'bg-gray-50')}`}>
                  <input type="radio" name="keep" checked={keepId === t.id} onChange={() => { setKeepId(t.id); setChoice({ title: 'kept', time: 'kept', notes: 'kept', location: 'kept' }); }} className="mt-1" />
                  <span>
                    <span className="font-medium block">{t.title}</span>
                    <span className="text-sm opacity-70">{fmt(t)}</span>
                  </span>
                </label>
              ))}
            </div>
            {(differs('title') || differs('time') || differs('notes') || differs('location')) && (
              <p className="text-sm opacity-80">Anything to take from the other one?</p>
            )}
            {differs('title') && <Pick k="title" label="Name" keptText={kept.title} otherText={other.title} />}
            {differs('time') && <Pick k="time" label="When" keptText={fmt(kept)} otherText={fmt(other)} />}
            {differs('location') && <Pick k="location" label="Where" keptText={kept.location || ''} otherText={other.location || ''} />}
            {differs('notes') && <Pick k="notes" label="Notes" keptText={notesOf(kept).slice(0, 160)} otherText={notesOf(other).slice(0, 160)} both={!!notesOf(kept)} />}
            <div className="flex gap-2 pt-1">
              <Button onClick={combine} disabled={saving} className="flex-1">{saving ? 'Combining…' : 'Combine them'}</Button>
              <Button variant="outline" onClick={() => setCombining(false)} className="flex-1">Back</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Card task={newer} label={current.source === 'calendar' ? 'From your calendar' : 'Just added'} tone="new" />
              <Card task={older} label="Already on your list" />
            </div>

            {isDup ? (
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => setCombining(true)} className="w-full gap-2">
                  <Copy className="w-4 h-4" />
                  Combine them
                </Button>
                <Button variant="outline" onClick={() => finish('different')} className="w-full">
                  They're different, keep both
                </Button>
              </div>
            ) : picking ? (
              <div className="space-y-3 pt-1">
                <p className="text-sm opacity-80">Move "{newer.title}" to:</p>
                <div>
                  <label className="text-sm font-medium block mb-1">New date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded px-3 py-2 bg-white text-gray-900" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">New time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full border rounded px-3 py-2 bg-white text-gray-900" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={reschedule} disabled={saving || !date || !time} className="flex-1">
                    {saving ? 'Moving…' : 'Move it'}
                  </Button>
                  <Button variant="outline" onClick={() => setPicking(false)} className="flex-1">Back</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => finish('keep')} className="w-full">
                  Keep both as they are
                </Button>
                <Button variant="outline" onClick={() => setPicking(true)} className="w-full gap-2">
                  <Clock className="w-4 h-4" />
                  Move "{newer.title.length > 24 ? `${newer.title.slice(0, 24)}…` : newer.title}"
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
