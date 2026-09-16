import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Find-my-region search for the home map. Purely a camera move: picking a
// result recenters the map and nothing about the query or the match is saved.
// Debounced to 600ms to stay well inside OpenStreetMap's usage policy.
export default function AreaSearchBox({ onPick, dark }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('geocodeArea', { query: q });
        setResults(res?.data?.results || []);
      } catch (e) {
        console.error('Area search failed:', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => timer.current && clearTimeout(timer.current);
  }, [query]);

  const pick = (r) => {
    setQuery('');
    setResults([]);
    onPick(r);
  };

  return (
    <div className="absolute top-2 left-2 right-2 z-[1000]">
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 shadow-md ${
        dark ? 'bg-gray-800' : 'bg-white'
      }`}>
        {searching
          ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-gray-400" />
          : <Search className="w-4 h-4 flex-shrink-0 text-gray-400" />}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a city, zip, or place"
          className={`flex-1 bg-transparent text-sm outline-none min-w-0 ${
            dark ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
          }`}
        />
      </div>

      {results.length > 0 && (
        <div className={`mt-1 rounded-lg shadow-lg overflow-hidden max-h-40 overflow-y-auto ${
          dark ? 'bg-gray-800' : 'bg-white'
        }`}>
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(r)}
              className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 ${
                dark
                  ? 'text-gray-200 border-gray-700 hover:bg-gray-700'
                  : 'text-gray-700 border-gray-100 hover:bg-gray-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}