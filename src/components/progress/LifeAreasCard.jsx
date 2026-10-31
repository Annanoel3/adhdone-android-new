import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import {
  Briefcase,
  Home,
  HeartPulse,
  Users,
  Wallet,
  ShoppingBag,
  Sparkles,
  PawPrint,
  Shapes,
  Loader2,
} from "lucide-react";

// "Your last month went to 5 areas of life": bubbles sized by how much of what
// happened in the window went to each area of life. The area is
// Task.life_category, set by the sortLifeAreas function (the model's judgment,
// gpt-6-astra). Anything in the window that isn't sorted yet is sent to it once,
// and the card recounts when it's done.
//
// Props: days = the Insights window in days (7, 30, 365), or null for all
// time; theme = the page's theme, like HabitPatterns.

const AREAS = {
  work: { label: "Work", Icon: Briefcase },
  home: { label: "Home", Icon: Home },
  health: { label: "Health", Icon: HeartPulse },
  family_friends: { label: "Family & friends", Icon: Users },
  money: { label: "Money", Icon: Wallet },
  errands: { label: "Errands", Icon: ShoppingBag },
  self_care: { label: "Self-care", Icon: Sparkles },
  pets: { label: "Pets", Icon: PawPrint },
};
const AREA_KEYS = Object.keys(AREAS);

const DAY_MS = 24 * 60 * 60 * 1000;
const SORT_MAX_DAYS = 90; // the most sortLifeAreas looks back
const MIN_ITEMS = 3;
const FIELDS = ["id", "status", "completed_at", "classification", "event_time", "birthday_person", "next_reminder", "due_date", "life_category"];

const ms = (iso) => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
};

// When a birthday's day was, the last time it came round: next_reminder is the
// birthday, and it rolls over to next year once the day is past.
function birthdayDayMs(t, nowMs) {
  const at = ms(t?.next_reminder || t?.due_date || t?.event_time);
  if (!Number.isFinite(at)) return NaN;
  const d = new Date(at);
  for (let i = 0; i < 3 && d.getTime() > nowMs; i++) d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.getTime();
}

// Did this task "happen" in the window? Finished in it (steps too), an event
// that took place in it, or a birthday that fell in it. The same rule as
// happenedAt in base44/functions/sortLifeAreas: change both together.
function happened(t, sinceMs, nowMs) {
  if (!t || t.status === "cancelled") return false;
  const inRange = (x) => Number.isFinite(x) && x >= sinceMs && x <= nowMs;
  if (t.status === "completed" && inRange(ms(t.completed_at))) return true;
  if (t.classification === "event" && inRange(ms(t.event_time))) return true;
  if (t.birthday_person && inRange(birthdayDayMs(t, nowMs))) return true;
  return false;
}

async function loadCounts(days) {
  const nowMs = Date.now();
  const sinceMs = days ? nowMs - days * DAY_MS : -Infinity;
  const nowIso = new Date(nowMs).toISOString();
  const sinceIso = days ? new Date(sinceMs).toISOString() : null;
  const Task = base44.entities.Task;
  const [done, events, birthdays] = await Promise.all([
    Task.filter(sinceIso ? { status: "completed", completed_at: { $gte: sinceIso } } : { status: "completed" }, "-completed_at", 2000, 0, FIELDS),
    Task.filter({ classification: "event", event_time: sinceIso ? { $gte: sinceIso, $lte: nowIso } : { $lte: nowIso } }, "-event_time", 1000, 0, FIELDS).catch(() => []),
    Task.filter({ birthday_person: { $nin: [null, ""] } }, "-created_date", 1000, 0, FIELDS).catch(() => []),
  ]);
  const byId = new Map();
  [...(done || []), ...(events || []), ...(birthdays || [])].forEach((t) => {
    if (t?.id && !byId.has(t.id)) byId.set(t.id, t);
  });
  const byArea = {};
  let total = 0;
  let sorted = 0;
  byId.forEach((t) => {
    if (!happened(t, sinceMs, nowMs)) return;
    total++;
    if (AREAS[t.life_category]) {
      sorted++;
      byArea[t.life_category] = (byArea[t.life_category] || 0) + 1;
    }
  });
  return { days, total, sorted, unsorted: total - sorted, byArea };
}

// One sort call at a time, and at most one per window per app session, so the
// card can never loop on tasks the model couldn't place.
const sortTried = new Set();
let sortInFlight = null;
const sortPending = (days) => !!sortInFlight || !sortTried.has(days);
async function sortOnce(days) {
  while (sortInFlight) {
    try { await sortInFlight; } catch (e) { /* what's sorted still shows */ }
  }
  if (sortTried.has(days)) return;
  sortTried.add(days);
  sortInFlight = base44.functions.invoke("sortLifeAreas", { days }).finally(() => { sortInFlight = null; });
  await sortInFlight;
}

// Circles packed around the biggest, largest first: each one goes to the free
// spot touching the ones already placed that sits closest to the middle
// (stretched to the box's shape). No randomness, so the same numbers always
// draw the same picture, and no two circles overlap.
function packCircles(radii, wide) {
  const gap = radii[0] * 0.05;
  const placed = [];
  radii.forEach((r, n) => {
    if (n === 0) { placed.push({ x: 0, y: 0, r }); return; }
    let best = null;
    const consider = (x, y) => {
      for (const p of placed) {
        const need = p.r + r + gap - 1e-6;
        if ((x - p.x) ** 2 + (y - p.y) ** 2 < need * need) return;
      }
      const cost = (x * x) / (wide * wide) + y * y;
      if (!best || cost < best.cost - 1e-9) best = { x, y, cost };
    };
    placed.forEach((p) => {
      const d = p.r + r + gap;
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        consider(p.x + d * Math.cos(a), p.y + d * Math.sin(a));
      }
    });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const A = placed[i];
        const B = placed[j];
        const ra = A.r + r + gap;
        const rb = B.r + r + gap;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy);
        if (d === 0 || d > ra + rb || d < Math.abs(ra - rb)) continue;
        const a = (ra * ra - rb * rb + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, ra * ra - a * a));
        const mx = A.x + (a * dx) / d;
        const my = A.y + (a * dy) / d;
        consider(mx + (h * dy) / d, my - (h * dx) / d);
        consider(mx - (h * dy) / d, my + (h * dx) / d);
      }
    }
    if (!best) {
      const right = Math.max(...placed.map((p) => p.x + p.r));
      best = { x: right + gap + r, y: 0 };
    }
    placed.push({ x: best.x, y: best.y, r });
  });
  return placed;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function layoutBubbles(byArea, width) {
  const items = AREA_KEYS
    .filter((k) => (byArea[k] || 0) > 0)
    .map((k) => ({ key: k, count: byArea[k] }))
    .sort((a, b) => b.count - a.count || AREA_KEYS.indexOf(a.key) - AREA_KEYS.indexOf(b.key));
  const sum = items.reduce((s, it) => s + it.count, 0);
  if (!sum || width <= 0) return { bubbles: [], height: 0 };
  const maxH = clamp(Math.round(width * 0.85), 200, 300);
  // Area follows the share (radius ∝ √share). A very small share gets a
  // floor so its icon still fits.
  const top = items[0].count / sum;
  const radii = items.map((it) => 100 * Math.max(Math.sqrt(it.count / sum / top), 0.18));
  const placed = packCircles(radii, width / maxH);
  const minX = Math.min(...placed.map((p) => p.x - p.r));
  const maxX = Math.max(...placed.map((p) => p.x + p.r));
  const minY = Math.min(...placed.map((p) => p.y - p.r));
  const maxY = Math.max(...placed.map((p) => p.y + p.r));
  const s = Math.min(width / (maxX - minX), maxH / (maxY - minY));
  const offX = (width - (maxX - minX) * s) / 2;
  const bubbles = items.map((it, i) => {
    const p = placed[i];
    const share = it.count / sum;
    const pct = Math.round(share * 100);
    return {
      ...it,
      share,
      pctLabel: pct < 1 ? "<1%" : `${pct}%`,
      size: 2 * p.r * s,
      left: (p.x - p.r - minX) * s + offX,
      top: (p.y - p.r - minY) * s,
    };
  });
  return { bubbles, height: (maxY - minY) * s };
}

function titleFor(days, n) {
  const what = `${n} ${n === 1 ? "area" : "areas"} of life`;
  if (days == null) return `So far, your time went to ${what}`;
  const span = days === 7 ? "week" : days === 30 ? "month" : days === 365 ? "year" : `${days} days`;
  return `Your last ${span} went to ${what}`;
}

export default function LifeAreasCard({ days = null, theme = "minimalist" }) {
  const [counts, setCounts] = useState(null);
  const [sorting, setSorting] = useState(false);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef(null);
  const [width, setWidth] = useState(300);
  const dark = theme === "dark";

  useEffect(() => {
    let alive = true;
    setSorting(false);
    setFailed(false);
    (async () => {
      let c;
      try {
        c = await loadCounts(days);
      } catch (e) {
        return; // keeps whatever was showing; nothing shows if it never loaded
      }
      if (!alive) return;
      setCounts(c);
      if (c.unsorted === 0 || c.total < MIN_ITEMS) return;
      const sortDays = days == null ? SORT_MAX_DAYS : Math.min(days, SORT_MAX_DAYS);
      if (!sortPending(sortDays)) return;
      setSorting(true);
      let ok = true;
      try {
        await sortOnce(sortDays);
      } catch (e) {
        ok = false;
      }
      if (!alive) return;
      try {
        const again = await loadCounts(days);
        if (alive) setCounts(again);
      } catch (e) { /* keep the first count */ }
      if (!alive) return;
      setSorting(false);
      setFailed(!ok);
    })();
    return () => { alive = false; };
  }, [days]);

  const loaded = counts !== null;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) >= 4 ? w : prev));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const layout = useMemo(
    () => (counts ? layoutBubbles(counts.byArea, width) : { bubbles: [], height: 0 }),
    [counts, width]
  );

  if (!counts) return null;

  const enough = counts.total >= MIN_ITEMS;
  const showBubbles = enough && counts.sorted >= MIN_ITEMS;
  const areaCount = layout.bubbles.length;
  const muted = dark ? "text-gray-300" : "text-gray-600";
  const neutral = dark ? "bg-white/10 border border-white/10" : "bg-gray-100 border border-gray-200";
  const unnamed = layout.bubbles.filter((b) => b.share < 0.06 || b.size < 84);

  return (
    <Card className="border-none shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-start gap-2 leading-snug">
          <Shapes className="w-5 h-5 flex-shrink-0 mt-0.5" />
          {showBubbles ? titleFor(counts.days, areaCount) : "Areas of life"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={boxRef} className="w-full">
          {!enough && (
            <p className={`text-sm ${muted}`}>Check off a few things to see where your time goes.</p>
          )}

          {enough && !showBubbles && sorting && (
            <p className={`text-sm flex items-center gap-2 ${muted}`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sorting your tasks…
            </p>
          )}

          {enough && !showBubbles && !sorting && (
            <p className={`text-sm ${muted}`}>
              {failed || counts.unsorted > 0 ? "Couldn't sort your tasks yet. Check back later." : "Check off a few things to see where your time goes."}
            </p>
          )}

          {showBubbles && (
            <div className="relative w-full" style={{ height: layout.height }} role="list" aria-label="Areas of life">
              {layout.bubbles.map((b, i) => {
                const { label, Icon } = AREAS[b.key];
                const biggest = i === 0;
                const showName = b.share >= 0.06 && b.size >= 84;
                const showPct = b.share >= 0.06 && b.size >= 44;
                const iconPx = clamp(b.size * (showName ? 0.2 : showPct ? 0.3 : 0.45), 12, 28);
                return (
                  <div
                    key={b.key}
                    role="listitem"
                    aria-label={`${label}, ${b.pctLabel}`}
                    title={`${label} ${b.pctLabel}`}
                    className={`absolute rounded-full flex flex-col items-center justify-center text-center overflow-hidden transition-all duration-500 motion-reduce:transition-none ${
                      biggest ? "bg-purple-600 text-white shadow-md" : neutral
                    }`}
                    style={{ left: b.left, top: b.top, width: b.size, height: b.size }}
                  >
                    <Icon
                      className={biggest ? "text-white" : dark ? "text-gray-300" : "text-gray-500"}
                      style={{ width: iconPx, height: iconPx }}
                      aria-hidden="true"
                    />
                    {showName && (
                      <span
                        className={`font-medium leading-tight mt-0.5 px-1 ${biggest ? "text-white" : dark ? "text-gray-200" : "text-gray-700"}`}
                        style={{ fontSize: clamp(b.size * 0.11, 10, 14), maxWidth: b.size * 0.8 }}
                      >
                        {label}
                      </span>
                    )}
                    {showPct && (
                      <span
                        className={`font-bold leading-none mt-0.5 ${biggest ? "text-white" : dark ? "text-white" : "text-gray-900"}`}
                        style={{ fontSize: clamp(b.size * (showName ? 0.15 : 0.22), 11, 22) }}
                      >
                        {b.pctLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showBubbles && unnamed.length > 0 && (
          <div className={`flex flex-wrap gap-x-3 gap-y-1 text-xs ${muted}`}>
            {unnamed.map((b) => {
              const { label, Icon } = AREAS[b.key];
              return (
                <span key={b.key} className="inline-flex items-center gap-1">
                  <Icon className="w-3 h-3" aria-hidden="true" />
                  {label} {b.pctLabel}
                </span>
              );
            })}
          </div>
        )}

        {showBubbles && sorting && (
          <p className={`text-xs flex items-center gap-1.5 ${muted}`}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Sorting your tasks…
          </p>
        )}

        {showBubbles && !sorting && counts.unsorted > 0 && (
          <p className={`text-xs ${muted}`}>Based on {counts.sorted} of {counts.total} so far.</p>
        )}
      </CardContent>
    </Card>
  );
}
