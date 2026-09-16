import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, useMap, useMapEvents } from 'react-leaflet';
import AreaSearchBox from './AreaSearchBox';

// ~5 miles, as a TRUE geographic radius in meters — Leaflet's Circle is drawn in
// real-world units, so this covers exactly 5 miles at every zoom. The saved value
// is the exact CENTER, and every drive-time lookup measures from that point.
export const HOME_RADIUS_METERS = 8047;

// How much of the map's shorter side the circle fills. Below 1.0 so the edges
// always sit comfortably inside the viewport instead of touching them.
const FILL = 0.8;

// Web-Mercator resolution at the equator (metres per pixel at zoom 0).
const EQUATOR_M_PER_PX = 156543.03392;

// The circle can never clip or shrink to a dot, because the zoom is pinned to
// whatever value frames the real 5-mile circle at FILL of the viewport. Mercator
// scale changes with latitude and the container can be resized, so this is
// recomputed on pan, on resize, and once after layout settles.
//
// The result is a single locked zoom: positioning is by panning and the search
// box, and there is deliberately no zoom control, wheel zoom, or pinch zoom —
// any of them would break the "always fully framed" guarantee.
function FixedFrame() {
  const map = useMap();

  useEffect(() => {
    const apply = () => {
      const size = map.getSize();
      const minDim = Math.min(size.x, size.y);
      if (!minDim) return;
      const desiredMetersPerPx = (HOME_RADIUS_METERS * 2) / (minDim * FILL);
      const lat = map.getCenter().lat;
      const z = Math.log2(
        (EQUATOR_M_PER_PX * Math.cos((lat * Math.PI) / 180)) / desiredMetersPerPx
      );
      if (!Number.isFinite(z)) return;
      map.setMinZoom(z);
      map.setMaxZoom(z);
      // Guard against a setZoom → zoomend → setZoom loop on tiny float drift.
      if (Math.abs(map.getZoom() - z) > 0.01) map.setZoom(z);
    };

    apply();
    // Inside a dialog the container can be measured before it's laid out.
    const t = setTimeout(() => { map.invalidateSize(); apply(); }, 300);
    map.on('moveend', apply);
    map.on('resize', apply);
    return () => {
      clearTimeout(t);
      map.off('moveend', apply);
      map.off('resize', apply);
    };
  }, [map]);

  return null;
}

// The circle is pinned to the viewport center; dragging the map is how the
// user repositions it. No marker, no dot — just the soft area.
function CenterTracker({ onMove }) {
  const map = useMapEvents({ move: () => onMove(map.getCenter()) });
  return null;
}

// Moves the camera to a searched place, keeping the locked zoom. Search never
// writes anything — the user still places the circle themselves.
function SearchFlyTo({ dark, onMoved }) {
  const map = useMap();
  return (
    <AreaSearchBox
      dark={dark}
      onPick={(r) => {
        map.setView([r.lat, r.lng], map.getZoom());
        onMoved({ lat: r.lat, lng: r.lng });
      }}
    />
  );
}

export default function HomeAreaMap({ start, onCenterChange, dark }) {
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
        // Fractional zoom, so the frame can land exactly on the circle instead
        // of snapping to an integer level that clips it or shrinks it.
        zoomSnap={0}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FixedFrame />
        <CenterTracker onMove={handleMove} />
        <SearchFlyTo dark={dark} onMoved={handleMove} />
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