import React, { useRef, useState, useEffect } from "react";
import { X } from "lucide-react";

const BASE_IMG = 64; // px at scale 1
const SIZES = [1, 1.4, 1.8, 2.2]; // an extra finger steps through these
const MOVE_THRESHOLD = 8; // px of finger wobble that still counts as a tap

// Stickers float above the page and can be dragged anywhere on it. Positions
// are stored as percentages so a sticker keeps its spot across screen sizes.
// Tapping a sticker (without dragging) selects it and shows an X so it can be
// removed. While dragging, putting a SECOND finger down grows the sticker a
// step (wrapping back to normal size after the biggest step).
export default function StickerLayer({ stickers = [], onMove, onRemove, onScale }) {
  const layerRef = useRef(null);
  const dragIndex = useRef(null);
  const dragPointerId = useRef(null);
  const startPoint = useRef(null);
  const movedRef = useRef(false);
  const [selected, setSelected] = useState(null);

  const positionFromEvent = (e) => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.min(96, Math.max(0, ((e.clientX - box.left) / box.width) * 100)),
      y: Math.min(97, Math.max(0, ((e.clientY - box.top) / box.height) * 100)),
    };
  };

  // A second finger anywhere on screen while a sticker is being dragged resizes
  // it. The pointerId check matters: the dragging finger's own pointerdown also
  // bubbles up to window, and without it every single tap resized the sticker.
  useEffect(() => {
    if (!onScale) return;
    const onExtraPointer = (e) => {
      const i = dragIndex.current;
      if (i === null || e.pointerId === dragPointerId.current) return;
      const current = stickers[i]?.scale || 1;
      const next = SIZES[(SIZES.findIndex((s) => s >= current - 0.01) + 1) % SIZES.length];
      onScale(i, next);
    };
    window.addEventListener("pointerdown", onExtraPointer);
    return () => window.removeEventListener("pointerdown", onExtraPointer);
  }, [onScale, stickers]);

  const handlePointerDown = (i) => (e) => {
    if (!onMove) return;
    if (dragIndex.current !== null) return; // second finger — handled as resize
    dragIndex.current = i;
    dragPointerId.current = e.pointerId;
    startPoint.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragIndex.current === null || e.pointerId !== dragPointerId.current) return;
    e.preventDefault();
    // Fingers never hold perfectly still — only treat it as a drag once it has
    // actually travelled, otherwise a tap could never select the sticker.
    const start = startPoint.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < MOVE_THRESHOLD) return;
    movedRef.current = true;
    const pos = positionFromEvent(e);
    if (pos) onMove(dragIndex.current, pos);
  };

  const handlePointerUp = (e) => {
    if (e && e.pointerId !== dragPointerId.current) return;
    const i = dragIndex.current;
    if (i !== null && !movedRef.current) {
      setSelected((prev) => (prev === i ? null : i));
    }
    dragIndex.current = null;
    dragPointerId.current = null;
  };

  return (
    <div
      ref={layerRef}
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      {stickers.map((s, i) => {
        const scale = s.scale || 1;
        return (
          <div
            key={`${s.src || s.char}-${i}`}
            className="absolute select-none"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              pointerEvents: onMove ? "auto" : "none",
              touchAction: "none",
              cursor: onMove ? "grab" : "default",
              zIndex: selected === i ? 20 : 10,
            }}
            onPointerDown={handlePointerDown(i)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {s.src ? (
              <img
                src={s.src}
                alt=""
                draggable={false}
                className={`object-contain drop-shadow-sm ${selected === i ? "opacity-70" : ""}`}
                style={{ width: BASE_IMG * scale, height: BASE_IMG * scale }}
              />
            ) : (
              <span
                className={`block leading-none drop-shadow-sm ${selected === i ? "opacity-70" : ""}`}
                style={{ fontSize: `${30 * scale}px` }}
              >
                {s.char}
              </span>
            )}
            {onRemove && selected === i && (
              <button
                type="button"
                onPointerDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(null);
                  onRemove(i);
                }}
                className="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center bg-gray-900 text-white rounded-full shadow-lg"
                style={{ touchAction: "manipulation" }}
                aria-label="Remove sticker"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}