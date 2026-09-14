import React, { useEffect, useState } from 'react';
import { MapPin, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Live address / business-name suggestions under the Location input.
// Always offers a final "use exactly what I typed" row: Places can't resolve
// every rural address or private place, and a location the user can't confirm
// is a location that never gets saved.
export default function LocationSuggestions({ query, theme, onPick }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const q = (query || '').trim();
    if (q.length < 2) { setItems([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('placesAutocomplete', { input: q });
        if (!cancelled) setItems(res?.data?.suggestions || []);
      } catch (e) {
        if (!cancelled) setItems([]);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const q = (query || '').trim();
  if (q.length < 2) return null;

  const rowClass = theme === 'dark'
    ? 'hover:bg-gray-800 text-gray-100'
    : 'hover:bg-teal-50 text-gray-800';

  return (
    <ul className={`rounded-lg border overflow-hidden ${
      theme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
    }`}>
      {items.map((s) => (
        <li key={s}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 ${rowClass}`}
          >
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-teal-600" />
            <span>{s}</span>
          </button>
        </li>
      ))}
      <li className={theme === 'dark' ? 'border-t border-gray-700' : 'border-t border-gray-200'}>
        <button
          type="button"
          onClick={() => onPick(q)}
          className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 ${rowClass}`}
        >
          <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-teal-600" />
          <span>Use “{q}” as typed</span>
        </button>
      </li>
    </ul>
  );
}