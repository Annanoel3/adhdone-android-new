// Bumping this replays every page tour once for everyone (existing users
// included), then it goes back to being one-time per page.
// Lives on its own so the sequencing gate can recognise a CURRENT-version
// completion without importing the tour component.
export const TOUR_VERSION = "v4";

export const seenKey = (page) => `tour_seen_${TOUR_VERSION}_${page}`;