import React, { useRef, useState, useEffect } from "react";
import { X } from "lucide-react";

const BASE_IMG = 64; // px at scale 1
const SIZES = [1, 1.4, 1.8, 2.2]; // tapping a second finger steps through these

// Stickers float above the page and can be dragged anywhere on it. Positions
// are stored as percentages so a sticker keeps its spot across screen sizes.
// Tapping a sticker (without dragging) selects it and shows a little X so it
// can be removed. While dragging, putting a SECOND finger down grows the
// sticker a step (and wraps back to normal size after the biggest step).
export default function StickerLayer({ stickers = [], onMove, onRemove, onScale }) {
  const layerRef = useRef(null);
  const dragIndex = useRef(null);
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

  // Second finger anywhere on screen while a sticker is being dragged = resize.
  useEffect(() => {
    if (!onScale) return;
    const onExtraPointer = () => {
      const i = dragIndex.current;
      if (i === null) return;
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
    movedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragIndex.current === null) return;
    e.preventDefault();
    movedRef.current = true;
    const pos = positionFromEvent(e);
    if (pos) onMove(dragIndex.current, pos);
  };

  const handlePointerUp = () => {
    const i = dragIndex.current;
    if (i !== null && !movedRef.current) {
      setSelected((prev) => (prev === i ? null : i));
    }
    dragIndex.current = null;
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
            }}
            onPointerDown={handlePointerDown(i)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={() => { setSelected(null); onRemove?.(i); }}
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
                className={`leading-none drop-shadow-sm ${selected === i ? "opacity-70" : ""}`}
                style={{ fontSize: `${30 * scale}px` }}
              >
                {s.char}
              </span>
            )}
            {onRemove && selected === i && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { setSelected(null); onRemove(i); }}
                className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 shadow"
                aria-label="Remove sticker"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}