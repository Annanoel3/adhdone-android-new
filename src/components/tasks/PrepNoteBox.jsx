import React, { useEffect, useRef, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { trackFire } from '@/lib/appTrack';

// The prep note on an event: what to get ready BEFORE it, in the user's own
// words ("no food after midnight", "bring the insurance card"). One box, used
// on the reminder page (TaskNotification: the night-before and morning-of of
// an appointment ask for it there), on the event's row (PrepOffer) and on the
// open card. Saving writes Task.prep_note; the server (onTaskUpdate,
// rewordForPrep) then re-words every reminder still ahead — pushes and the
// phone's alarms — so each ends with "Prep: <note>". Anna, Nov 4 2026: her
// cat's vet visit needed him fasting, the event carried no note, and she fed
// him breakfast. Never a popup (base44/shared/prepNote.ts says why).
//
// AppEvent prep_note (props.action: saved | cleared) counts how it's used.

export const PREP_MAX = 140;

export default function PrepNoteBox({ task, theme, autoFocus = false, compact = false, onSaved, onCancel }) {
  const [value, setValue] = useState(String(task?.prep_note || ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const dark = theme === 'dark';

  useEffect(() => { setValue(String(task?.prep_note || '')); }, [task?.id, task?.prep_note]);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const before = String(task?.prep_note || '').trim();
  const next = value.replace(/\s+/g, ' ').trim().slice(0, PREP_MAX);
  const changed = next !== before;

  const save = async () => {
    if (!task?.id || !changed || saving) return;
    setSaving(true);
    setError('');
    try {
      await base44.entities.Task.update(task.id, { prep_note: next });
      trackFire('prep_note', { props: { action: next ? 'saved' : 'cleared', task_id: task.id } });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      window.dispatchEvent(new Event('tasks-changed'));
      if (onSaved) onSaved(next);
    } catch (e) {
      console.error('[PrepNoteBox] could not save the prep note:', e);
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3 ${dark ? 'border-amber-800/60 bg-amber-900/15' : 'border-amber-200 bg-amber-50/70'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <label className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-amber-300' : 'text-amber-800'}`}>
        <ClipboardList className="w-3.5 h-3.5" />
        Prep for this
      </label>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}
        maxLength={PREP_MAX}
        rows={compact ? 1 : 2}
        placeholder="Fasting? Papers to bring? Anything to do first?"
        className={`w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
          dark
            ? 'border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-500 focus:ring-amber-700'
            : 'border-amber-200 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-amber-300'
        }`}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className={`text-[11px] leading-snug ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          {saved
            ? 'Saved. Every reminder for this will repeat it.'
            : error
              ? <span className="text-red-500">{error}</span>
              : 'Every reminder for this will repeat it, alarms too.'}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onCancel && (
            <button type="button" onClick={onCancel} className={`text-xs ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
              Not now
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!changed || saving}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-40 ${
              dark ? 'bg-amber-700 text-white hover:bg-amber-600' : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : before && !next ? 'Clear' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
