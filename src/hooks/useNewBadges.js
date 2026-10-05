import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Red dots in the side menu: something new landed in the Parking Lot, or a new
// event worth recording showed up, since the person last opened that page.
// "Last opened" lives on the phone; a first run starts from now (no dot).
const NOTES_LABELS = ["night before · questions", "at the time · record notes"];
const KEYS = { ParkingLot: "badge_seen_parkinglot", Notes: "badge_seen_notes" };

function seenAt(page) {
  let v = localStorage.getItem(KEYS[page]);
  if (!v) { v = new Date().toISOString(); localStorage.setItem(KEYS[page], v); }
  return v;
}

export default function useNewBadges(currentPageName, enabled) {
  const [dots, setDots] = useState({ ParkingLot: false, Notes: false });

  const check = useCallback(async () => {
    if (!enabled) return;
    const ideas = await base44.entities.ParkingLotIdea.count({ created_date: { $gt: seenAt("ParkingLot") } }).catch(() => 0);
    const page = await base44.entities.Task.filter(
      { classification: "event", status: "active", created_date: { $gt: seenAt("Notes") } },
      { limit: 50, fields: ["reminder_schedule", "prep_questions"] }
    ).catch(() => ({ items: [] }));
    const meeting = (page?.items || []).some((t) =>
      (t.reminder_schedule || []).some((r) => NOTES_LABELS.includes(r?.label)) || (t.prep_questions || []).length > 0);
    setDots({ ParkingLot: ideas > 0, Notes: meeting });
  }, [enabled]);

  useEffect(() => {
    if (KEYS[currentPageName]) {
      localStorage.setItem(KEYS[currentPageName], new Date().toISOString());
      setDots((d) => ({ ...d, [currentPageName]: false }));
    }
    check();
  }, [currentPageName, check]);

  useEffect(() => {
    const later = () => setTimeout(check, 8000); // reminder plan lands a moment after creation
    window.addEventListener("parking-lot-changed", check);
    window.addEventListener("task-created", later);
    const every = setInterval(check, 60000);
    return () => {
      window.removeEventListener("parking-lot-changed", check);
      window.removeEventListener("task-created", later);
      clearInterval(every);
    };
  }, [check]);

  return dots;
}