import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, useMap, useMapEvents } from 'react-leaflet';
import AreaSearchBox from './AreaSearchBox';

// ~5 miles. Purely visual reassurance — the saved value is the exact CENTER,
// and every drive-time lookup measures from that precise point.
export const HOME_RADIUS_METERS = 8047;

// Below this zoom the 5-mile circle is a speck on a continent-wide view, so a
// save could be a hundred miles off the user's actual area. Save stays blocked
// until they're at least this close. At zoom 10 the circle is over half the
// map's height — impossible to misread.
export const MIN_SAVE_ZOOM = 10;

// The circle is pinned to the viewport center; dragging the map is how the
// user repositions it. No marker, no dot — just the soft area.
function CenterTracker({ onMove, onZoom }) {
  const map = useMapEvents({
    move: () => onMove(map.getCenter()),
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    // Inside a dialog the container can be measured before it's laid out.
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// Moves the camera to a searched place. Search never writes anything — it only
// flies the view there, and the user still places the circle themselves.
function SearchFlyTo({ dark, onMoved }) {
  const map = useMap();
  return (
    <AreaSearchBox
      dark={dark}
      onPick={(r) => {
        map.setView([r.lat, r.lng], Math.max(r.zoom, MIN_SAVE_ZOOM));
        onMoved({ lat: r.lat, lng: r.lng }, Math.max(r.zoom, MIN_SAVE_ZOOM));
      }}
    />
  );
}

export default function HomeAreaMap({ start, onCenterChange, onZoomChange, dark }) {
  const [center, setCenter] = useState({ lat: start.lat, lng: start.lng });

  const handleMove = (c) => {
    const v = { lat: c.lat, lng: c.lng };
    setCenter(v);
    onCenterChange(v);
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 260 }}>
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={start.zoom ?? 10}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CenterTracker onMove={handleMove} onZoom={onZoomChange} />
        <SearchFlyTo
          dark={dark}
          onMoved={(c, z) => { handleMove(c); onZoomChange(z); }}
        />
        <Circle
          center={[center.lat, center.lng]}
          radius={HOME_RADIUS_METERS}
          interactive={false}
          pathOptions={{ color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 0.18 }}
        />
      </MapContainer>
    </div>
  );
}