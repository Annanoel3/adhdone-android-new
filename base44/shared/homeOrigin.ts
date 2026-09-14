// The single place that decides what "home" means for distance math.
//
// A zip code is a big area — some are 20+ miles across — and Google measures
// from its center point. For someone living at the far edge that's an easy
// 10-15 minute error in the wrong direction, which turns a "leave now" reminder
// into being late. So a saved full street address always wins; the zip is only
// the fallback for users who'd rather not hand over an address.

export function getHomeOrigin(user: any): string {
  return (user?.home_address || '').trim() || (user?.home_zipcode || '').trim();
}

// True when the origin is only a zip code, i.e. the drive time is approximate.
export function isApproximateOrigin(user: any): boolean {
  return !(user?.home_address || '').trim() && !!(user?.home_zipcode || '').trim();
}