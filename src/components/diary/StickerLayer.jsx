import React, { useRef, useState } from "react";
import { X } from "lucide-react";

// Stickers float above the page and can be dragged anywhere on it. Positions
// are stored as percentages so a sticker keeps its spot across screen sizes.
// Tapping a sticker (without dragging it) selects it and shows a little X so it
// can be removed — dragging never selects, so moving one doesn't pop up the X.
export default function StickerLayer({ stickers = [], onMove, onRemove }) {
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

  const handlePointerDown = (i) => (e) => {
    if (!onMove) return;
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
      {stickers.map((s, i) => (
        <div
          key={`${s.char}-${i}`}
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
          <span className={`text-3xl leading-none drop-shadow-sm ${selected === i ? "opacity-70" : ""}`}>
            {s.char}
          </span>
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
      ))}
    </div>
  );
}