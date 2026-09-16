import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import HomeAreaMap, { MIN_SAVE_ZOOM } from './HomeAreaMap';
import useApproxCenter from './useApproxCenter';
import { base44 } from '@/api/base44Client';

// Shared home-base editor: a map with a soft ~5-mile circle the user drags
// over their general area. The circle's CENTER is what gets saved, and it's the
// exact origin for every drive-time / "leave now" calculation.
export default function HomeBaseFields({ user, theme, onSaved, compact = false }) {
  const hasHome = user?.home_lat != null && user?.home_lng != null;
  const [editing, setEditing] = useState(false);
  const [center, setCenter] = useState(null);
  const [saving, setSaving] = useState(false);
  const showMap = editing || !hasHome;
  const start = useApproxCenter(user, showMap);
  // Zoom guard: a save from a continent-wide view could be 100+ miles off, so
  // Save stays disabled until the circle is actually meaningful on screen.
  const [zoom, setZoom] = useState(null);
  const effectiveZoom = zoom ?? start?.zoom ?? MIN_SAVE_ZOOM;
  const tooFarOut = effectiveZoom < MIN_SAVE_ZOOM;

  const dark = theme === 'dark';

  const save = async () => {
    const c = center || (start && { lat: start.lat, lng: start.lng });
    if (!c || tooFarOut) return;
    setSaving(true);
    try {
      await base44.auth.updateMe({ home_lat: c.lat, home_lng: c.lng });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      console.error('Failed to save home base:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!showMap) {
    return (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        dark ? 'bg-gray-700 text-gray-100' : 'bg-teal-50 text-gray-800'
      }`}>
        <Check className="w-4 h-4 flex-shrink-0 text-teal-600" />
        <span className="flex-1">Home area set</span>
        <button type="button" onClick={() => setEditing(true)} className="text-xs underline flex-shrink-0">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
        Drag the map so the circle covers roughly where you live, or search for your city to get
        there fast. No exact address needed.
      </p>
      {start ? (
        <HomeAreaMap
          start={start}
          onCenterChange={setCenter}
          onZoomChange={setZoom}
          dark={dark}
        />
      ) : (
        <div className={`h-[260px] rounded-xl flex items-center justify-center text-sm ${
          dark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'
        }`}>
          Finding your general area…
        </div>
      )}
      {start && tooFarOut && (
        <p className={`text-xs ${dark ? 'text-amber-400' : 'text-amber-600'}`}>
          Zoom in to your area first
        </p>
      )}
      <div className="flex gap-2">
        {hasHome && (
          <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
        )}
        <Button
          onClick={save}
          disabled={saving || !start || tooFarOut}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          {saving ? 'Saving...' : compact ? 'Save' : 'Save home area'}
        </Button>
      </div>
    </div>
  );
}