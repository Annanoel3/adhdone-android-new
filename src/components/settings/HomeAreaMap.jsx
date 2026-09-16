import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import AreaSearchBox from './AreaSearchBox';

// 2.5-mile radius — a circle 5 miles EDGE TO EDGE. Given as a true geographic
// radius in meters, so Leaflet draws it in real-world units and it spans the same
// 5 miles at every zoom. The saved value is the exact CENTER, and every drive-time
// lookup measures from that point.
export const HOME_RADIUS_METERS = 4023;

// How much of the map's shorter side the circle fills when zoomed all the way
// in. Below 1.0 so the edges always sit inside the viewport instead of touching
// them — this is the CLOSEST allowed zoom, so the circle can never clip.
const FILL = 0.8;

// How many zoom levels out the user may go for context. Each level halves the
// circle on screen, so 2 levels takes it from 80% of the view down to 20% —
// still clearly a circle, never a dot.
const ZOOM_OUT_LEVELS = 2;

// Web-Mercator resolution at the equator (metres per pixel at zoom 0).
const EQUATOR_M_PER_PX = 156543.03392;

// Zooming stays available, but only inside a range where the whole circle is
// always on screen: the closest zoom frames it at FILL of the viewport (so the
// edges can never leave the view) and the furthest is ZOOM_OUT_LEVELS out (so it
// can never shrink to a dot). Mercator scale changes with latitude and the
// container can be resized, so the range is recomputed on move, on resize, and
// once after layout settles.
function FrameZoomRange() {
  const map = useMap();

  useEffect(() => {
    let first = true;

    const apply = () => {
      const size = map.getSize();
      const minDim = Math.min(size.x, size.y);
      if (!minDim) return;
      const desiredMetersPerPx = (HOME_RADIUS_METERS * 2) / (minDim * FILL);
      const lat = map.getCenter().lat;
      const zIn = Math.log2(
        (EQUATOR_M_PER_PX * Math.cos((lat * Math.PI) / 180)) / desiredMetersPerPx
      );
      if (!Number.isFinite(zIn)) return;
      const zOut = zIn - ZOOM_OUT_LEVELS;

      map.setMinZoom(zOut);
      map.setMaxZoom(zIn);

      // Open at the closest zoom, then leave the user's chosen zoom alone —
      // only pull it back when it has drifted outside the safe range.
      const current = map.getZoom();
      if (first) {
        first = false;
        if (Math.abs(current - zIn) > 0.01) map.setZoom(zIn);
      } else if (current > zIn + 0.01) {
        map.setZoom(zIn);
      } else if (current < zOut - 0.01) {
        map.setZoom(zOut);
      }
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
        // Fractional zoom, so the frame can land exactly on the circle instead
        // of snapping to an integer level that clips it or shrinks it.
        zoomSnap={0}
        boxZoom={false}
        zoomControl={false}
      >
        {/* OpenStreetMap data served by CARTO. OSM's own tile servers refuse
            requests from apps (403 "Access blocked"), and both licences require
            the attribution line, so it stays on. */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_3nxd_1_128cb2348f7554073b3833f4"
          subdomains="abcd"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {/* Bottom-right so the buttons don't sit under the search box. */}
        <ZoomControl position="bottomright" />
        <FrameZoomRange />
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