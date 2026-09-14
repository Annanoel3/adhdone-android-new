import React, { useState, useEffect } from 'react';
import { MapPin, Pencil, Navigation, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LocationSuggestions from "./LocationSuggestions";
import { openMapsApp } from "@/components/utils/openMapsApp";

// Where this task/event actually happens. Editable pill — the AI never guesses
// a location, so this is the only way a user can add one after capture (and the
// errand-combining nudges only fire on tasks that have one).
// Edits inline (no nested popover) — a popover layered inside the task dialog
// swallowed taps on Android, so Save never fired.
export default function LocationField({ task, theme, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.location || '');
  // Local copy so add/remove shows instantly, before the parent's save round-trips.
  const [loc, setLoc] = useState(task.location || '');
  // The user must confirm a location from the list before it can be saved —
  // otherwise a half-typed (or, on Android, an invisibly-pasted) value saved
  // nothing at all with no explanation.
  const [confirmed, setConfirmed] = useState('');
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);

  useEffect(() => {
    setValue(task.location || '');
    setLoc(task.location || '');
    setConfirmed('');
  }, [task.id, task.location]);

  // Android WebView paste (long-press → Paste) writes straight to the DOM node
  // without firing React's change event, so `value` stayed empty: no
  // suggestions appeared and Save wrote nothing. Poll the node while editing so
  // pasted text is picked up the same as typed text.
  useEffect(() => {
    if (!editing) return;
    const id = setInterval(() => {
      const dom = inputRef.current?.value;
      if (dom !== undefined && dom !== value) setValue(dom);
    }, 200);
    return () => clearInterval(id);
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [editing]);

  const save = (v) => {
    const next = v.trim();
    setLoc(next);
    setValue(next);
    setConfirmed('');
    onSave(next ? next : null);
    setEditing(false);
  };

  const openMaps = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMapsApp(loc);
  };

  if (editing) {
    return (
      <div ref={wrapRef} className={`w-full space-y-2 p-3 rounded-xl border ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'
      }`}>
        <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Location:</label>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); setConfirmed(''); }}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData('text');
            if (pasted) { e.preventDefault(); setValue(pasted.trim()); setConfirmed(''); }
          }}
          placeholder="Address, business name, or city"
          autoFocus
        />
        <LocationSuggestions
          query={value}
          theme={theme}
          onPick={(s) => { setValue(s); setConfirmed(s.trim()); }}
        />
        {value.trim() && value.trim() !== confirmed && (
          <p className={`text-xs ${theme === 'dark' ? 'text-amber-300' : 'text-amber-600'}`}>
            Pick a match from the list above to save it.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!value.trim() || value.trim() !== confirmed}
            onClick={() => save(value)}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
          >
            Save Location
          </Button>
          <Button type="button" variant="outline" onClick={() => { setValue(task.location || ''); setEditing(false); }}>
            Cancel
          </Button>
        </div>
        {loc && (
          <button
            type="button"
            onClick={() => save('')}
            className="w-full text-center px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
          >
            Remove location
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="flex items-center gap-1 max-w-full min-w-0">
      {loc && (
        <button
          type="button"
          onClick={openMaps}
          title="Open in Maps"
          className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 min-w-0 ${
            theme === 'dark' ? 'bg-teal-900 text-teal-300' : 'bg-teal-100 text-teal-700'
          }`}
        >
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{loc}</span>
          <Navigation className="w-3 h-3 flex-shrink-0 opacity-60" />
        </button>
      )}
      {loc ? (
        <button
          type="button"
          title="Edit location"
          onClick={() => setEditing(true)}
          className={`cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full flex-shrink-0 ${
            theme === 'dark' ? 'text-teal-400 hover:bg-teal-900' : 'text-teal-600 hover:bg-teal-100'
          }`}
        >
          <Pencil className="w-3 h-3" />
        </button>
      ) : null}
      {loc ? (
        <button
          type="button"
          title="Remove location"
          onClick={() => save('')}
          className={`cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full flex-shrink-0 ${
            theme === 'dark' ? 'text-red-400 hover:bg-red-900' : 'text-red-500 hover:bg-red-100'
          }`}
        >
          <X className="w-3 h-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-pointer hover:opacity-80 transition-opacity border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-white flex items-center gap-1"
        >
          <MapPin className="w-3 h-3" />
          Add Location
        </button>
      )}
    </div>
  );
}