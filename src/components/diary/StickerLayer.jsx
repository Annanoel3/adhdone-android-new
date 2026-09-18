import React, { useRef } from "react";

// Stickers float above the page and can be dragged anywhere on it. Positions
// are stored as percentages so a sticker keeps its spot across screen sizes.
export default function StickerLayer({ stickers = [], onMove, onRemove }) {
  const layerRef = useRef(null);
  const dragIndex = useRef(null);

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
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragIndex.current === null) return;
    e.preventDefault();
    const pos = positionFromEvent(e);
    if (pos) onMove(dragIndex.current, pos);
  };

  const handlePointerUp = () => {
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
          onDoubleClick={() => onRemove?.(i)}
        >
          <span className="text-3xl leading-none drop-shadow-sm">{s.char}</span>
        </div>
      ))}
    </div>
  );
}