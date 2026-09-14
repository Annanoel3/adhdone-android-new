// How much of a head start a user actually needs for a task that happens
// somewhere. A blanket "in about an hour, time to head out" is wrong in both
// directions — it's late for a 50-minute drive and it's an hour of pointless
// anxiety for a place 6 minutes away.
//
// Lead = driving time from the user's home zip to the task's location, measured
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
 * Returns null when we can't measure it (no location, no home zip, no API key,
 * or Google can't resolve the place) — callers then fall back to their default.
 *
 * `eventTimeISO` is when the user needs to arrive; it's used as the departure
 * time for the traffic prediction, so a 9 AM appointment is measured against
 * rush hour and an 8 PM one isn't.
 */
export async function getTravelLead(
  location: string,
  homeZip: string,
  eventTimeISO?: string,
): Promise<TravelLead | null> {
  const place = (location || '').trim();
  const zip = (homeZip || '').trim();
  if (!place || !zip) return null;

  let departureAt: Date | null = null;
  if (eventTimeISO) {
    const d = new Date(eventTimeISO);
    if (!isNaN(d.getTime())) departureAt = d;
  }

  try {
    const proximity = await getProximity([place], zip, departureAt);
    const drive = proximity.fromHome[place];
    if (!drive || !drive.minutes) return null;

    const raw = drive.minutes + CUSHION_MINUTES;
    const leadMinutes = Math.min(Math.ceil(raw / 5) * 5, MAX_LEAD_MINUTES);
    return { leadMinutes, driveMinutes: drive.minutes, inTraffic: !!drive.inTraffic };
  } catch (e) {
    console.error('[travelLead] lookup failed:', e);
    return null;
  }
}