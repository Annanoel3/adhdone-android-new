import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { winLook } from "@/components/wins/winsTheme";
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
// happened in the window went to each area of life. The card reads no tasks:
// the sortLifeAreas function sorts anything new in the window (the model's
// judgment, gpt-6-astra, kept in TaskLifeArea, which only the server reads)
// and answers with the counts.
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

const MIN_ITEMS = 3;
// Bubble labels: under 6% (or too small to read) shows only its icon, and its
// name and % go in the line under the bubbles instead.
const SMALL_SHARE = 0.06;
const NAME_MIN_PX = 70;
const PCT_MIN_PX = 44;

// One sortLifeAreas call per window: it sorts what's new and counts the
// window. Its answer (or its failure) is reused for ANSWER_KEEP_MS, so
// switching windows or coming back to the page never calls again and nothing
// can loop; after that the next visit asks again, since the phone app can stay
// open for days and the counts would go stale. Calls go one at a time, so two
// windows never send the same tasks to the model at once.
const ANSWER_KEEP_MS = 15 * 60 * 1000;
const answers = new Map();
let queue = Promise.resolve();
const windowKey = (days) => (days == null ? "all" : String(days));
function areasFor(days) {
  const key = windowKey(days);
  const kept = answers.get(key);
  if (kept && Date.now() - kept.at < ANSWER_KEEP_MS) return kept.run;
  const run = queue
    .then(() => base44.functions.invoke("sortLifeAreas", { days: days == null ? null : days }))
    .then((res) => {
      const data = res?.data ?? res;
      if (!data || !data.counts || typeof data.total !== "number") throw new Error("No counts");
      return data;
    });
  queue = run.catch(() => {});
  answers.set(key, { at: Date.now(), run });
  return run;
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
  // The biggest bubble tops out around 210px, so one or two areas don't fill
  // the whole card.
  const s = Math.min(width / (maxX - minX), maxH / (maxY - minY), 1.05);
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

// "Today", "Yesterday", "Tuesday" (this week), "Oct 27", "Oct 27, 2025".
function whenLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

function titleFor(days, n) {
  const what = `${n} ${n === 1 ? "area" : "areas"} of life`;
  if (days == null) return `So far, your time went to ${what}`;
  const span = days === 7 ? "week" : days === 30 ? "month" : days === 365 ? "year" : `${days} days`;
  return `Your last ${span} went to ${what}`;
}

export default function LifeAreasCard({ days = null, theme = "minimalist" }) {
  // The answer for the window on screen: { key, data } once it's in, error
  // when the call failed.
  const [answer, setAnswer] = useState({ key: null, data: null, error: false });
  const boxRef = useRef(null);
  const [width, setWidth] = useState(300);
  // The area whose newest tasks are open (tapping a bubble), or null.
  const [openArea, setOpenArea] = useState(null);
  const dark = theme === "dark";
  const look = winLook(theme);
  const key = windowKey(days);

  useEffect(() => {
    let alive = true;
    areasFor(days).then(
      (data) => { if (alive) setAnswer({ key, data, error: false }); },
      () => { if (alive) setAnswer({ key, data: null, error: true }); }
    );
    return () => { alive = false; };
  }, [days, key]);

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
  }, []);

  // Only an answer for the window on screen counts; while the next one loads,
  // the card says it's sorting rather than showing the last window's bubbles.
  const current = answer.key === key ? answer : { data: null, error: false };
  const data = current.data;
  const layout = useMemo(
    () => (data ? layoutBubbles(data.counts, width) : { bubbles: [], height: 0 }),
    [data, width]
  );

  const loading = !data && !current.error;
  // Everything that happened in the window, sorted or not.
  const happened = data ? data.total + (data.remaining || 0) : 0;
  const enough = happened >= MIN_ITEMS;
  const showBubbles = !!data && enough && data.total >= MIN_ITEMS;
  const areaCount = layout.bubbles.length;
  const muted = dark ? "text-gray-300" : "text-gray-600";
  const neutral = dark ? "bg-white/10 border border-white/10" : "bg-gray-100 border border-gray-200";
  const unnamed = layout.bubbles.filter((b) => b.share < SMALL_SHARE || b.size < NAME_MIN_PX);

  return (
    <Card className="border-none shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-start gap-2 leading-snug">
          <Shapes className="w-5 h-5 flex-shrink-0 mt-0.5" />
          {showBubbles ? titleFor(days, areaCount) : "Areas of life"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={boxRef} className="w-full">
          {loading && (
            <p className={`text-sm flex items-center gap-2 ${muted}`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sorting your tasks…
            </p>
          )}

          {data && !enough && (
            <p className={`text-sm ${muted}`}>Check off a few things to see where your time goes.</p>
          )}

          {/* The call failed, or enough happened but under 3 got an area. */}
          {(current.error || (data && enough && !showBubbles)) && (
            <p className={`text-sm ${muted}`}>Couldn&apos;t sort your tasks yet. Check back later.</p>
          )}

          {showBubbles && (
            <div className="relative w-full" style={{ height: layout.height }} role="list" aria-label="Areas of life">
              {layout.bubbles.map((b, i) => {
                const { label, Icon } = AREAS[b.key];
                const biggest = i === 0;
                const showName = b.share >= SMALL_SHARE && b.size >= NAME_MIN_PX;
                const showPct = b.share >= SMALL_SHARE && b.size >= PCT_MIN_PX;
                const iconPx = clamp(b.size * (showName ? 0.2 : showPct ? 0.3 : 0.45), 12, 28);
                return (
                  <button
                    type="button"
                    key={b.key}
                    role="listitem"
                    onClick={() => setOpenArea(b.key)}
                    aria-label={`${label}, ${b.pctLabel}. Show recent tasks`}
                    title={`${label} ${b.pctLabel}`}
                    className={`absolute rounded-full flex flex-col items-center justify-center text-center overflow-hidden transition-all duration-500 motion-reduce:transition-none cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
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
                        style={{ fontSize: clamp(b.size * 0.12, 10, 14), maxWidth: b.size * 0.8 }}
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
                  </button>
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
                <button
                  type="button"
                  key={b.key}
                  onClick={() => setOpenArea(b.key)}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  <Icon className="w-3 h-3" aria-hidden="true" />
                  {label} {b.pctLabel}
                </button>
              );
            })}
          </div>
        )}

        {showBubbles && data.remaining > 0 && (
          <p className={`text-xs ${muted}`}>Sorted {data.total} of {happened} so far.</p>
        )}
        {showBubbles && (
          <p className={`text-xs ${muted}`}>Tap a bubble to see what went there.</p>
        )}
      </CardContent>

      <AreaRecentDialog
        area={openArea}
        days={days}
        data={data}
        look={look}
        onClose={() => setOpenArea(null)}
      />
    </Card>
  );
}

// The newest tasks in one area, opened by tapping its bubble.
function AreaRecentDialog({ area, days, data, look, onClose }) {
  const span = days == null ? "so far"
    : days === 7 ? "in your last week"
    : days === 30 ? "in your last month"
    : days === 365 ? "in your last year"
    : `in your last ${days} days`;
  const info = area ? AREAS[area] : null;
  const count = area && data?.counts ? data.counts[area] || 0 : 0;
  const items = area && data?.recent && Array.isArray(data.recent[area]) ? data.recent[area] : [];
  const Icon = info?.Icon;
  return (
    <Dialog open={!!area} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`max-w-sm w-[calc(100vw-2rem)] ${look.surface}`}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
            {info?.label}
          </DialogTitle>
          <DialogDescription className={look.muted}>
            {count} {count === 1 ? "thing" : "things"} {span}{items.length ? ". The most recent:" : "."}
          </DialogDescription>
        </DialogHeader>
        {items.length > 0 ? (
          <ul className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {items.map((it, i) => (
              <li key={`${it.at}-${i}`} className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium break-words min-w-0">{it.title}</span>
                <span className={`text-xs flex-shrink-0 ${look.muted}`}>{whenLabel(it.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-sm ${look.muted}`}>Nothing to show here yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
