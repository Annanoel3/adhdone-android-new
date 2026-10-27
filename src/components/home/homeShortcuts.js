import {
  Mic, ListTodo, CalendarDays, Cake, Lightbulb, Timer, Shuffle, MapPin,
  MessageCircleHeart, TrendingUp, BookLock, Settings,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

// Home shortcuts (Anna, Oct 27 2026: "allow users to add more things to the
// home screen, right under Add Task and Timer — if someone uses Record Notes
// often, they can add a tile"). Every page from the menu can be a tile; the
// person picks which from the "Add a shortcut" link under the two fixed ones.
// Saved on the account (User.home_tiles) and on the phone, same rule as the
// task sort: the phone's own copy wins while it exists. The list is the whole
// row after Add: Timer is in it by default and can be taken out like any
// other tile (Anna, Oct 27 2026: "give them the ability to get rid of timer").
export const HOME_SHORTCUTS = [
  { key: "timer", title: "Timer", icon: Timer, builtin: true },
  { key: "notes", title: "Record Notes", icon: Mic, page: "Notes", needsRecorder: true },
  { key: "tasks", title: "My Tasks", icon: ListTodo, page: "Tasks" },
  { key: "calendar", title: "Calendar", icon: CalendarDays, page: "Calendar" },
  { key: "birthdays", title: "Birthdays", icon: Cake, page: "Birthdays" },
  { key: "parkinglot", title: "Parking Lot", icon: Lightbulb, page: "ParkingLot" },
  { key: "pomodoro", title: "Pomodoro", icon: Timer, page: "FocusTimer" },
  { key: "decisions", title: "Decision Maker", icon: Shuffle, page: "DecisionMaker" },
  { key: "places", title: "Places", icon: MapPin, page: "Places" },
  { key: "talk", title: "Talk It Out", icon: MessageCircleHeart, page: "SupportSpace" },
  { key: "insights", title: "Insights", icon: TrendingUp, page: "Progress" },
  { key: "diary", title: "Diary", icon: BookLock, page: "Diary" },
  { key: "settings", title: "Settings", icon: Settings, page: "Settings" },
];

const STORAGE_KEY = "home_tiles";
export const HOME_TILES_EVENT = "home-tiles-changed";
export const DEFAULT_TILES = ["timer"];
// Saved when Timer was taken off on purpose. A list with neither "timer" nor
// this was saved by the first version (published Oct 27 2026), when the list
// held only the ADDED tiles and Timer was fixed: Anna's own account had
// ["notes", "calendar"], and reading that as the whole row made Timer vanish
// from her Home. Such a list still means "Timer first, then these".
const TIMER_OFF = "-timer";

const known = (keys) =>
  (Array.isArray(keys) ? keys : []).filter((k) => HOME_SHORTCUTS.some((s) => s.key === k));

// Saved list → the row as shown (Timer in its place, or absent only when it
// was taken off on purpose).
const fromSaved = (saved) => {
  const list = Array.isArray(saved) ? saved : [];
  const explicit = list.includes("timer") || list.includes(TIMER_OFF);
  const shown = known(list);
  return explicit ? shown : ["timer", ...shown.filter((k) => k !== "timer")];
};

// The phone's copy, or the account's when the phone has none yet, or the
// default (just Timer) when neither has chosen anything.
export function readHomeTiles(user) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) return fromSaved(JSON.parse(raw));
  } catch { /* no storage */ }
  if (Array.isArray(user?.home_tiles)) return fromSaved(user.home_tiles);
  return [...DEFAULT_TILES];
}

export function saveHomeTiles(keys) {
  const clean = known(keys);
  const stored = clean.includes("timer") ? clean : [...clean, TIMER_OFF];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* no storage */ }
  base44.auth.updateMe({ home_tiles: stored }).catch(() => {});
  try { window.dispatchEvent(new CustomEvent(HOME_TILES_EVENT, { detail: clean })); } catch { /* ignore */ }
  return clean;
}
