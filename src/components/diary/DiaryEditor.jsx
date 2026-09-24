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
import { warmStickerImages } from "./stickerLibrary";

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
  useEffect(warmStickerImages, []); // image stickers ready before the picker opens
  // What the page last handed to the server. Used both to know when there's
  // something new worth saving, and to recognise our OWN save coming back as a
  // fresh `entry` prop — without that, the reset below would wipe any keystroke
  // typed while a save was in flight.
  const lastSavedRef = useRef(JSON.stringify({
    content: entry?.content || "",
    stickers: normalizeStickers(entry?.stickers),
    images: entry?.images || [],
  }));

  useEffect(() => {
    const incoming = JSON.stringify({
      content: entry?.content || "",
      stickers: normalizeStickers(entry?.stickers),
      images: entry?.images || [],
    });
    if (incoming === lastSavedRef.current) return; // our own autosave echoing back
    lastSavedRef.current = incoming;
    setContent(entry?.content || initialContent);
    setStickers(normalizeStickers(entry?.stickers));
    setImages(entry?.images || []);
    setSavedAt(null);
  }, [entry?.id, initialContent]);

  const snapshot = JSON.stringify({ content, stickers, images });
  const dirty = snapshot !== lastSavedRef.current;

  const save = async () => {
    const pending = { content, stickers, images };
    lastSavedRef.current = JSON.stringify(pending);
    setSaving(true);
    try {
      await onSave(pending);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  // Autosave — a short pause in typing writes the page. No Save button to
  // forget, which is the whole point for an ADHD diary.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => saveRef.current(), 1200);
    return () => clearTimeout(id);
  }, [snapshot, dirty]);

  // Leaving the page (back button, closing the app) flushes anything the
  // debounce hasn't written yet.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => () => { if (dirtyRef.current) saveRef.current(); }, []);

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

  // Dark theme: a black sheet with light writing, instead of the cream page.
  let dark = false;
  try { dark = localStorage.getItem('adhd_theme') === 'dark'; } catch (e) { /* light */ }

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
        <p className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{dateLabel}</p>
      </div>

      {/* Lined paper — the writing sits between the rules, stickers float on top
          and can be dragged anywhere on the sheet. */}
      <div className={`relative flex-1 mx-4 mt-3 rounded-xl border shadow-sm overflow-hidden ${dark ? 'border-gray-700' : 'border-amber-200'}`}>
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: dark ? "#000000" : "#fffdf5",
            backgroundImage: dark
              ? "repeating-linear-gradient(to bottom, transparent 0px, transparent 33px, #374151 33px, #374151 34px)"
              : "repeating-linear-gradient(to bottom, transparent 0px, transparent 33px, #dbeafe 33px, #dbeafe 34px)",
          }}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write whatever's in your head..."
          className={`relative w-full bg-transparent border-0 outline-none resize-none px-5 ${dark ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'}`}
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
          onScale={(i, scale) =>
            setStickers((prev) => prev.map((s, idx) => (idx === i ? { ...s, scale } : s)))
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
              onPick={(picked) => {
                const s = picked.src ? { src: picked.src } : { char: picked.char };
                setStickers((prev) => [...prev, { ...s, x: 40, y: 8, scale: 1 }]);
                setStickersOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <div className="flex-1 flex justify-end pr-1">
          {saving ? (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </span>
          ) : dirty ? (
            <span className="text-xs text-gray-400">Unsaved changes…</span>
          ) : savedAt ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600">
              <Check className="w-3.5 h-3.5" />
              Saved automatically
            </span>
          ) : null}
        </div>
      </div>
      <p className="px-4 pb-4 text-xs text-gray-400">
        Drag a sticker anywhere on the page — tap a second finger down while dragging to resize it,
        or tap it to show the ✕ and remove it.
      </p>
    </div>
  );
}