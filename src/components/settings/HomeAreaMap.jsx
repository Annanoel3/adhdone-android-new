import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, useMapEvents } from 'react-leaflet';

// ~5 miles. Purely visual reassurance — the saved value is the exact CENTER,
// and every drive-time lookup measures from that precise point.
export const HOME_RADIUS_METERS = 8047;

// The circle is pinned to the viewport center; dragging the map is how the
// user repositions it. No marker, no dot — just the soft area.
function CenterTracker({ onMove }) {
  const map = useMapEvents({ move: () => onMove(map.getCenter()) });
  useEffect(() => {
    // Inside a dialog the container can be measured before it's laid out.
    const t = setTimeout(() => map.invalidateSize(), 300);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function HomeAreaMap({ start, onCenterChange }) {
  const [center, setCenter] = useState({ lat: start.lat, lng: start.lng });

  const handleMove = (c) => {
    const v = { lat: c.lat, lng: c.lng };
    setCenter(v);
    onCenterChange(v);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ height: 260 }}>
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={start.zoom ?? 10}
        style={{ height: '100%', width: '100%' }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CenterTracker onMove={handleMove} />
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