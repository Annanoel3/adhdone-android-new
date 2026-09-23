// How much of a head start a user actually needs for a task that happens
// somewhere. A blanket "in about an hour, time to head out" is wrong in both
// directions — it's late for a 50-minute drive and it's an hour of pointless
// anxiety for a place 6 minutes away.
//
// Lead = driving time from the user's home circle center to the task's location, measured
// for the traffic predicted AT THE TIME THEY'D BE DRIVING, plus a small cushion
// for the getting-out-the-door part (finding keys, shoes, etc.). The cushion is
// deliberately small because the traffic itself is now accounted for.

import { getProximity } from './mapsDistance.ts';

const CUSHION_MINUTES = 10;
const MAX_LEAD_MINUTES = 180;

export interface TravelLead {
  leadMinutes: number;   // when to fire the "leave now" reminder
  driveMinutes: number;  // measured drive time, for the message text
  inTraffic: boolean;    // true when the drive time includes real traffic data
}

/**
 * Returns null when we can't measure it (no location, no home origin, no API key,
 * or Google can't resolve the place) — callers then fall back to their default.
 *
 * `eventTimeISO` is when the user needs to arrive; it's used as the departure
 * time for the traffic prediction, so a 9 AM appointment is measured against
 * rush hour and an 8 PM one isn't.
 */
export async function getTravelLead(
  location: string,
  // The user's home base: the exact "lat,lng" center of their home circle.
  homeOrigin: string,
  eventTimeISO?: string,
  // avoidTolls: the user said they don't take toll roads (Places page), so the
  // drive is measured on toll-free routes only.
  opts: { avoidTolls?: boolean } = {},
): Promise<TravelLead | null> {
  const place = (location || '').trim();
  const home = (homeOrigin || '').trim();
  if (!place || !home) return null;

  let departureAt: Date | null = null;
  if (eventTimeISO) {
    const d = new Date(eventTimeISO);
    if (!isNaN(d.getTime())) departureAt = d;
  }

  try {
    // Google's departure_time is when the car LEAVES. The arrival time is only
    // a first guess at that (measuring 9:00 traffic for a drive that starts at
    // 8:20 under-read rush hour — same bug as the commute watch), so once the
    // first pass says how long the drive is, measure again at the moment
    // they'd actually pull out, when that moment is still ahead.
    const routeOpts = { avoidTolls: opts.avoidTolls === true };
    const proximity = await getProximity([place], home, departureAt, routeOpts);
    let drive = proximity.fromHome[place];
    if (!drive || !drive.minutes) return null;
    if (departureAt) {
      const leaveAt = new Date(departureAt.getTime() - (drive.minutes + CUSHION_MINUTES) * 60000);
      if (leaveAt.getTime() > Date.now() + 2 * 60000) {
        const refined = (await getProximity([place], home, leaveAt, routeOpts)).fromHome[place];
        if (refined?.minutes) drive = refined;
      }
    }

    const raw = drive.minutes + CUSHION_MINUTES;
    const leadMinutes = Math.min(Math.ceil(raw / 5) * 5, MAX_LEAD_MINUTES);
    return { leadMinutes, driveMinutes: drive.minutes, inTraffic: !!drive.inTraffic };
  } catch (e) {
    console.error('[travelLead] lookup failed:', e);
    return null;
  }
}