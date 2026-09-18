import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Check, Loader2, ImagePlus, Smile, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import VoiceTaskInput from "@/components/tasks/VoiceTaskInput";
import StickerPicker from "./StickerPicker";
import StickerLayer from "./StickerLayer";
import PrivateImage from "./PrivateImage";
import { normalizeStickers } from "./stickerNormalize";

const LINE_HEIGHT = 34;

export default function DiaryEditor({ entry, dateKey, initialContent = "", onSave, onBack }) {
  const [content, setContent] = useState(entry?.content || initialContent);
  const [stickers, setStickers] = useState(normalizeStickers(entry?.stickers));
  const [images, setImages] = useState(entry?.images || []);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setContent(entry?.content || initialContent);
    setStickers(normalizeStickers(entry?.stickers));
    setImages(entry?.images || []);
    setSavedAt(null);
  }, [entry?.id, initialContent]);

  const dirty =
    content !== (entry?.content || "") ||
    JSON.stringify(stickers) !== JSON.stringify(normalizeStickers(entry?.stickers)) ||
    JSON.stringify(images) !== JSON.stringify(entry?.images || []);

  const save = async () => {
    setSaving(true);
    await onSave({ content, stickers, images });
    setSaving(false);
    setSavedAt(new Date());
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file });
      if (res?.file_uri) setImages((prev) => [...prev, res.file_uri]);
    } finally {
      setUploading(false);
    }
  };

  const dateLabel = format(
    entry?.entry_date ? parseISO(entry.entry_date) : parseISO(dateKey),
    "EEEE, MMMM d, yyyy"
  );

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to entries">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <p className="text-base font-semibold text-gray-900">{dateLabel}</p>
      </div>

      {/* Lined paper — the writing sits between the rules, stickers float on top
          and can be dragged anywhere on the sheet. */}
      <div className="relative flex-1 mx-4 mt-3 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "#fffdf5",
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0px, transparent 33px, #dbeafe 33px, #dbeafe 34px)",
          }}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write whatever's in your head..."
          className="relative w-full bg-transparent border-0 outline-none resize-none px-5 text-gray-900 placeholder:text-gray-400"
          style={{
            lineHeight: `${LINE_HEIGHT}px`,
            fontSize: "17px",
            paddingTop: "6px",
            minHeight: `${LINE_HEIGHT * 14}px`,
          }}
          rows={14}
        />

        {images.length > 0 && (
          <div className="relative px-5 pb-4 flex flex-wrap gap-2">
            {images.map((uri) => (
              <div key={uri} className="relative">
                <PrivateImage
                  fileUri={uri}
                  className="w-20 h-20 rounded-lg object-cover border border-amber-200"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== uri))}
                  className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <StickerLayer
          stickers={stickers}
          onMove={(i, pos) =>
            setStickers((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...pos } : s)))
          }
          onRemove={(i) => setStickers((prev) => prev.filter((_, idx) => idx !== i))}
        />
      </div>

      <div className="flex items-center gap-2 p-4">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Add picture"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
        </Button>

        {/* Speak the entry — transcription lands at the end of what's written. */}
        <VoiceTaskInput
          onTranscription={(text) =>
            setContent((prev) => (prev ? `${prev.replace(/\s*$/, "")}\n${text}` : text))
          }
        />

        <Popover open={stickersOpen} onOpenChange={setStickersOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Add sticker">
              <Smile className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <StickerPicker
              onPick={(char) => {
                setStickers((prev) => [...prev, { char, x: 40, y: 8 }]);
                setStickersOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <Button onClick={save} disabled={saving || !dirty} className="flex-1">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving
            </>
          ) : (
            "Save"
          )}
        </Button>
        {!dirty && savedAt && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
      </div>
      <p className="px-4 pb-4 text-xs text-gray-400">
        Drag a sticker anywhere on the page — double-tap it to remove.
      </p>
    </div>
  );
}