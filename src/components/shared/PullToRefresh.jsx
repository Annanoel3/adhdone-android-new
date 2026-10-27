import React, { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { showEggBadge } from "../eastereggs/eggBadge";

const THRESHOLD = 70;   // pull this far to refresh
// The over-pull egg. It used to fire at 115 of the scaled pull (230 px of
// finger), which an ordinary thumb-flick on a tall phone passes every time:
// Tabitha saw it six times in two weeks, and Anna (Oct 27 2026) "even when
// doing a normal refresh". Now it takes a real drag, most of the screen's
// height of finger travel, and shows at most once a day.
const EGG_FINGER_PX = 520;
const EGG_DAY_KEY = 'egg_overpull_day';

function findScroller(el) {
  let node = el;
  while (node && node !== document.body) {
    const overflow = window.getComputedStyle(node).overflowY;
    if (/(auto|scroll)/.test(overflow) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement;
}

// Pull down from the top of the page to reload its data. The page's own scroll
// container is found at touch time, so this works wherever it's mounted.
export default function PullToRefresh({ onRefresh, children }) {
  const wrapRef = useRef(null);
  const scroller = useRef(null);
  const startY = useRef(null);
  const farthest = useRef(0);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleStart = (e) => {
    if (busy) return;
    scroller.current = findScroller(wrapRef.current);
    if ((scroller.current?.scrollTop || 0) > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
    farthest.current = 0;
  };

  const handleMove = (e) => {
    if (startY.current === null || busy) return;
    if ((scroller.current?.scrollTop || 0) > 0) {
      startY.current = null;
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy > farthest.current) farthest.current = dy;
    setPull(dy > 0 ? Math.min(dy * 0.5, 180) : 0);
  };

  const eggToday = () => {
    const today = new Date().toDateString();
    try {
      if (localStorage.getItem(EGG_DAY_KEY) === today) return false;
      localStorage.setItem(EGG_DAY_KEY, today);
    } catch { /* no storage: show it */ }
    return true;
  };

  const handleEnd = async () => {
    const distance = pull;
    const dragged = farthest.current;
    startY.current = null;
    farthest.current = 0;
    setPull(0);
    if (distance < THRESHOLD) return;

    if (dragged >= EGG_FINGER_PX && eggToday()) {
      showEggBadge({
        emoji: '🫗',
        title: "That's plenty. It's refreshed.",
        body: "Go sit down.",
      });
    }

    setBusy(true);
    try {
      await onRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const showing = busy || pull > 8;

  return (
    <div
      ref={wrapRef}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: busy ? 48 : pull }}
      >
        {showing && (
          <RefreshCw
            className={`w-5 h-5 ${busy ? 'animate-spin text-gray-400' : pull >= THRESHOLD ? 'text-emerald-500' : 'text-gray-400'}`}
            style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }}
          />
        )}
      </div>
      <div style={{ transform: `translateY(${busy ? 0 : pull * 0.15}px)` }}>
        {children}
      </div>
    </div>
  );
}