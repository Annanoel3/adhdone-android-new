import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag } from 'lucide-react';

// ── Custom tags ──────────────────────────────────────────────────────────────
// One free-text tag per task, typed by the user on the card. The same words
// always get the same colour on every card: the user's own pick for that tag
// (saved on the account, tag_colors) or, until they pick one, a colour worked
// out from the tag's letters. Case and spacing are ignored, so "Mom", "mom"
// and "MOM " all match.

export const TAG_MAX = 24;

export const normalizeTag = (t) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, TAG_MAX);
export const tagKey = (t) => normalizeTag(t).toLowerCase();

export const TAG_PALETTE = [
  { name: 'rose', light: 'bg-rose-100 text-rose-800 border-rose-200', dark: 'bg-rose-900/40 text-rose-200 border-rose-800', swatch: 'bg-rose-300' },
  { name: 'orange', light: 'bg-orange-100 text-orange-800 border-orange-200', dark: 'bg-orange-900/40 text-orange-200 border-orange-800', swatch: 'bg-orange-300' },
  { name: 'amber', light: 'bg-amber-100 text-amber-800 border-amber-200', dark: 'bg-amber-900/40 text-amber-200 border-amber-800', swatch: 'bg-amber-300' },
  { name: 'lime', light: 'bg-lime-100 text-lime-800 border-lime-200', dark: 'bg-lime-900/40 text-lime-200 border-lime-800', swatch: 'bg-lime-300' },
  { name: 'emerald', light: 'bg-emerald-100 text-emerald-800 border-emerald-200', dark: 'bg-emerald-900/40 text-emerald-200 border-emerald-800', swatch: 'bg-emerald-300' },
  { name: 'teal', light: 'bg-teal-100 text-teal-800 border-teal-200', dark: 'bg-teal-900/40 text-teal-200 border-teal-800', swatch: 'bg-teal-300' },
  { name: 'sky', light: 'bg-sky-100 text-sky-800 border-sky-200', dark: 'bg-sky-900/40 text-sky-200 border-sky-800', swatch: 'bg-sky-300' },
  { name: 'indigo', light: 'bg-indigo-100 text-indigo-800 border-indigo-200', dark: 'bg-indigo-900/40 text-indigo-200 border-indigo-800', swatch: 'bg-indigo-300' },
  { name: 'violet', light: 'bg-violet-100 text-violet-800 border-violet-200', dark: 'bg-violet-900/40 text-violet-200 border-violet-800', swatch: 'bg-violet-300' },
  { name: 'fuchsia', light: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200', dark: 'bg-fuchsia-900/40 text-fuchsia-200 border-fuchsia-800', swatch: 'bg-fuchsia-300' },
  { name: 'pink', light: 'bg-pink-100 text-pink-800 border-pink-200', dark: 'bg-pink-900/40 text-pink-200 border-pink-800', swatch: 'bg-pink-300' },
  { name: 'cyan', light: 'bg-cyan-100 text-cyan-800 border-cyan-200', dark: 'bg-cyan-900/40 text-cyan-200 border-cyan-800', swatch: 'bg-cyan-300' },
];

// The account's picked colours, kept here so every card shares one copy:
// a cache on this phone for the first paint, the account record behind it.
const TAG_COLORS_KEY = 'tag_colors';
const TAG_COLORS_EVENT = 'tag-colors-changed';
let tagColors = null;
let tagColorsFetched = false;
function readTagColors() {
  if (tagColors) return tagColors;
  try { tagColors = JSON.parse(localStorage.getItem(TAG_COLORS_KEY) || '{}') || {}; } catch (e) { tagColors = {}; }
  if (!tagColorsFetched) {
    tagColorsFetched = true;
    base44.auth.me().then((u) => {
      if (u?.tag_colors && typeof u.tag_colors === 'object') {
        tagColors = { ...tagColors, ...u.tag_colors };
        try { localStorage.setItem(TAG_COLORS_KEY, JSON.stringify(tagColors)); } catch (e) { /* first paint only */ }
        window.dispatchEvent(new CustomEvent(TAG_COLORS_EVENT));
      }
    }).catch(() => {});
  }
  return tagColors;
}

export function tagColorName(tag) {
  const key = tagKey(tag);
  const chosen = readTagColors()[key];
  if (chosen && TAG_PALETTE.some((c) => c.name === chosen)) return chosen;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length].name;
}

export function tagPillClass(tag, theme) {
  const c = TAG_PALETTE.find((x) => x.name === tagColorName(tag)) || TAG_PALETTE[0];
  return theme === 'dark' ? c.dark : c.light;
}

// The user's pick for a tag: every card with that tag changes at once, and
// the account keeps it for their other phones.
export function setTagColor(tag, name) {
  const key = tagKey(tag);
  if (!key || !TAG_PALETTE.some((c) => c.name === name)) return;
  tagColors = { ...readTagColors(), [key]: name };
  try { localStorage.setItem(TAG_COLORS_KEY, JSON.stringify(tagColors)); } catch (e) { /* the account copy still saves */ }
  window.dispatchEvent(new CustomEvent(TAG_COLORS_EVENT));
  base44.auth.updateMe({ tag_colors: tagColors }).catch((error) => {
    console.error('Error saving tag colour:', error);
  });
}

// The tag pill itself, shared by the task list's card and Home's Today's
// Focus card: the tag (or a faint tag mark when there is none), and a popover
// to type one, pick one already in use, choose its colour, or remove it.
export function TagPill({ task, theme, onUpdateTask, onRefreshTasks }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(task.tag || '');
  const [options, setOptions] = useState([]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener(TAG_COLORS_EVENT, onChange);
    return () => window.removeEventListener(TAG_COLORS_EVENT, onChange);
  }, []);
  const dark = theme === 'dark';

  // The tags already on this account's active tasks, most used first, for
  // one-tap picks. Read when the picker opens, so it's never a cost on the list.
  const loadOptions = async () => {
    try {
      const rows = await base44.entities.Task.filter({ status: 'active' }, '-updated_date', 200);
      const counts = new Map();
      for (const r of rows || []) {
        const t = normalizeTag(r.tag);
        if (!t) continue;
        const k = t.toLowerCase();
        counts.set(k, { tag: counts.get(k)?.tag || t, n: (counts.get(k)?.n || 0) + 1 });
      }
      setOptions(Array.from(counts.values()).sort((a, b) => b.n - a.n).map((x) => x.tag).slice(0, 12));
    } catch (e) {
      setOptions([]);
    }
  };

  const commit = (value) => {
    const next = normalizeTag(value) || null;
    setOpen(false);
    if ((task.tag || null) === next) return;
    if (onUpdateTask) onUpdateTask({ ...task, tag: next });
    base44.entities.Task.update(task.id, { tag: next }).catch((error) => {
      console.error('Error updating tag:', error);
      if (onRefreshTasks) onRefreshTasks();
    });
  };

  const current = normalizeTag(draft) || task.tag || '';
  const currentColor = current ? tagColorName(current) : null;
  const picks = options.filter((t) => t.toLowerCase() !== normalizeTag(draft).toLowerCase());

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraft(task.tag || ''); loadOptions(); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={task.tag ? `Tag: ${task.tag}. Tap to change it` : 'Add a tag'}
          title={task.tag ? 'Change the tag' : 'Add a tag'}
          className={task.tag
            ? `flex-shrink-0 text-xs px-2 py-1 rounded border whitespace-nowrap max-w-[6.5rem] truncate cursor-pointer hover:opacity-80 transition-opacity ${tagPillClass(task.tag, theme)}`
            : `flex-shrink-0 p-1 rounded transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'}`}
        >
          {task.tag ? task.tag : <Tag className="w-3.5 h-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className={`w-64 p-3 ${dark ? 'bg-gray-800 border-gray-700' : ''}`} onClick={(e) => e.stopPropagation()}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); commit(draft); }}>
          <div>
            <label className={`text-sm font-medium block mb-1 ${dark ? 'text-gray-200' : ''}`}>Tag</label>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={TAG_MAX}
              autoFocus
              placeholder="Anything — mom, work, errand"
              className={`w-full border rounded px-3 py-2 text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`}
            />
          </div>
          {picks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picks.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => commit(t)}
                  className={`text-xs px-2 py-1 rounded border cursor-pointer hover:opacity-80 ${tagPillClass(t, theme)}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {current && (
            <div>
              <p className={`text-xs mb-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Colour for "{current}" (every card with it)</p>
              <div className="flex flex-wrap gap-1.5">
                {TAG_PALETTE.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => setTagColor(current, c.name)}
                    className={`w-6 h-6 rounded-full ${c.swatch} ${currentColor === c.name ? 'ring-2 ring-offset-1 ring-gray-700 dark:ring-gray-200' : 'opacity-80 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" className="flex-1" disabled={!normalizeTag(draft)}>
              Save
            </Button>
            {task.tag && (
              <Button type="button" size="sm" variant="ghost" onClick={() => commit('')} className={dark ? 'text-gray-300' : 'text-gray-600'}>
                Remove
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// Work / Personal tag on a task card. The parser guesses it at creation; this
// is the one-tap override when it guesses wrong. Unset reads as personal.
export default function LifeAreaPill({ task, theme, onUpdateTask }) {
  const isWork = task.life_area === 'work';

  const toggle = (e) => {
    e.stopPropagation();
    const next = isWork ? 'personal' : 'work';
    if (onUpdateTask) onUpdateTask({ ...task, life_area: next });
    base44.entities.Task.update(task.id, { life_area: next }).catch((error) => {
      console.error('Error updating life area:', error);
    });
  };

  return (
    <button
      onClick={toggle}
      title={isWork ? 'Marked as work — tap to make it personal' : 'Marked as personal — tap to make it work'}
      className={`flex items-center gap-1 border px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
        theme === 'dark'
          ? 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {isWork ? '💼 Work' : '🏠 Personal'}
    </button>
  );
}