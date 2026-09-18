import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { searchStickers, stickerKey, warmStickerImages } from "./stickerLibrary";

export default function StickerPicker({ onPick }) {
  const [query, setQuery] = useState("");
  useEffect(warmStickerImages, []);
  const results = searchStickers(query);

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search stickers — tired, proud, coffee..."
      />
      {results.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">No stickers for "{query}"</p>
      ) : (
        <div className="grid grid-cols-6 gap-1 max-h-56 overflow-y-auto">
          {results.map((s) => (
            <button
              key={stickerKey(s)}
              type="button"
              onClick={() => onPick(s)}
              className="text-2xl rounded-lg py-1.5 hover:bg-gray-100 flex items-center justify-center"
              title={s.tags.split(" ")[0]}
            >
              {s.src ? (
                <img
                  src={s.src}
                  alt={s.tags.split(" ")[0]}
                  loading="eager"
                  decoding="async"
                  className="w-8 h-8 object-contain"
                />
              ) : (
                s.char
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}