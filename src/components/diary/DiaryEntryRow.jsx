import React from "react";
import { format, parseISO } from "date-fns";
import { ChevronRight, ImageIcon } from "lucide-react";
import { normalizeStickers } from "./stickerNormalize";

// One line in the diary list — date, a peek at the writing, and the stickers
// the user put on it.
export default function DiaryEntryRow({ entry, onOpen }) {
  const stickers = normalizeStickers(entry.stickers);
  const preview = (entry.content || "").replace(/\s+/g, " ").trim();

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="w-full text-left rounded-xl border bg-white px-4 py-3 flex items-center gap-3 hover:border-gray-300"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">
          {format(parseISO(entry.entry_date), "EEEE, MMMM d, yyyy")}
        </p>
        <p className="text-xs text-gray-600 truncate mt-0.5">
          {preview || "Nothing written yet"}
        </p>
        <div className="flex items-center gap-1 mt-1">
          {stickers.slice(0, 6).map((s, i) => (
            <span key={i} className="text-base leading-none">
              {s.char}
            </span>
          ))}
          {entry.images?.length > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-gray-500 ml-1">
              <ImageIcon className="w-3 h-3" />
              {entry.images.length}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </button>
  );
}