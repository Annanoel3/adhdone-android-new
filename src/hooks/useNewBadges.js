import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Red dots in the side menu: something new landed in the Parking Lot, or new
// notes were made from a recording, since the person last had that page open.
// "Last had it open" lives on the phone; a first run starts from now (no dot).
//
// Record Notes (Anna, Nov 8 2026: "There really shouldn't be a red dot on
// there unless there are new notes that have been processed"): only a
// recording whose notes were made after that (EnergyLog.notes_made_at, set by
// transcribeAudioNew's notes_make and nothing else). From Oct 5 to Nov 8 2026
// it lit for any new calendar event worth recording, so a calendar sync
// bringing in appointments lit it with no notes to see.
//
// Parking Lot: a new idea, or a new entry in one of their trackers (Anna, Nov
// 9 2026: "Parking lot stopped having the red dot when something was added
// to it. I added it via photo from the home page"). A reading sent from Home
// is logged into the tracker it belongs to (captureToTasks), so no new idea
// is made and only the tracker's tracker_entries grow; those counted for
// nothing before.
//
// While a page is open, and when it's left, it counts as seen up to that
// moment: an idea typed on the Parking Lot, or notes that finish while Record
// Notes is open, never light that page's own dot.
const KEYS = { ParkingLot: "badge_seen_parkinglot", Notes: "badge_seen_notes" };

function seenAt(page) {
  let v = localStorage.getItem(KEYS[page]);
  if (!v) { v = new Date().toISOString(); localStorage.setItem(KEYS[page], v); }
  return v;
}

function markSeen(page) {
  if (KEYS[page]) localStorage.setItem(KEYS[page], new Date().toISOString());
}

// A tracker entry's time (written as an ISO time; a time with no zone is UTC).
const entryMs = (v) => {
  const s = String(v || "");
  return s ? Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : NaN;
};

export default function useNewBadges(currentPageName, enabled) {
  const [dots, setDots] = useState({ ParkingLot: false, Notes: false });
  const pageRef = useRef(currentPageName);
  pageRef.current = currentPageName;

  const check = useCallback(async () => {
    if (!enabled) return;
    markSeen(pageRef.current);
    // Only ideas that stay in the Parking Lot. Every capture is saved here
    // first and turned into tasks a few seconds later (converted_to_task), so
    // counting those lit the dot with nothing new to see (Anna, Oct 31 2026).
    // The last 20 seconds wait for the next check, so a capture still being
    // sorted doesn't flash it either.
    const settled = new Date(Date.now() - 20000).toISOString();
    const lotSeen = seenAt("ParkingLot");
    const [ideas, notes, trackers] = await Promise.all([
      base44.entities.ParkingLotIdea.count({
        created_date: { $gt: lotSeen, $lt: settled },
        converted_to_task: false,
      }).catch(() => 0),
      base44.entities.EnergyLog.count({
        kind: "note_recording",
        notes_made_at: { $gt: seenAt("Notes") },
      }).catch(() => 0),
      // Trackers changed since then; an entry logged after then is new.
      base44.entities.ParkingLotIdea.filter(
        { tracker: true, updated_date: { $gt: lotSeen } }, "-updated_date", 20
      ).catch(() => []),
    ]);
    const lotSeenMs = Date.parse(lotSeen);
    const newEntry = (trackers || []).some((t) =>
      (t?.tracker_entries || []).some((e) => entryMs(e?.at) > lotSeenMs));
    // The page they're on never shows its own dot.
    const here = pageRef.current;
    setDots({
      ParkingLot: (ideas > 0 || newEntry) && here !== "ParkingLot",
      Notes: notes > 0 && here !== "Notes",
    });
  }, [enabled]);

  useEffect(() => {
    if (KEYS[currentPageName]) {
      markSeen(currentPageName);
      setDots((d) => ({ ...d, [currentPageName]: false }));
    }
    check();
    // Leaving the page: everything on it up to now was seen.
    return () => markSeen(currentPageName);
  }, [currentPageName, check]);

  useEffect(() => {
    const later = () => setTimeout(check, 8000);
    const settle = () => setTimeout(check, 25000); // past the 20-second wait above
    window.addEventListener("parking-lot-changed", check);
    window.addEventListener("parking-lot-changed", settle);
    window.addEventListener("task-created", later);
    const every = setInterval(check, 60000);
    return () => {
      window.removeEventListener("parking-lot-changed", check);
      window.removeEventListener("parking-lot-changed", settle);
      window.removeEventListener("task-created", later);
      clearInterval(every);
    };
  }, [check]);

  return dots;
}
