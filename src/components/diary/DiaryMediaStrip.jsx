import React from "react";
import { X } from "lucide-react";
import PrivateImage from "./PrivateImage";

export default function DiaryMediaStrip({ images = [], stickers = [], onRemoveImage, onRemoveSticker }) {
  if (!images.length && !stickers.length) return null;

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((uri) => (
            <div key={uri} className="relative">
              <PrivateImage
                fileUri={uri}
                className="w-24 h-24 rounded-lg object-cover border"
              />
              {onRemoveImage && (
                <button
                  type="button"
                  onClick={() => onRemoveImage(uri)}
                  className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {stickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stickers.map((char, i) => (
            <span key={`${char}-${i}`} className="relative text-3xl leading-none">
              {char}
              {onRemoveSticker && (
                <button
                  type="button"
                  onClick={() => onRemoveSticker(i)}
                  className="absolute -top-1 -right-2 bg-gray-900 text-white rounded-full p-0.5"
                  aria-label="Remove sticker"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}