import React, { useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PrepNoteBox from './PrepNoteBox';
import { trackFire } from '@/lib/appTrack';

// "Anything to prep for this?", right on an appointment's collapsed card. The
// parser marks an appointment with something to get ready BEFORE it
// (Task.prep_worthy: a vet, doctor or dental visit, a procedure, a flight, the
// DMV, an interview); while it has no prep note, the row offers this line,
// the night-before reminder asks the same, and once a note is saved every
// reminder repeats it (base44/shared/prepNote.ts; Anna, Nov 4 2026: her cat's
// vet visit needed him fasting and no reminder said so). Not a popup: a line
// on the card, like BreakItDownOffer and AddAddressOffer, so it never stacks
// with anything. Tapping it opens the prep box right there; saving ends it,
// and × hides it for that event (prep_offer_dismissed). The row shows ONE
// offer line at a time (TaskCard: prep first, then the address), so a card
// never grows two suggestions. AppEvent prep_offer (props.action: open | hide)
// counts how it's used; saves are counted by PrepNoteBox (prep_note).

export function prepOfferWanted(task) {
  if (!task || task.classification !== 'event' || task.status !== 'active') return false;
  if (task.prep_worthy !== true || task.prep_offer_dismissed) return false;
  if (task.silenced || task.parent_task_id || task.birthday_person) return false;
  if (String(task.prep_note || '').trim()) return false;
  const startMs = new Date(task.event_time || task.next_reminder || task.due_date || 0).getTime();
  return Number.isFinite(startMs) && startMs > Date.now() + 5 * 60 * 1000;
}

export default function PrepOffer({ task, theme, onRefreshTasks }) {
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);

  if (gone || !prepOfferWanted(task)) return null;
  const dark = theme === 'dark';

  const hide = () => {
    trackFire('prep_offer', { props: { action: 'hide', task_id: task.id } });
    setGone(true);
    base44.entities.Task.update(task.id, { prep_offer_dismissed: true }).catch(() => {});
  };

  if (editing) {
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <PrepNoteBox
          task={task}
          theme={theme}
          autoFocus
          compact
          onCancel={() => setEditing(false)}
          onSaved={(note) => { if (note) setGone(true); else setEditing(false); if (onRefreshTasks) onRefreshTasks(); }}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => { trackFire('prep_offer', { props: { action: 'open', task_id: task.id } }); setEditing(true); }}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
          dark
            ? 'border-amber-700 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
            : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
        }`}
      >
        <ClipboardList className="w-3 h-3" />
        Anything to prep for this? I'll put it in every reminder
      </button>
      <button
        type="button"
        onClick={hide}
        className={`p-1 rounded-full transition-colors ${dark ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
        aria-label="Hide this suggestion"
        title="Hide this suggestion"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
