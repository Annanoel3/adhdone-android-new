import { useEffect, useState } from 'react';

// Where to open the home-area map: the saved center if there is one, else a
// one-shot device position (only to CENTER the map — never stored), else a
// zoomed-out view of the US so the user can drag to their region.
const FALLBACK = { lat: 39.5, lng: -98.35, zoom: 4 };

export default function useApproxCenter(user, enabled) {
  const [start, setStart] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    if (user?.home_lat != null && user?.home_lng != null) {
      setStart({ lat: user.home_lat, lng: user.home_lng, zoom: 10 });
      return;
    }
    if (!navigator.geolocation) {
      setStart(FALLBACK);
      return;
    }
    let done = false;
    const finish = (v) => { if (!done) { done = true; setStart(v); } };
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 10 }),
      () => finish(FALLBACK),
      { timeout: 6000, maximumAge: 600000 }
    );
    const t = setTimeout(() => finish(FALLBACK), 7000);
    return () => clearTimeout(t);
  }, [user?.home_lat, user?.home_lng, enabled]);

  return start;
}