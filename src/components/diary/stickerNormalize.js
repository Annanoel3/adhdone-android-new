// Stickers used to be plain characters with no position. Anything without
// coordinates gets laid out along the top of the page so old entries still
// render, and becomes draggable from there.
export function normalizeStickers(stickers = []) {
  return stickers.map((s, i) => {
    if (typeof s === "string") return { char: s, x: 8 + (i % 8) * 11, y: 4 };
    return {
      char: s.char,
      x: typeof s.x === "number" ? s.x : 8 + (i % 8) * 11,
      y: typeof s.y === "number" ? s.y : 4,
    };
  });
}