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
// Something shared into the app from outside it (Anna, Nov 18 2026: "When
// someone adds something that belongs in the parking lot from sharing a
// picture or text ... make sure the red dot appears on parking lot in the
// menu"). The phone sends a share straight to the server and the app is never
// told an idea was made, so the dot used to wait for the once-a-minute look,
// and for longer than that when the app had been off screen. Now it looks the
// moment the phone says a capture landed (WidgetTaskSync's "capture-landed":
// the server has finished sorting it by then, so it counts at once), whenever
// the app comes back on screen, and once more when an idea too new to count
// has settled.
//
// While a page is open, and when it's left, it counts as seen up to that
// moment: an idea typed on the Parking Lot, or notes that finish while Record
// Notes is open, never light that page's own dot.
const KEYS = { ParkingLot: "badge_seen_parkinglot", Notes: "badge_seen_notes" };
// How long a brand-new idea waits before it counts (see check).
const SETTLE_MS = 20000;
// A capture that landed from outside the app counts at once. Its time is the
// server's and "now" is the phone's, and a phone's clock can run a little
// behind, so "at once" reaches this far past the phone's now.
const LANDED_SLACK_MS = 30000;

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
  // The newest look wins: an older one that answers late is dropped.
  const lookRef = useRef(0);
  // The one extra look booked for when a brand-new idea has settled.
  const againRef = useRef(null);
  // When a capture from outside the app last landed. The server had finished
  // sorting it by then, so nothing made before that moment is still settling.
  const landedRef = useRef(0);

  const check = useCallback(async () => {
    if (!enabled) return;
    const look = ++lookRef.current;
    markSeen(pageRef.current);
    // Only ideas that stay in the Parking Lot. Every capture is saved here
    // first and turned into tasks a few seconds later (converted_to_task), so
    // counting those lit the dot with nothing new to see (Anna, Oct 31 2026).
    // The last 20 seconds wait for the next check, so a capture still being
    // sorted doesn't flash it either.
    const settled = new Date(Math.max(Date.now() - SETTLE_MS, landedRef.current)).toISOString();
    const lotSeen = seenAt("ParkingLot");
    const [ideas, settling, notes, trackers] = await Promise.all([
      base44.entities.ParkingLotIdea.count({
        created_date: { $gt: lotSeen, $lt: settled },
        converted_to_task: false,
      }).catch(() => 0),
      // Too new to count yet: looked at again below, once they have settled.
      base44.entities.ParkingLotIdea.count({
        created_date: { $gte: lotSeen > settled ? lotSeen : settled },
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
    if (look !== lookRef.current) return;
    const lotSeenMs = Date.parse(lotSeen);
    const newEntry = (trackers || []).some((t) =>
      (t?.tracker_entries || []).some((e) => entryMs(e?.at) > lotSeenMs));
    // The page they're on never shows its own dot.
    const here = pageRef.current;
    setDots({
      ParkingLot: (ideas > 0 || newEntry) && here !== "ParkingLot",
      Notes: notes > 0 && here !== "Notes",
    });
    clearTimeout(againRef.current);
    againRef.current = settling > 0 ? setTimeout(check, SETTLE_MS + 2000) : null;
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
    const settle = () => setTimeout(check, SETTLE_MS + 5000); // past the wait above
    // A capture from outside the app just landed, already sorted by the server.
    const landed = () => { landedRef.current = Date.now() + LANDED_SLACK_MS; check(); };
    // Back on screen: whatever was shared while it was away shows now.
    const shown = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("parking-lot-changed", check);
    window.addEventListener("parking-lot-changed", settle);
    window.addEventListener("capture-landed", landed);
    window.addEventListener("task-created", later);
    document.addEventListener("visibilitychange", shown);
    const every = setInterval(check, 60000);
    return () => {
      window.removeEventListener("parking-lot-changed", check);
      window.removeEventListener("parking-lot-changed", settle);
      window.removeEventListener("capture-landed", landed);
      window.removeEventListener("task-created", later);
      document.removeEventListener("visibilitychange", shown);
      clearInterval(every);
      clearTimeout(againRef.current);
    };
  }, [check]);

  return dots;
}
