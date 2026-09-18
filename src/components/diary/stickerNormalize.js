// Stickers used to be plain characters with no position. Anything without
// coordinates gets laid out along the top of the page so old entries still
// render, and becomes draggable from there. A sticker is either an emoji
// (`char`) or an illustration (`src`), and carries its own `scale`.
export function normalizeStickers(stickers = []) {
  return stickers.map((s, i) => {
    if (typeof s === "string") return { char: s, x: 8 + (i % 8) * 11, y: 4, scale: 1 };
    return {
      ...(s.src ? { src: s.src } : { char: s.char }),
      x: typeof s.x === "number" ? s.x : 8 + (i % 8) * 11,
      y: typeof s.y === "number" ? s.y : 4,
      scale: typeof s.scale === "number" ? s.scale : 1,
    };
  });
}