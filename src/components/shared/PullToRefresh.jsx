import React, { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { showEggBadge } from "../eastereggs/eggBadge";

const THRESHOLD = 70;   // pull this far to refresh
const EGG = 115;        // pull well past it and something else happens

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
  };

  const handleMove = (e) => {
    if (startY.current === null || busy) return;
    if ((scroller.current?.scrollTop || 0) > 0) {
      startY.current = null;
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    setPull(dy > 0 ? Math.min(dy * 0.5, 180) : 0);
  };

  const handleEnd = async () => {
    const distance = pull;
    startY.current = null;
    setPull(0);
    if (distance < THRESHOLD) return;

    if (distance >= EGG) {
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
            className={`w-5 h-5 text-gray-400 ${busy ? 'animate-spin' : ''}`}
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