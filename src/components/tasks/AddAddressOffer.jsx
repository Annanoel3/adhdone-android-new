import React, { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import LocationField from './LocationField';
import { trackFire } from '@/lib/appTrack';

// "Add the address and I'll time when to leave", right on an event's collapsed
// card. An event with an address gets "Time to leave" at the measured drive
// (from home, work, or the event before it) instead of the blanket hour
// before; one without an address, often a phone-calendar import, can't. Anna,
// Nov 4 2026: her 9 AM appointment got "in about an hour" at 8:00 when the
// drive meant leaving by 7:50, because the event had no address ("How do we
// promote adding addresses on events? ... Only on accounts with home location
// saved"). Not a popup: a line on the card, like BreakItDownOffer, so it never
// stacks with anything and never interrupts adding events. Shown on an
// upcoming timed event with no address, only when the account has a home
// circle (without one there is nothing to measure from); tapping it opens the
// address editor right there; saving ends it, and × hides it for that event
// (address_offer_dismissed). AppEvent address_offer (props.action: open |
// saved | hide) counts how it's used.

// One look at the account per app load: every card asks the same question.
let homeLook = null;
function accountHasHome() {
  if (!homeLook) {
    homeLook = base44.auth.me()
      .then((u) => u?.home_lat != null && u?.home_lng != null)
      .catch(() => false);
  }
  return homeLook;
}
// Places saved during this session: ask again next time.
if (typeof window !== 'undefined') window.addEventListener('home-base-saved', () => { homeLook = null; });

export default function AddAddressOffer({ task, theme, onRefreshTasks }) {
  const [hasHome, setHasHome] = useState(false);
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let alive = true;
    accountHasHome().then((v) => { if (alive) setHasHome(!!v); });
    return () => { alive = false; };
  }, []);

  if (!task || task.classification !== 'event' || task.status !== 'active') return null;
  if (task.silenced || task.parent_task_id || task.day_only_task || task.birthday_person) return null;
  if (String(task.location || '').trim() || task.address_offer_dismissed) return null;
  // A video session, a phone call, a webinar: nowhere to drive to, so nothing
  // to time (the parser's goes_somewhere; Anna, Nov 5 2026). Events made
  // before that field existed have no value and are offered as before.
  if (task.goes_somewhere === false) return null;
  const startMs = new Date(task.event_time || task.next_reminder || 0).getTime();
  if (!Number.isFinite(startMs) || startMs <= Date.now() + 5 * 60 * 1000) return null;
  if (!hasHome || gone) return null;

  const dark = theme === 'dark';

  const saved = async (loc) => {
    const next = loc ? String(loc).trim() : '';
    if (!next) { setEditing(false); return; }
    trackFire('address_offer', { props: { action: 'saved', task_id: task.id } });
    setGone(true);
    try {
      // onTaskUpdate re-times the event's heads-up from the drive the moment
      // the address lands (retimeLeadForAddress).
      await base44.entities.Task.update(task.id, { location: next });
    } catch (e) {
      console.error('[AddAddressOffer] could not save the address:', e);
    }
    if (onRefreshTasks) onRefreshTasks();
    window.dispatchEvent(new Event('tasks-changed'));
  };

  const hide = () => {
    trackFire('address_offer', { props: { action: 'hide', task_id: task.id } });
    setGone(true);
    base44.entities.Task.update(task.id, { address_offer_dismissed: true }).catch(() => {});
  };

  if (editing) {
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <LocationField task={task} theme={theme} onSave={saved} startEditing onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => { trackFire('address_offer', { props: { action: 'open', task_id: task.id } }); setEditing(true); }}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
          dark
            ? 'border-teal-700 bg-teal-900/30 text-teal-300 hover:bg-teal-900/50'
            : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
        }`}
      >
        <MapPin className="w-3 h-3" />
        Add the address and I'll time when to leave
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
