// The single place that decides what "home" means for distance math.
//
// Home is the CENTER of the ~5-mile circle the user placed on the map, stored
// as home_lat / home_lng. The circle's radius is visual reassurance only —
// every drive-time lookup measures from this exact point, never fuzzed.

export function getHomeOrigin(user: any): string {
  const lat = user?.home_lat;
  const lng = user?.home_lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat},${lng}`;
}